use crate::{model::*, native, store, AppState};
use fuzzy_matcher::{skim::SkimMatcherV2, FuzzyMatcher};
use notify::Watcher;
use pinyin::ToPinyin;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{atomic::Ordering, mpsc, Arc},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager};
use winreg::{enums::*, RegKey};

const APP_PATHS_KEY: &str = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths";

pub fn hash(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))[..24].into()
}

pub fn prepare_search(app: &mut Application) {
    let mut fields = Vec::new();
    let mut initials = Vec::new();
    let mut sources = vec![app.name.clone(), app.original_name.clone()];
    sources.extend(
        app.alias
            .split([',', '\u{FF0C}', ';', '\u{FF1B}', '\n'])
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned),
    );

    for source in sources {
        let text = source.to_lowercase();
        if text.is_empty() {
            continue;
        }

        let mut romanized = String::new();
        let mut initial = String::new();
        for c in text.chars() {
            if let Some(pinyin) = c.to_pinyin() {
                romanized.push_str(pinyin.plain());
                initial.push(pinyin.first_letter().chars().next().unwrap_or_default());
            } else {
                romanized.push(c);
                if c.is_ascii_alphanumeric() {
                    initial.push(c);
                }
            }
        }

        push_unique(&mut fields, text);
        push_unique(&mut fields, romanized);
        push_unique(&mut initials, initial);
    }

    app.search_fields = fields;
    app.search_initials = initials;
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if !value.is_empty() && !values.iter().any(|existing| existing == &value) {
        values.push(value);
    }
}

pub fn sort_library(apps: &mut [Application]) {
    apps.sort_by(|a, b| {
        b.pinned
            .cmp(&a.pinned)
            .then(a.order.cmp(&b.order))
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
}

pub fn search(apps: &[Application], query: &str, limit: usize) -> Vec<Application> {
    let query = query.trim().to_lowercase();
    let matcher = SkimMatcherV2::default();
    let query_length = query.chars().count();
    let mut scored = Vec::new();
    for app in apps
        .iter()
        .filter(|a| !a.hidden && !a.filtered && !a.excluded)
    {
        let name = app.name.to_lowercase();
        let base = if query.is_empty() {
            0
        } else if app.search_fields.iter().any(|field| field == &query) {
            100_000
        } else if name.starts_with(&query) {
            80_000
        } else if app
            .search_fields
            .iter()
            .any(|field| field.starts_with(&query))
        {
            75_000
        } else if app
            .search_initials
            .iter()
            .any(|initials| initials.starts_with(&query))
        {
            65_000
        } else if app.search_fields.iter().any(|field| field.contains(&query)) {
            50_000
        } else if query_length >= 3 {
            app.search_fields
                .iter()
                .filter_map(|field| accepted_fuzzy_score(&matcher, field, &query))
                .max()
                .unwrap_or(-1)
        } else {
            continue;
        };
        if base < 0 {
            continue;
        }
        let score = base
            + if app.pinned { 2000 } else { 0 }
            + (app.launch_count.min(100) as i64 * 10)
            + if app.last_launched > now().saturating_sub(86400 * 7) {
                300
            } else {
                0
            };
        scored.push((score, app));
    }
    scored.sort_by(|(sa, a), (sb, b)| {
        sb.cmp(sa)
            .then(a.order.cmp(&b.order))
            .then(a.name.cmp(&b.name))
    });
    scored
        .into_iter()
        .take(limit.min(10000))
        .map(|(_, a)| a.clone())
        .collect()
}

fn accepted_fuzzy_score(matcher: &SkimMatcherV2, field: &str, query: &str) -> Option<i64> {
    let (score, positions) = matcher.fuzzy_indices(field, query)?;
    let query_length = query.chars().count();
    if positions.len() != query_length {
        return None;
    }

    let first = *positions.first()? as usize;
    let last = *positions.last()? as usize;
    let span = last.saturating_sub(first).saturating_add(1);
    let max_gap = positions
        .windows(2)
        .map(|pair| {
            (pair[1] as usize)
                .saturating_sub(pair[0] as usize)
                .saturating_sub(1)
        })
        .max()
        .unwrap_or(0);
    let max_span = query_length.saturating_mul(4).saturating_add(2);
    let minimum_score = query_length as i64 * 10;

    // Fuzzy matching is a fallback for longer queries, not permission to pick
    // scattered characters from an unrelated long name or pinyin string.
    if span > max_span || max_gap > 8 || (score as i64) < minimum_score {
        return None;
    }
    Some((score as i64).min(10_000))
}

fn default_directory_sources() -> Vec<ScanSource> {
    use windows::Win32::UI::Shell::*;
    [
        ("programs-user", "当前用户开始菜单", FOLDERID_Programs),
        ("programs-public", "公共开始菜单", FOLDERID_CommonPrograms),
        ("desktop-user", "当前用户桌面", FOLDERID_Desktop),
        ("desktop-public", "公共桌面", FOLDERID_PublicDesktop),
    ]
    .into_iter()
    .filter_map(|(id, name, folder)| {
        native::known_path(&folder).map(|path| ScanSource {
            id: id.into(),
            name: name.into(),
            path,
            kind: ScanSourceKind::Directory,
        })
    })
    .collect()
}

pub fn default_directories() -> Vec<PathBuf> {
    default_directory_sources()
        .into_iter()
        .map(|source| PathBuf::from(source.path))
        .collect()
}

pub fn builtin_scan_sources() -> Vec<ScanSource> {
    let mut sources = default_directory_sources();
    for (id, name, hive) in [
        ("app-paths-user", "App Paths · 当前用户", "HKEY_CURRENT_USER"),
        ("app-paths-machine", "App Paths · 所有用户", "HKEY_LOCAL_MACHINE"),
    ] {
        sources.push(ScanSource {
            id: id.into(),
            name: name.into(),
            path: format!("{hive}\\{APP_PATHS_KEY}"),
            kind: ScanSourceKind::Registry,
        });
    }
    sources.push(ScanSource {
        id: "windows-apps".into(),
        name: "Windows 打包应用".into(),
        path: "shell:AppsFolder".into(),
        kind: ScanSourceKind::Shell,
    });
    sources
}

fn category(name: &str) -> String {
    let n = name.to_lowercase();
    let groups: &[(&str, &[&str])] = &[
        (
            "社交",
            &[
                "wechat", "weixin", "微信", "qq", "discord", "telegram", "slack", "钉钉", "飞书",
                "teams", "zoom", "电话", "联系人", "信息",
            ],
        ),
        (
            "开发者工具",
            &[
                "visual studio",
                "code",
                "terminal",
                "powershell",
                "python",
                "git",
                "docker",
                "idea",
                "cursor",
                "rust",
                "postman",
                "codex",
                "antigravity",
                "typora",
                "chatgpt",
                "开发",
            ],
        ),
        (
            "工具",
            &[
                "settings",
                "设置",
                "系统设置",
                "calculator",
                "计算器",
                "notepad",
                "记事本",
                "explorer",
                "资源管理",
                "7-zip",
                "winrar",
                "任务管理",
                "control",
                "控制",
                "uu",
                "v2ray",
                "clash",
                "百度网盘",
                "网盘",
                "夸克",
                "查找",
                "放大镜",
                "密码",
                "时钟",
            ],
        ),
        (
            "效率与财务",
            &[
                "office",
                "word",
                "excel",
                "powerpoint",
                "onenote",
                "notion",
                "obsidian",
                "wps",
                "笔记",
                "备忘录",
                "股市",
                "日历",
                "邮件",
                "mail",
                "outlook",
                "alipay",
                "财务",
                "银行",
            ],
        ),
        (
            "娱乐",
            &[
                "steam", "epic", "spotify", "music", "音乐", "bilibili", "哔哩", "vlc", "游戏",
                "xbox", "播客", "国际象棋", "家庭", "tv", "视频", "影视",
            ],
        ),
        (
            "创意",
            &[
                "adobe",
                "photoshop",
                "illustrator",
                "figma",
                "blender",
                "davinci",
                "obs",
                "剪映",
                "affinity",
                "paint",
                "画图",
                "库乐队",
                "garageband",
            ],
        ),
        (
            "信息与阅读",
            &[
                "book",
                "reader",
                "阅读",
                "微信读书",
                "news",
                "新闻",
                "地图",
                "不背单词",
                "天气",
                "知乎",
            ],
        ),
    ];
    groups
        .iter()
        .find(|(_, words)| words.iter().any(|w| n.contains(w)))
        .map(|(c, _)| *c)
        .unwrap_or("其他")
        .into()
}

fn filter_reason(name: &str, path: &str) -> Option<String> {
    let n = name.to_lowercase();
    let file = Path::new(path)
        .file_stem()
        .and_then(|p| p.to_str())
        .unwrap_or("")
        .to_lowercase();
    if ["uninstall", "unins0", "卸载", "remove "]
        .iter()
        .any(|s| n.contains(s) || file.contains(s))
    {
        Some("卸载程序".into())
    } else if [
        "crashpad",
        "crashreport",
        "update",
        "updater",
        "helper",
        "setup",
        "installer",
    ]
    .iter()
    .any(|s| file.contains(s))
    {
        Some("更新、安装或辅助程序".into())
    } else {
        None
    }
}

fn resolved_target_available(target: &str) -> bool {
    let path = Path::new(target);
    !path
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
        || path.is_file()
}

pub fn make_app(path: &Path, source: &str, icon_dir: &Path) -> Application {
    let target = path.to_string_lossy().into_owned();
    let name = path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    let is_link = path
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("lnk"));
    let shortcut = if is_link {
        native::shortcut_info(path)
    } else {
        None
    };
    let identity = shortcut
        .as_ref()
        .map(|info| info.identity.clone())
        .unwrap_or_else(|| target.to_lowercase());
    let reason = filter_reason(&name, &target);
    let id = hash(&identity);
    let icon = cached_icon(&target, false, &id, icon_dir);
    let available = path.is_file()
        && shortcut
            .as_ref()
            .map(|info| resolved_target_available(&info.target))
            .unwrap_or(true);
    Application {
        id,
        category: category(&name),
        original_name: name.clone(),
        name,
        target,
        resolved_target: if is_link {
            shortcut.as_ref().map(|info| info.target.clone())
        } else {
            Some(path.to_string_lossy().into_owned())
        },
        launch_arguments: shortcut
            .as_ref()
            .map(|info| info.arguments.clone())
            .filter(|value| !value.is_empty()),
        working_directory: shortcut
            .as_ref()
            .map(|info| info.working_directory.clone())
            .filter(|value| !value.is_empty()),
        kind: if is_link { "shortcut" } else { "executable" }.into(),
        source: source.into(),
        icon,
        alias: String::new(),
        pinned: false,
        hidden: false,
        filtered: reason.is_some(),
        filter_reason: reason,
        available,
        excluded: false,
        order: 0,
        launch_count: 0,
        last_launched: 0,
        search_fields: Vec::new(),
        search_initials: Vec::new(),
    }
}

fn cached_icon(target: &str, packaged: bool, id: &str, dir: &Path) -> Option<String> {
    let stamp = std::fs::metadata(target)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let path = dir.join(format!("{id}-{stamp}.png"));
    if path.exists() || native::extract_icon(target, packaged, &path).is_ok() {
        Some(path.to_string_lossy().into_owned())
    } else {
        None
    }
}

fn registry_apps() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        for view in [KEY_WOW64_64KEY, KEY_WOW64_32KEY] {
            if let Ok(root) = RegKey::predef(hive).open_subkey_with_flags(
                APP_PATHS_KEY,
                KEY_READ | view,
            ) {
                for name in root.enum_keys().flatten() {
                    if let Ok(key) = root.open_subkey(name) {
                        if let Ok(path) = key.get_value::<String, _>("") {
                            let path = PathBuf::from(path.trim_matches('"'));
                            if path.is_file()
                                && path
                                    .extension()
                                    .is_some_and(|e| e.eq_ignore_ascii_case("exe"))
                            {
                                paths.push(path);
                            }
                        }
                    }
                }
            }
        }
    }
    paths
}

pub fn scan(app: &AppHandle) {
    let state = app.state::<Arc<AppState>>().inner().clone();
    {
        let mut scan = state.scan.lock().unwrap();
        if scan.running {
            state.rescan_pending.store(true, Ordering::Relaxed);
            return;
        }
        *scan = ScanStatus {
            running: true,
            ..Default::default()
        };
    }
    state.cancel_scan.store(false, Ordering::Relaxed);
    let _ = app.emit("scan-progress", state.scan.lock().unwrap().clone());
    let app = app.clone();
    std::thread::spawn(move || {
        let result = scan_inner(&app, &state);
        {
            let mut scan = state.scan.lock().unwrap();
            scan.running = false;
            scan.cancelled = state.cancel_scan.load(Ordering::Relaxed);
            scan.finished_at = now();
            if let Err(error) = result {
                scan.errors.push(error);
            }
            let _ = app.emit("scan-progress", scan.clone());
        }
        let _ = app.emit("catalog-changed", ());
        if state.rescan_pending.swap(false, Ordering::Relaxed) {
            scan(&app);
        }
    });
}

fn scan_inner(app: &AppHandle, state: &Arc<AppState>) -> Result<(), String> {
    let _com = native::Com::init()?;
    let settings = state.settings.read().unwrap().clone();
    let mut roots: Vec<ScanDirectory> = default_directories()
        .into_iter()
        .map(|p| ScanDirectory {
            id: hash(&p.to_string_lossy()),
            path: p.to_string_lossy().into_owned(),
            enabled: true,
            recursive: true,
            exclusions: vec![],
        })
        .collect();
    roots.extend(settings.directories.iter().filter(|d| d.enabled).cloned());
    let active_sources: std::collections::HashSet<_> =
        roots.iter().map(|d| d.path.to_lowercase()).collect();
    let mut found = HashMap::<String, Application>::new();
    let mut last_event = Instant::now();
    let mut visited = 0;
    let mut errors = Vec::new();
    for root in roots {
        if !Path::new(&root.path).exists() {
            errors.push(format!("目录暂不可用：{}", root.path));
            continue;
        }
        let exclusions: Vec<_> = root
            .exclusions
            .iter()
            .map(|e| e.to_lowercase())
            .filter(|e| !e.is_empty())
            .collect();
        let walker = walkdir::WalkDir::new(&root.path)
            .follow_links(false)
            .max_depth(if root.recursive { 64 } else { 1 })
            .into_iter()
            .filter_entry(|entry| {
                let p = entry.path().to_string_lossy().to_lowercase();
                !exclusions.iter().any(|e| p.contains(e)) && !entry.file_type().is_symlink()
            });
        for entry in walker {
            if state.cancel_scan.load(Ordering::Relaxed) {
                return Ok(());
            }
            let entry = match entry {
                Ok(e) => e,
                Err(e) => {
                    if errors.len() < 50 {
                        errors.push(e.to_string());
                    }
                    continue;
                }
            };
            if !entry.file_type().is_file() {
                continue;
            }
            visited += 1;
            let path = entry.path();
            if path
                .extension()
                .and_then(|e| e.to_str())
                .is_some_and(|e| e.eq_ignore_ascii_case("exe") || e.eq_ignore_ascii_case("lnk"))
            {
                let application = make_app(path, &root.path, &state.icon_dir);
                found.entry(application.id.clone()).or_insert(application);
            }
            if last_event.elapsed() > Duration::from_millis(200) {
                let mut scan = state.scan.lock().unwrap();
                scan.scanned = visited;
                scan.found = found.len();
                let _ = app.emit("scan-progress", scan.clone());
                last_event = Instant::now();
            }
        }
    }
    for path in registry_apps() {
        if state.cancel_scan.load(Ordering::Relaxed) {
            return Ok(());
        }
        let item = make_app(&path, "App Paths", &state.icon_dir);
        found.entry(item.id.clone()).or_insert(item);
    }
    let mut packaged_complete = true;
    match native::packaged_apps() {
        Ok(items) => {
            for (name, id) in items {
                if state.cancel_scan.load(Ordering::Relaxed) {
                    return Ok(());
                }
                let key = hash(&id.to_lowercase());
                let icon = cached_icon(&id, true, &key, &state.icon_dir);
                found.entry(key.clone()).or_insert(Application {
                    id: key,
                    category: category(&name),
                    original_name: name.clone(),
                    name,
                    target: id,
                    resolved_target: None,
                    launch_arguments: None,
                    working_directory: None,
                    kind: "packaged".into(),
                    source: "Windows Apps".into(),
                    icon,
                    alias: String::new(),
                    pinned: false,
                    hidden: false,
                    filtered: false,
                    filter_reason: None,
                    available: true,
                    excluded: false,
                    order: 0,
                    launch_count: 0,
                    last_launched: 0,
                    search_fields: Vec::new(),
                    search_initials: Vec::new(),
                });
            }
        }
        Err(e) => {
            packaged_complete = false;
            errors.push(format!("Windows 应用目录：{e}"));
        }
    }
    if state.cancel_scan.load(Ordering::Relaxed) {
        return Ok(());
    }
    // Serialize commit with edits/manual additions; reload overrides and usage in the same critical section.
    let mut db = state.db.lock().unwrap();
    for old in store::read_apps(&db).map_err(|e| e.to_string())? {
        if !found.contains_key(&old.id) {
            let mut old = old;
            old.available = if old.kind == "packaged" {
                !packaged_complete && old.available
            } else if old.kind == "shortcut" {
                Path::new(&old.target).is_file()
                    && old
                        .resolved_target
                        .as_deref()
                        .map(resolved_target_available)
                        .unwrap_or(true)
            } else {
                Path::new(&old.target).is_file()
            };
            old.excluded = !["手动添加", "App Paths", "Windows Apps"]
                .contains(&old.source.as_str())
                && !active_sources.contains(&old.source.to_lowercase());
            found.insert(old.id.clone(), old);
        }
    }
    let apps: Vec<_> = found.into_values().collect();
    store::save_apps(&mut db, &apps)?;
    *state.apps.write().unwrap() = store::read_apps(&db).map_err(|e| e.to_string())?;
    let mut scan = state.scan.lock().unwrap();
    scan.scanned = visited;
    scan.found = apps.len();
    scan.errors = errors;
    // Obsolete icon variants are unreferenced after a successful scan.
    let used: std::collections::HashSet<_> = apps.iter().filter_map(|a| a.icon.as_ref()).collect();
    if let Ok(files) = std::fs::read_dir(&state.icon_dir) {
        for file in files.flatten() {
            let p = file.path();
            if p.extension().is_some_and(|e| e == "png")
                && !used.contains(&p.to_string_lossy().into_owned())
                && file
                    .metadata()
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|t| t.elapsed().ok())
                    .is_some_and(|age| age > Duration::from_secs(86400))
            {
                let _ = std::fs::remove_file(p);
            }
        }
    }
    Ok(())
}

pub fn watch(app: &AppHandle) {
    let state = app.state::<Arc<AppState>>();
    let settings = state.settings.read().unwrap().clone();
    let mut roots = default_directories();
    roots.extend(
        settings
            .directories
            .iter()
            .filter(|d| d.enabled)
            .map(|d| PathBuf::from(&d.path)),
    );
    let (tx, rx) = mpsc::channel();
    let cache_root = state.icon_dir.parent().map(|p| p.to_owned());
    let watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        if let Ok(event) = event {
            let relevant = event.paths.iter().any(|p| {
                !cache_root.as_ref().is_some_and(|root| p.starts_with(root))
                    && (p.is_dir()
                        || p.extension().is_none()
                        || p.extension().and_then(|e| e.to_str()).is_some_and(|e| {
                            e.eq_ignore_ascii_case("exe") || e.eq_ignore_ascii_case("lnk")
                        }))
            });
            if relevant && !matches!(event.kind, notify::EventKind::Access(_)) {
                let _ = tx.send(());
            }
        }
    });
    match watcher {
        Ok(mut watcher) => {
            for root in roots {
                if root.exists() {
                    if let Err(e) = watcher.watch(&root, notify::RecursiveMode::Recursive) {
                        state
                            .startup_errors
                            .lock()
                            .unwrap()
                            .push(format!("目录监听失败：{}：{e}", root.display()));
                    }
                }
            }
            *state.watcher.lock().unwrap() = Some(watcher);
            let app = app.clone();
            std::thread::spawn(move || {
                while rx.recv().is_ok() {
                    loop {
                        match rx.recv_timeout(Duration::from_millis(900)) {
                            Ok(_) => continue,
                            Err(mpsc::RecvTimeoutError::Timeout) => break,
                            Err(mpsc::RecvTimeoutError::Disconnected) => return,
                        }
                    }
                    scan(&app);
                }
            });
        }
        Err(e) => state
            .startup_errors
            .lock()
            .unwrap()
            .push(format!("无法启用目录监听：{e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn app(name: &str, original_name: &str) -> Application {
        Application {
            id: name.to_lowercase(),
            name: name.into(),
            original_name: original_name.into(),
            target: String::new(),
            resolved_target: None,
            launch_arguments: None,
            working_directory: None,
            kind: "executable".into(),
            source: "test".into(),
            category: "其他".into(),
            icon: None,
            alias: String::new(),
            pinned: false,
            hidden: false,
            filtered: false,
            filter_reason: None,
            available: true,
            excluded: false,
            order: 0,
            launch_count: 0,
            last_launched: 0,
            search_fields: Vec::new(),
            search_initials: Vec::new(),
        }
    }

    #[test]
    fn short_queries_do_not_use_scattered_fuzzy_matches() {
        let mut qq = app("QQ", "QQ");
        let mut weather = app("天气", "天气");
        let mut calculator = app("计算器", "计算器");
        let mut quark = app("quark", "quark");
        for item in [&mut qq, &mut weather, &mut calculator, &mut quark] {
            prepare_search(item);
        }

        let results = search(&[qq, weather, calculator, quark], "qq", 100);
        assert_eq!(
            results
                .iter()
                .map(|item| item.name.as_str())
                .collect::<Vec<_>>(),
            vec!["QQ"]
        );
    }

    #[test]
    fn pinyin_initials_aliases_and_long_fuzzy_queries_still_work() {
        let mut weather = app("天气", "天气");
        let mut visual_studio = app("Visual Studio Code", "Visual Studio Code");
        let mut wechat = app("微信", "微信");
        wechat.alias = "wx, 常用聊天".into();
        for item in [&mut weather, &mut visual_studio, &mut wechat] {
            prepare_search(item);
        }

        assert_eq!(search(&[weather.clone()], "tianqi", 100).len(), 1);
        assert_eq!(search(&[weather], "tq", 100).len(), 1);
        assert_eq!(search(&[wechat], "wx", 100).len(), 1);
        assert_eq!(search(&[visual_studio], "vscode", 100).len(), 1);
    }
}
