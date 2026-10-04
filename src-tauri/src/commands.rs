use crate::{catalog, files, hotkeys, material, model::*, native, store, windows, AppState};
use serde::{Deserialize, Serialize};
use std::{
    path::Path,
    sync::{atomic::Ordering, Arc},
};
use tauri::{AppHandle, Emitter, State, WebviewWindow};

type Shared<'a> = State<'a, Arc<AppState>>;

#[tauri::command]
pub fn bootstrap(app: AppHandle, state: Shared<'_>) -> Result<Bootstrap, String> {
    Ok(Bootstrap {
        settings: state.settings.read().unwrap().clone(),
        apps: state.apps.read().unwrap().clone(),
        scan: state.scan.lock().unwrap().clone(),
        scan_sources: catalog::builtin_scan_sources(),
        monitors: windows::monitors(&app),
        capture_paused: state.capture_paused.load(Ordering::Relaxed),
        startup_errors: state.startup_errors.lock().unwrap().clone(),
        start_hidden: std::env::args().any(|a| a == "--background"),
        backdrop: windows::backdrop_state(&app),
    })
}

#[tauri::command]
pub fn update_material(
    app: AppHandle,
    window: WebviewWindow,
    scene: MaterialScene,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("只有启动器可以更新材质布局".into());
    }
    scene.validate()?;
    let handle = app.clone();
    app.run_on_main_thread(move || material::update(&handle, &window, &scene))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn preview_material(
    app: AppHandle,
    window: WebviewWindow,
    appearance: MaterialAppearance,
) -> Result<(), String> {
    if window.label() != "settings" {
        return Err("只有设置窗口可以发起材质预览".into());
    }
    appearance.validate()?;
    windows::show(&app, "apps", false)?;
    // Transient appearance only: never change shortcuts, autostart or persisted settings.
    app.emit_to("main", "material-preview", appearance)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_apps(
    state: Shared<'_>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<Application>, String> {
    if query.chars().count() > 256 {
        return Err("搜索内容过长".into());
    }
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        catalog::search(&state.apps.read().unwrap(), &query, limit.unwrap_or(100))
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_items(
    state: Shared<'_>,
    query: String,
    scope: String,
    limit: Option<usize>,
) -> Result<SearchResponse, String> {
    if query.chars().count() > 256 {
        return Err("搜索内容过长".into());
    }
    if !["all", "apps", "files"].contains(&scope.as_str()) {
        return Err("未知搜索范围".into());
    }
    let state = state.inner().clone();
    let generation = {
        let mut file_results = state.file_results.write().unwrap();
        let generation = files::next_generation(&state.file_search_generation);
        file_results.clear();
        generation
    };
    tauri::async_runtime::spawn_blocking(move || {
        let requested = limit.unwrap_or(100).min(10_000);
        let result_limit = if scope == "apps" {
            requested
        } else {
            requested.min(100)
        };
        let mut apps = Vec::new();
        if scope == "all" || scope == "apps" {
            apps = catalog::search(&state.apps.read().unwrap(), &query, result_limit);
        }
        let mut results: Vec<SearchItem> = apps
            .into_iter()
            .map(|app| SearchItem::App { app })
            .collect();
        let mut file_provider = "notUsed".to_string();
        let mut file_detail = None;
        if scope == "all" || scope == "files" {
            let settings = state.settings.read().unwrap().clone();
            let file_results =
                files::search(&query, &settings, &state.file_search_generation, generation);
            file_provider = file_results.provider.into();
            file_detail = file_results.detail;
            results.extend(file_results.items);
        }
        if scope == "all" {
            results.sort_by(|a, b| {
                mixed_score(b, &query)
                    .cmp(&mixed_score(a, &query))
                    .then_with(|| mixed_kind(a).cmp(&mixed_kind(b)))
                    .then_with(|| mixed_name(a).cmp(&mixed_name(b)))
            });
            results.truncate(result_limit);
        }
        {
            let mut file_results = state.file_results.write().unwrap();
            if state.file_search_generation.load(Ordering::Relaxed) == generation {
                *file_results = results
                    .iter()
                    .filter_map(|item| match item {
                        SearchItem::File { file } => Some(file.clone()),
                        SearchItem::App { .. } => None,
                    })
                    .collect();
            }
        }
        Ok(SearchResponse {
            items: results,
            file_provider,
            file_detail,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn file_preview(
    state: Shared<'_>,
    id: String,
    preview_key: String,
) -> Result<FilePreview, String> {
    if [&id, &preview_key]
        .iter()
        .any(|key| key.len() != 24 || !key.bytes().all(|byte| byte.is_ascii_hexdigit()))
    {
        return Err("无效的文件预览标识".into());
    }
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        // Serialize Shell extraction without holding catalog or database locks.
        let _preview = state.file_preview_lock.lock().unwrap();
        let file = state
            .file_results
            .read()
            .unwrap()
            .iter()
            .find(|file| file.id == id && file.preview_key.as_deref() == Some(preview_key.as_str()))
            .cloned()
            .ok_or("文件已不在当前搜索结果中")?;
        files::preview(&file, &state.icon_dir)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn mixed_kind(item: &SearchItem) -> u8 {
    match item {
        SearchItem::App { .. } => 0,
        SearchItem::File { .. } => 1,
    }
}

fn mixed_name(item: &SearchItem) -> String {
    match item {
        SearchItem::App { app } => app.name.to_lowercase(),
        SearchItem::File { file } => file.name.to_lowercase(),
    }
}

fn mixed_score(item: &SearchItem, query: &str) -> i64 {
    let query = query.trim().to_lowercase();
    let name = mixed_name(item);
    let path = match item {
        SearchItem::App { app } => app.target.to_lowercase(),
        SearchItem::File { file } => file.path.to_lowercase(),
    };
    let base = if name == query {
        100_000
    } else if name.starts_with(&query) {
        80_000
    } else if name.contains(&query) {
        50_000
    } else if path.contains(&query) {
        30_000
    } else {
        0
    };
    base + match item {
        SearchItem::App { app } => {
            if app.pinned {
                2_000
            } else {
                0
            }
        }
        SearchItem::File { .. } => 0,
    }
}

#[tauri::command]
pub async fn launch_app(app: AppHandle, state: Shared<'_>, id: String) -> Result<(), String> {
    let item = state
        .apps
        .read()
        .unwrap()
        .iter()
        .find(|a| a.id == id)
        .cloned()
        .ok_or("应用不存在，请重新扫描")?;
    let target = item.target.clone();
    let kind = item.kind.clone();
    tauri::async_runtime::spawn_blocking(move || native::launch(&target, &kind))
        .await
        .map_err(|e| e.to_string())??;
    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT INTO usage (id,count,last) VALUES (?1,1,?2)
        ON CONFLICT(id) DO UPDATE SET count=count+1,last=excluded.last",
        rusqlite::params![id, now()],
    )
    .map_err(|e| e.to_string())?;
    if let Some(item) = state.apps.write().unwrap().iter_mut().find(|a| a.id == id) {
        item.launch_count += 1;
        item.last_launched = now();
    }
    windows::hide(&app);
    Ok(())
}

#[tauri::command]
pub fn start_scan(app: AppHandle) {
    catalog::scan(&app);
}

#[tauri::command]
pub fn cancel_scan(state: Shared<'_>) {
    state.rescan_pending.store(false, Ordering::Relaxed);
    state.cancel_scan.store(true, Ordering::Relaxed);
}

fn commit_settings(
    app: &AppHandle,
    state: &Arc<AppState>,
    settings: Settings,
) -> Result<(), String> {
    settings.validate()?;
    let old = state.settings.read().unwrap().clone();
    hotkeys::configure(app, &settings)?;
    if settings.autostart != old.autostart {
        if let Err(e) = native::autostart(settings.autostart) {
            let _ = hotkeys::configure(app, &old);
            return Err(format!("无法保存开机启动设置：{e}"));
        }
    }
    if let Err(e) = store::save_settings(&state.db.lock().unwrap(), &settings) {
        let _ = hotkeys::configure(app, &old);
        if old.autostart != settings.autostart {
            let _ = native::autostart(old.autostart);
        }
        return Err(e);
    }
    let directories_changed = serde_json::to_string(&old.directories).ok()
        != serde_json::to_string(&settings.directories).ok();
    *state.settings.write().unwrap() = settings.clone();
    windows::apply_appearance(app);
    let _ = app.emit("settings-changed", &settings);
    if directories_changed {
        catalog::watch(app);
        catalog::scan(app);
    }
    Ok(())
}

#[tauri::command]
pub fn save_settings(app: AppHandle, state: Shared<'_>, settings: Settings) -> Result<(), String> {
    commit_settings(&app, state.inner(), settings)
}

#[tauri::command]
pub fn update_app(app: AppHandle, state: Shared<'_>, value: AppOverride) -> Result<(), String> {
    if value.name.chars().count() > 100
        || value.alias.chars().count() > 200
        || value.category.chars().count() > 20
    {
        return Err("名称或别名过长".into());
    }
    let db = state.db.lock().unwrap();
    if !state.apps.read().unwrap().iter().any(|a| a.id == value.id) {
        return Err("应用不存在".into());
    }
    store::save_override(&db, &value)?;
    {
        let mut apps = state.apps.write().unwrap();
        if let Some(item) = apps.iter_mut().find(|item| item.id == value.id) {
            store::apply_override(item, &value);
            catalog::prepare_search(item);
        }
        catalog::sort_library(&mut apps);
    }
    let _ = app.emit("catalog-changed", ());
    Ok(())
}

#[tauri::command]
pub async fn add_app(app: AppHandle, state: Shared<'_>, path: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(path);
    if !path.is_absolute()
        || !path.is_file()
        || !path
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| ["exe", "lnk"].contains(&e.to_lowercase().as_str()))
    {
        return Err("请选择本地 .exe 或 .lnk 文件".into());
    }
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _com = native::Com::init()?;
        let mut item = catalog::make_app(&path, "手动添加", &state.icon_dir);
        item.filtered = false;
        let mut db = state.db.lock().unwrap();
        store::save_apps(&mut db, &[item])?;
        *state.apps.write().unwrap() = store::read_apps(&db).map_err(|e| e.to_string())?;
        let _ = app.emit("catalog-changed", ());
        Ok::<_, String>(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    files::open(&path)
}

#[tauri::command]
pub fn reveal_file(path: String) -> Result<(), String> {
    files::reveal(&path)
}

#[tauri::command]
pub fn show_view(app: AppHandle, mode: String, toggle: Option<bool>) -> Result<(), String> {
    windows::show(&app, &mode, toggle.unwrap_or(false))
}

#[tauri::command]
pub fn hide_launcher(app: AppHandle) {
    windows::hide(&app);
}

#[tauri::command]
pub async fn open_settings(app: AppHandle) -> Result<(), String> {
    windows::settings(&app)
}

#[tauri::command]
pub fn resize_launcher(app: AppHandle, height: f64) -> Result<(), String> {
    if !height.is_finite() {
        return Err("窗口高度无效".into());
    }
    windows::resize_launcher(&app, height)
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportedConfig {
    version: u32,
    settings: Settings,
    apps: Vec<AppOverride>,
}

#[tauri::command]
pub fn export_config(state: Shared<'_>, path: String) -> Result<(), String> {
    validate_config_path(&path)?;
    let config = ExportedConfig {
        version: 1,
        settings: state.settings.read().unwrap().clone(),
        apps: store::overrides(&state.db.lock().unwrap())?,
    };
    std::fs::write(
        path,
        serde_json::to_vec_pretty(&config).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_config(app: AppHandle, state: Shared<'_>, path: String) -> Result<(), String> {
    validate_config_path(&path)?;
    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if metadata.len() > 8 * 1024 * 1024 {
        return Err("配置文件超过 8 MB".into());
    }
    let config: ExportedConfig =
        serde_json::from_slice(&std::fs::read(path).map_err(|e| e.to_string())?)
            .map_err(|e| format!("配置文件无效：{e}"))?;
    if config.version != 1 {
        return Err("不支持此配置版本".into());
    }
    for item in &config.apps {
        if item.name.chars().count() > 100
            || item.alias.chars().count() > 200
            || item.category.chars().count() > 20
        {
            return Err("配置中的应用字段过长".into());
        }
    }
    // Imported preferences never silently enable OS autostart or a different Win-key policy.
    let mut settings = config.settings;
    let old = state.settings.read().unwrap().clone();
    settings.autostart = old.autostart;
    settings.capture_win = old.capture_win;
    commit_settings(&app, state.inner(), settings)?;
    let mut db = state.db.lock().unwrap();
    let tx = db.transaction().map_err(|e| e.to_string())?;
    for item in config.apps {
        store::save_override(&tx, &item)?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    *state.apps.write().unwrap() = store::read_apps(&db).map_err(|e| e.to_string())?;
    let _ = app.emit("catalog-changed", ());
    Ok(())
}

fn validate_config_path(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    if !p.is_absolute()
        || !p
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("json"))
    {
        Err("配置文件必须是绝对路径的 JSON 文件".into())
    } else {
        Ok(())
    }
}

#[tauri::command]
pub fn reset_settings(app: AppHandle, state: Shared<'_>) -> Result<(), String> {
    commit_settings(&app, state.inner(), Settings::default())
}

#[tauri::command]
pub fn set_capture_paused(app: AppHandle, paused: bool) {
    windows::set_capture_paused(&app, paused);
}

#[tauri::command]
pub fn set_shortcut_recording(app: AppHandle, recording: bool) -> Result<(), String> {
    hotkeys::recording(&app, recording)
}
