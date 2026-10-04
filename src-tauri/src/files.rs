use crate::{
    catalog,
    model::{FilePreview, FileResult, SearchItem, Settings},
    native,
};
use std::{
    collections::HashSet,
    os::windows::{fs::MetadataExt, process::CommandExt},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, Instant},
};
use walkdir::WalkDir;
use windows::Win32::Storage::FileSystem::{
    FILE_ATTRIBUTE_OFFLINE, FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS, FILE_ATTRIBUTE_RECALL_ON_OPEN,
};

const RESULT_LIMIT: usize = 100;
const EVERYTHING_TIMEOUT: Duration = Duration::from_millis(800);
const FALLBACK_TIMEOUT: Duration = Duration::from_millis(1200);
const PREVIEW_CACHE_LIMIT: usize = 256;
const PREVIEW_SIZE_LIMIT: u64 = 128 * 1024 * 1024;

pub struct FileSearchResult {
    pub items: Vec<SearchItem>,
    pub provider: &'static str,
    pub detail: Option<String>,
}

pub fn search(
    query: &str,
    settings: &Settings,
    generation: &AtomicU64,
    current_generation: u64,
) -> FileSearchResult {
    let query = query.trim();
    if generation.load(Ordering::Relaxed) != current_generation {
        return FileSearchResult {
            items: Vec::new(),
            provider: "notUsed",
            detail: None,
        };
    }
    if !settings.file_search.enabled || query.is_empty() {
        return FileSearchResult {
            items: Vec::new(),
            provider: "disabled",
            detail: Some("文件搜索已在设置中关闭".into()),
        };
    }
    if settings.file_search.everything_enabled {
        match everything(query, &settings.file_search.everything_path) {
            Ok(paths) => {
                return FileSearchResult {
                    items: paths
                        .into_iter()
                        .filter_map(|path| make_result(&path))
                        .take(RESULT_LIMIT)
                        .map(|file| SearchItem::File { file })
                        .collect(),
                    provider: "everything",
                    detail: Some("已调用 es.exe".into()),
                };
            }
            Err(error) if !settings.file_search.fallback_enabled => {
                return FileSearchResult {
                    items: Vec::new(),
                    provider: "unavailable",
                    detail: Some(error),
                };
            }
            Err(error) => {
                let items = fallback(query, settings, generation, current_generation)
                    .into_iter()
                    .map(|file| SearchItem::File { file })
                    .collect();
                return FileSearchResult {
                    items,
                    provider: "fallback",
                    detail: Some(format!("Everything 未使用：{error}")),
                };
            }
        }
    }
    if !settings.file_search.fallback_enabled {
        return FileSearchResult {
            items: Vec::new(),
            provider: "disabled",
            detail: Some("Everything 和降级搜索都已关闭".into()),
        };
    }
    FileSearchResult {
        items: fallback(query, settings, generation, current_generation)
            .into_iter()
            .map(|file| SearchItem::File { file })
            .collect(),
        provider: "fallback",
        detail: Some("已使用本地降级搜索".into()),
    }
}

pub fn next_generation(generation: &AtomicU64) -> u64 {
    generation.fetch_add(1, Ordering::Relaxed) + 1
}

pub fn open(path: &str) -> Result<(), String> {
    let path = validate_existing_path(path)?;
    native::open_path(&path)
}

pub fn reveal(path: &str) -> Result<(), String> {
    let path = validate_existing_path(path)?;
    native::reveal_path(&path)
}

pub fn preview(file: &FileResult, icon_dir: &Path) -> Result<FilePreview, String> {
    let unavailable = |detail: &str| FilePreview {
        thumbnail: None,
        detail: Some(detail.into()),
    };
    let Some(expected_key) = &file.preview_key else {
        return Ok(unavailable("此文件类型不支持图片预览"));
    };
    let path = validate_existing_path(&file.path)?;
    let metadata = std::fs::metadata(&path).map_err(|e| format!("无法读取图片信息：{e}"))?;
    if !metadata.is_file() || !is_image(&path) {
        return Err("预览目标必须是图片文件".into());
    }
    let offline = FILE_ATTRIBUTE_OFFLINE.0
        | FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS.0
        | FILE_ATTRIBUTE_RECALL_ON_OPEN.0;
    if metadata.file_attributes() & offline != 0 {
        return Ok(unavailable("图片尚未下载到本机"));
    }
    if metadata.len() > PREVIEW_SIZE_LIMIT {
        return Ok(unavailable("图片超过 128 MB，无法生成预览"));
    }
    if &preview_key(&path, &metadata) != expected_key {
        return Ok(unavailable("图片已修改，请重新搜索"));
    }
    let cache_dir = icon_dir.join("file-previews");
    std::fs::create_dir_all(&cache_dir).map_err(|e| format!("无法创建图片预览缓存：{e}"))?;
    let output = cache_dir.join(format!("{expected_key}.png"));
    if !output.is_file() {
        let temporary = cache_dir.join(format!("{expected_key}.tmp.png"));
        if let Err(error) = generate_thumbnail(&path, &temporary) {
            let _ = std::fs::remove_file(&temporary);
            return Ok(unavailable(&error));
        }
        // Do not publish a partially written or outdated thumbnail.
        let unchanged = std::fs::metadata(&path)
            .is_ok_and(|metadata| preview_key(&path, &metadata) == *expected_key);
        if !unchanged {
            let _ = std::fs::remove_file(&temporary);
            return Ok(unavailable("图片已修改，请重新搜索"));
        }
        if let Err(error) = std::fs::rename(&temporary, &output) {
            let _ = std::fs::remove_file(&temporary);
            return Err(format!("无法保存图片预览缓存：{error}"));
        }
        trim_preview_cache(&cache_dir, &output);
    }
    Ok(FilePreview {
        thumbnail: Some(output.to_string_lossy().into_owned()),
        detail: None,
    })
}

fn generate_thumbnail(path: &Path, output: &Path) -> Result<(), String> {
    let is_png = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("png") || extension.eq_ignore_ascii_case("apng")
        });
    if !is_png {
        return native::extract_thumbnail(path, output);
    }

    // PNG already has a bundled decoder; do not depend on Shell thumbnail handlers.
    let mut reader =
        image::ImageReader::open(path).map_err(|e| format!("无法读取 PNG 图片：{e}"))?;
    reader.set_format(image::ImageFormat::Png);
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(16384);
    limits.max_image_height = Some(16384);
    limits.max_alloc = Some(64 * 1024 * 1024);
    reader.limits(limits);
    let image = reader
        .decode()
        .map_err(|e| format!("PNG 图片解码失败或超过预览资源限制：{e}"))?;
    image
        .thumbnail(512, 512)
        .save_with_format(output, image::ImageFormat::Png)
        .map_err(|e| format!("无法保存 PNG 图片预览：{e}"))
}

fn is_image(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "png"
                    | "jpg"
                    | "jpeg"
                    | "jpe"
                    | "jfif"
                    | "gif"
                    | "bmp"
                    | "dib"
                    | "tif"
                    | "tiff"
                    | "webp"
                    | "avif"
                    | "heic"
                    | "heif"
                    | "ico"
                    | "svg"
                    | "apng"
            )
        })
}

fn preview_key(path: &Path, metadata: &std::fs::Metadata) -> String {
    catalog::hash(&format!(
        "preview-v2:{}:{}:{:?}",
        path.to_string_lossy().to_lowercase(),
        metadata.len(),
        metadata.modified().ok()
    ))
}

fn trim_preview_cache(directory: &Path, keep: &Path) {
    let Ok(entries) = std::fs::read_dir(directory) else {
        return;
    };
    let mut cached: Vec<_> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            let metadata = entry.metadata().ok()?;
            (metadata.is_file() && path.extension().is_some_and(|ext| ext == "png"))
                .then_some((path, metadata.modified().ok()))
        })
        .collect();
    cached.sort_by_key(|(_, modified)| *modified);
    let excess = cached.len().saturating_sub(PREVIEW_CACHE_LIMIT);
    for (path, _) in cached
        .into_iter()
        .filter(|(path, _)| path.as_path() != keep)
        .take(excess)
    {
        let _ = std::fs::remove_file(path);
    }
}

fn everything(query: &str, configured_path: &str) -> Result<Vec<PathBuf>, String> {
    let executable = find_es(configured_path).ok_or_else(|| {
        if configured_path.trim().is_empty() {
            "未找到 es.exe".to_string()
        } else {
            format!("找不到配置的 es.exe：{configured_path}")
        }
    })?;
    let output_path = std::env::temp_dir().join(format!(
        "winspot-es-{}-{}.txt",
        std::process::id(),
        catalog::hash(&format!("{:?}", Instant::now()))
    ));
    let output_arg = output_path.to_string_lossy().into_owned();
    let mut child = Command::new(executable)
        .args([
            "-n",
            "100",
            "-full-path-and-name",
            "-no-header",
            "-export-txt",
        ])
        .arg(&output_arg)
        .arg(query)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|e| format!("无法启动 es.exe：{e}"))?;
    let started = Instant::now();
    let status = loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|e| format!("读取 es.exe 状态失败：{e}"))?
        {
            break status;
        }
        if started.elapsed() >= EVERYTHING_TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            let _ = std::fs::remove_file(&output_path);
            return Err("es.exe 调用超时，可能是 Everything 未运行".into());
        }
        std::thread::sleep(Duration::from_millis(10));
    };
    if !status.success() {
        let _ = std::fs::remove_file(&output_path);
        return Err(format!("es.exe 返回失败状态：{status}"));
    }
    let output = match std::fs::read_to_string(&output_path) {
        Ok(output) => output,
        Err(error) => {
            let _ = std::fs::remove_file(&output_path);
            return Err(format!("读取 es.exe UTF-8 导出失败：{error}"));
        }
    };
    let _ = std::fs::remove_file(&output_path);
    let output = output.strip_prefix('\u{feff}').unwrap_or(&output);
    let paths = output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(PathBuf::from)
        .collect::<Vec<_>>();
    Ok(paths)
}

fn find_es(configured_path: &str) -> Option<PathBuf> {
    if !configured_path.trim().is_empty() {
        let path = PathBuf::from(configured_path);
        return path.is_file().then_some(path);
    }
    let mut candidates = Vec::new();
    if let Ok(path) = std::env::var("PATH") {
        candidates.extend(std::env::split_paths(&path).map(|dir| dir.join("es.exe")));
    }
    for variable in ["ProgramFiles", "ProgramFiles(x86)", "LocalAppData"] {
        if let Ok(root) = std::env::var(variable) {
            let root = PathBuf::from(root);
            candidates.push(root.join("Everything").join("es.exe"));
            candidates.push(root.join("Everything").join("bin").join("es.exe"));
        }
    }
    candidates.into_iter().find(|path| path.is_file())
}

fn fallback(
    query: &str,
    settings: &Settings,
    generation: &AtomicU64,
    current_generation: u64,
) -> Vec<FileResult> {
    let roots = fallback_roots(settings);
    let query = query.to_lowercase();
    let started = Instant::now();
    let mut seen = HashSet::new();
    let mut results = Vec::new();
    for (root, recursive, exclusions) in roots {
        if !root.is_dir() {
            continue;
        }
        let walker = WalkDir::new(&root)
            .follow_links(false)
            .max_depth(if recursive { 64 } else { 1 })
            .into_iter()
            .filter_entry(|entry| {
                let text = entry.path().to_string_lossy().to_lowercase();
                !exclusions.iter().any(|part| text.contains(part))
                    && !entry.file_type().is_symlink()
            });
        for entry in walker {
            if generation.load(Ordering::Relaxed) != current_generation
                || started.elapsed() >= FALLBACK_TIMEOUT
            {
                return results;
            }
            let Ok(entry) = entry else { continue };
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            let path_text = path.to_string_lossy().to_lowercase();
            if !name.to_lowercase().contains(&query) && !path_text.contains(&query) {
                continue;
            }
            let key = path_text.clone();
            if !seen.insert(key) {
                continue;
            }
            if let Some(result) = make_result(path) {
                results.push(result);
                if results.len() >= RESULT_LIMIT {
                    return results;
                }
            }
        }
    }
    results.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then(a.path.to_lowercase().cmp(&b.path.to_lowercase()))
    });
    results
}

fn fallback_roots(settings: &Settings) -> Vec<(PathBuf, bool, Vec<String>)> {
    let mut roots = Vec::new();
    for folder in [
        windows::Win32::UI::Shell::FOLDERID_Desktop,
        windows::Win32::UI::Shell::FOLDERID_Documents,
        windows::Win32::UI::Shell::FOLDERID_Downloads,
    ] {
        if let Some(path) = native::known_path(&folder) {
            roots.push((PathBuf::from(path), true, Vec::new()));
        }
    }
    roots.extend(
        settings
            .directories
            .iter()
            .filter(|dir| dir.enabled)
            .map(|dir| {
                (
                    PathBuf::from(&dir.path),
                    dir.recursive,
                    dir.exclusions
                        .iter()
                        .map(|value| value.to_lowercase())
                        .filter(|value| !value.is_empty())
                        .collect(),
                )
            }),
    );
    roots.extend(
        settings
            .file_search
            .directories
            .iter()
            .map(|path| (PathBuf::from(path), true, Vec::new())),
    );
    roots
}

fn make_result(path: &Path) -> Option<FileResult> {
    let metadata = std::fs::metadata(path).ok()?;
    let absolute = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let name = absolute.file_name()?.to_string_lossy().into_owned();
    let kind = if metadata.is_dir() {
        "directory"
    } else {
        "file"
    };
    let extension = absolute
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_owned);
    let size = metadata.is_file().then_some(metadata.len());
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|time| time.as_secs());
    let preview_key =
        (metadata.is_file() && is_image(&absolute)).then(|| preview_key(&absolute, &metadata));
    Some(FileResult {
        id: catalog::hash(&absolute.to_string_lossy().to_lowercase()),
        name,
        path: absolute.to_string_lossy().into_owned(),
        kind: kind.into(),
        extension,
        size,
        modified_at,
        available: true,
        preview_key,
    })
}

fn validate_existing_path(path: &str) -> Result<PathBuf, String> {
    if path.is_empty() || path.encode_utf16().count() > 32767 || path.contains('\0') {
        return Err("无效的文件路径".into());
    }
    let path = PathBuf::from(path);
    if !path.is_absolute() {
        return Err("文件路径必须是绝对路径".into());
    }
    if !path.exists() {
        return Err("文件或文件夹已不存在".into());
    }
    Ok(path)
}
