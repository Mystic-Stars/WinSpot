use crate::{
    material,
    model::{BackdropState, MonitorInfo},
    native, AppState,
};
use std::sync::{atomic::Ordering, Arc};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder,
};

struct PauseMenu(CheckMenuItem<tauri::Wry>);

pub fn create_main(app: &AppHandle) -> Result<tauri::WebviewWindow, tauri::Error> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == "main")
        .expect("main window configuration is missing");
    WebviewWindowBuilder::from_config(app, config)?
        .no_redirection_bitmap(true)
        .build()
}

pub fn set_capture_paused(app: &AppHandle, paused: bool) {
    app.state::<Arc<AppState>>()
        .capture_paused
        .store(paused, Ordering::Relaxed);
    if let Some(menu) = app.try_state::<PauseMenu>() {
        let _ = menu.0.set_checked(paused);
    }
    let _ = app.emit("capture-paused", paused);
}

pub fn monitors(app: &AppHandle) -> Vec<MonitorInfo> {
    app.get_webview_window("main")
        .and_then(|w| w.available_monitors().ok())
        .unwrap_or_default()
        .iter()
        .enumerate()
        .map(|(i, m)| MonitorInfo {
            id: m.name().cloned().unwrap_or_else(|| format!("monitor-{i}")),
            name: format!(
                "{} · {} × {}",
                m.name()
                    .cloned()
                    .unwrap_or_else(|| format!("显示器 {}", i + 1)),
                m.size().width,
                m.size().height
            ),
        })
        .collect()
}

pub fn apply_appearance(app: &AppHandle) {
    let state = app.state::<Arc<AppState>>();
    let settings = state.settings.read().unwrap().clone();
    let theme = match settings.theme.as_str() {
        "dark" => Some(tauri::Theme::Dark),
        "light" => Some(tauri::Theme::Light),
        _ => None,
    };
    for label in ["main", "settings"] {
        if let Some(w) = app.get_webview_window(label) {
            let _ = w.set_theme(theme);
        }
    }
    if let Some(w) = app.get_webview_window("main") {
        native::configure_window_appearance(&w);
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || material::configure(&handle, &w, &settings));
    }
}

pub fn backdrop_state(app: &AppHandle) -> BackdropState {
    let state = app.state::<Arc<AppState>>();
    let mut backdrop = state.backdrop.read().unwrap().clone();
    backdrop.revision = state.transition.load(Ordering::Relaxed);
    backdrop
}

pub fn show(app: &AppHandle, mode: &str, toggle: bool) -> Result<(), String> {
    if !["home", "apps", "files"].contains(&mode) {
        return Err("未知视图".into());
    }
    let window = app.get_webview_window("main").ok_or("启动器窗口不可用")?;
    let state = app.state::<Arc<AppState>>();
    {
        let mut view = state.view.lock().unwrap();
        if toggle && *view == mode && state.visible.load(Ordering::Relaxed) {
            drop(view);
            hide(app);
            return Ok(());
        }
        *view = mode.into();
    }
    let was_visible = state.visible.swap(true, Ordering::Relaxed);
    let token = state.transition.fetch_add(1, Ordering::Relaxed) + 1;
    let settings = state.settings.read().unwrap().clone();
    // Mode changes preserve a manually dragged position.
    if was_visible && window.is_visible().map_err(|e| e.to_string())? {
        apply_appearance(app);
        window
            .emit_to("main", "launcher-show", mode)
            .map_err(|e| e.to_string())?;
        native::focus(&window);
        return Ok(());
    }
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    let cursor = window
        .cursor_position()
        .unwrap_or(PhysicalPosition::new(0.0, 0.0));
    let monitor = monitors
        .iter()
        .find(|m| settings.monitor != "cursor" && m.name().is_some_and(|n| n == &settings.monitor))
        .or_else(|| {
            monitors.iter().find(|m| {
                let p = m.position();
                let s = m.size();
                cursor.x >= p.x as f64
                    && cursor.y >= p.y as f64
                    && cursor.x < p.x as f64 + s.width as f64
                    && cursor.y < p.y as f64 + s.height as f64
            })
        })
        .or(monitors.first())
        .ok_or("没有可用显示器")?;
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let logical_w = area.size.width as f64 / scale;
    let logical_h = area.size.height as f64 / scale;
    let width = 820.0f64.min(logical_w - 32.0).max(480.0);
    let height = 620.0f64.min(logical_h - 40.0).max(360.0);
    let x = area.position.x as f64 + (area.size.width as f64 - width * scale) / 2.0;
    let y = area.position.y as f64 + (logical_h * 0.16).max(24.0) * scale;
    // Position first, so sizing uses the destination monitor's DPI.
    window
        .set_position(PhysicalPosition::new(x as i32, y as i32))
        .map_err(|e| e.to_string())?;
    window
        .set_size(PhysicalSize::new(
            (width * scale) as u32,
            (height * scale) as u32,
        ))
        .map_err(|e| e.to_string())?;
    if state.transition.load(Ordering::Relaxed) != token || !state.visible.load(Ordering::Relaxed) {
        return Ok(());
    }
    apply_appearance(app);
    window
        .emit_to("main", "launcher-show", mode)
        .map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    native::focus(&window);
    Ok(())
}

pub fn hide(app: &AppHandle) {
    let state = app.state::<Arc<AppState>>().inner().clone();
    if !state.visible.swap(false, Ordering::Relaxed) {
        return;
    }
    let token = state.transition.fetch_add(1, Ordering::Relaxed) + 1;
    let delay = if state.settings.read().unwrap().reduced_motion {
        0
    } else {
        140
    };
    let app = app.clone();
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.emit_to("main", "backdrop-changed", backdrop_state(&app));
        let _ = w.emit_to("main", "launcher-hiding", ());
    }
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(delay));
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            if state.transition.load(Ordering::Relaxed) == token
                && !state.visible.load(Ordering::Relaxed)
            {
                if let Some(w) = handle.get_webview_window("main") {
                    let _ = w.hide();
                    material::clear(&w);
                    let _ = w.emit_to("main", "launcher-hidden", ());
                }
            }
        });
    });
}

pub fn resize_launcher(_app: &AppHandle, _height: f64) -> Result<(), String> {
    Ok(())
}

pub fn settings(app: &AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("settings") {
        if w.is_minimized().map_err(|e| e.to_string())? {
            w.unminimize().map_err(|e| e.to_string())?;
        }
        native::configure_window_appearance(&w);
        w.show().map_err(|e| e.to_string())?;
        hide(app);
        native::focus(&w);
        return Ok(());
    }
    let monitor = app
        .get_webview_window("main")
        .and_then(|w| w.current_monitor().ok().flatten());
    let (width, height) = monitor
        .as_ref()
        .map(|m| {
            (
                (m.work_area().size.width as f64 / m.scale_factor() - 32.0).clamp(500.0, 980.0),
                (m.work_area().size.height as f64 / m.scale_factor() - 32.0).clamp(360.0, 740.0),
            )
        })
        .unwrap_or((980.0, 740.0));
    let w = WebviewWindowBuilder::new(
        app,
        "settings",
        WebviewUrl::App("index.html?window=settings".into()),
    )
    .title("WinSpot · 设置")
    .inner_size(width, height)
    .min_inner_size(width.min(760.0), height.min(560.0))
    .visible(false)
    .decorations(false)
    .transparent(false)
    .resizable(true)
    .minimizable(true)
    .maximizable(false)
    .center()
    .build()
    .map_err(|e| e.to_string())?;
    if let Some(monitor) = monitor {
        let area = monitor.work_area();
        let scale = monitor.scale_factor();
        let _ = w.set_position(PhysicalPosition::new(
            area.position.x + ((area.size.width as f64 - width * scale) / 2.0) as i32,
            area.position.y + ((area.size.height as f64 - height * scale) / 2.0) as i32,
        ));
        let _ = w.set_size(PhysicalSize::new(
            (width * scale) as u32,
            (height * scale) as u32,
        ));
    }
    let handle = app.clone();
    w.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            let _ = crate::hotkeys::recording(&handle, false);
        }
    });
    native::configure_window_appearance(&w);
    apply_appearance(app);
    // Show new windows too; hidden WebView initialization must not gate visibility.
    w.show().map_err(|e| e.to_string())?;
    hide(app);
    native::focus(&w);
    Ok(())
}

pub fn create_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let library = MenuItem::with_id(app, "library", "应用程序", true, None::<&str>)?;
    let search = MenuItem::with_id(app, "search", "聚焦搜索", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
    let pause = CheckMenuItem::with_id(app, "pause", "暂停 Win 键接管", true, false, None::<&str>)?;
    app.manage(PauseMenu(pause.clone()));
    let scan = MenuItem::with_id(app, "scan", "重新扫描应用", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出 WinSpot", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[
            &library, &search, &sep, &settings, &scan, &pause, &sep2, &quit,
        ],
    )?;
    let tray_icon = app
        .default_window_icon()
        .cloned()
        .or_else(|| {
            tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png")).ok()
        })
        .ok_or("应用图标不可用")?;
    TrayIconBuilder::with_id("winspot")
        .icon(tray_icon)
        .tooltip("WinSpot")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| {
            let result = match event.id.as_ref() {
                "library" => show(app, "apps", false),
                "search" => show(app, "home", false),
                "settings" => self::settings(app),
                "scan" => {
                    crate::catalog::scan(app);
                    Ok(())
                }
                "pause" => {
                    let paused = pause.is_checked().unwrap_or(false);
                    set_capture_paused(app, paused);
                    Ok(())
                }
                "quit" => {
                    app.exit(0);
                    Ok(())
                }
                _ => Ok(()),
            };
            if let Err(e) = result {
                let _ = app.emit("app-error", e);
            }
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                let _ = show(tray.app_handle(), "apps", true);
            }
        })
        .build(app)?;
    Ok(())
}
