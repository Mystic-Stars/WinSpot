mod catalog;
mod commands;
mod files;
mod hotkeys;
mod material;
mod model;
mod native;
mod store;
mod windows;

use model::{Application, BackdropState, FileResult, ScanStatus, Settings};
use std::sync::{
    atomic::{AtomicBool, AtomicU64},
    Arc, Mutex, RwLock,
};
use tauri::{Emitter, Manager};

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub apps: RwLock<Vec<Application>>,
    pub settings: RwLock<Settings>,
    pub scan: Mutex<ScanStatus>,
    pub cancel_scan: AtomicBool,
    pub rescan_pending: AtomicBool,
    pub capture_paused: AtomicBool,
    pub hook_enabled: AtomicBool,
    pub recording: AtomicBool,
    pub visible: AtomicBool,
    pub transition: AtomicU64,
    pub backdrop: RwLock<BackdropState>,
    pub view: Mutex<String>,
    pub file_search_generation: AtomicU64,
    pub file_results: RwLock<Vec<FileResult>>,
    pub file_preview_lock: Mutex<()>,
    pub startup_errors: Mutex<Vec<String>>,
    pub watcher: Mutex<Option<notify::RecommendedWatcher>>,
    pub icon_dir: std::path::PathBuf,
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            let _ = windows::show(app, "apps", false);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    use tauri_plugin_global_shortcut::ShortcutState;
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    let state = app.state::<Arc<AppState>>();
                    if state.recording.load(std::sync::atomic::Ordering::Relaxed) {
                        return;
                    }
                    let settings = state.settings.read().unwrap().clone();
                    let mode = if settings
                        .search_shortcut
                        .parse::<tauri_plugin_global_shortcut::Shortcut>()
                        .is_ok_and(|s| s.id() == shortcut.id())
                    {
                        "home"
                    } else {
                        "apps"
                    };
                    let _ = windows::show(app, mode, true);
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::update_material,
            commands::preview_material,
            commands::search_apps,
            commands::search_items,
            commands::launch_app,
            commands::start_scan,
            commands::cancel_scan,
            commands::save_settings,
            commands::update_app,
            commands::add_app,
            commands::open_file,
            commands::reveal_file,
            commands::file_preview,
            commands::show_view,
            commands::hide_launcher,
            commands::open_settings,
            commands::resize_launcher,
            commands::export_config,
            commands::import_config,
            commands::reset_settings,
            commands::set_capture_paused,
            commands::set_shortcut_recording
        ])
        .setup(|app| {
            let dir = app.path().app_local_data_dir()?;
            std::fs::create_dir_all(dir.join("icons"))?;
            let db = store::open(&dir.join("winspot.db"))?;
            let settings = store::read_settings(&db)?;
            let apps = store::read_apps(&db)?;
            let state = Arc::new(AppState {
                db: Mutex::new(db),
                apps: RwLock::new(apps),
                settings: RwLock::new(settings.clone()),
                scan: Mutex::new(ScanStatus::default()),
                cancel_scan: AtomicBool::new(false),
                rescan_pending: AtomicBool::new(false),
                capture_paused: AtomicBool::new(false),
                hook_enabled: AtomicBool::new(false),
                recording: AtomicBool::new(false),
                visible: AtomicBool::new(false),
                transition: AtomicU64::new(0),
                backdrop: RwLock::new(BackdropState {
                    available: false,
                    transparency_enabled: native::transparency_enabled(),
                    revision: 0,
                }),
                view: Mutex::new("apps".into()),
                file_search_generation: AtomicU64::new(0),
                file_results: RwLock::new(Vec::new()),
                file_preview_lock: Mutex::new(()),
                startup_errors: Mutex::new(vec![]),
                watcher: Mutex::new(None),
                icon_dir: dir.join("icons"),
            });
            app.manage(state.clone());
            let main = windows::create_main(app.handle())?;
            if settings.autostart {
                if let Err(e) = native::autostart(true) {
                    state
                        .startup_errors
                        .lock()
                        .unwrap()
                        .push(format!("开机启动项无法同步：{e}"));
                }
            }
            if let Err(e) = hotkeys::configure(app.handle(), &settings) {
                state.startup_errors.lock().unwrap().push(e);
            }
            if let Err(e) = hotkeys::start_hook(app.handle().clone()) {
                state.startup_errors.lock().unwrap().push(e);
            }
            windows::create_tray(app.handle())?;
            catalog::watch(app.handle());
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(800));
                catalog::scan(&handle);
            });
            windows::apply_appearance(app.handle());
            let handle = app.handle().clone();
            main.on_window_event(move |event| match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    windows::hide(&handle);
                }
                tauri::WindowEvent::Focused(false) => {
                    // Ignore a transient focus transfer inside WebView/IME; check the native root.
                    let h = handle.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(150));
                        if let Some(w) = h.get_webview_window("main") {
                            if !native::owns_foreground(&w) {
                                windows::hide(&h);
                            }
                        }
                    });
                }
                tauri::WindowEvent::ScaleFactorChanged { .. } | tauri::WindowEvent::Resized(_) => {
                    if let Some(window) = handle.get_webview_window("main") {
                        material::refresh(&handle, &window);
                    }
                }
                _ => {}
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("WinSpot could not start");
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            let state = app.state::<Arc<AppState>>();
            state
                .visible
                .store(false, std::sync::atomic::Ordering::Relaxed);
            state
                .transition
                .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            state
                .cancel_scan
                .store(true, std::sync::atomic::Ordering::Relaxed);
            hotkeys::stop_hook();
            material::shutdown();
            let _ = app.emit("launcher-hidden", ());
        }
    });
}
