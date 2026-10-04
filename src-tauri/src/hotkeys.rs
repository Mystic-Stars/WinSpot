use crate::{model::Settings, AppState};
use std::{
    cell::Cell,
    sync::{
        atomic::{AtomicU32, Ordering},
        mpsc, Arc, Mutex, OnceLock,
    },
};
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
use windows::Win32::{
    Foundation::{LPARAM, LRESULT, WPARAM},
    System::{LibraryLoader::GetModuleHandleW, Threading::GetCurrentThreadId},
    UI::{Input::KeyboardAndMouse::*, WindowsAndMessaging::*},
};

static REGISTERED: Mutex<Vec<Shortcut>> = Mutex::new(Vec::new());
static THREAD_ID: AtomicU32 = AtomicU32::new(0);
static CONTEXT: OnceLock<(Arc<AppState>, mpsc::Sender<()>)> = OnceLock::new();
thread_local! {
    static CANDIDATE: Cell<u32> = const { Cell::new(0) };
    static HELD: Cell<u32> = const { Cell::new(0) };
}

pub fn configure(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let mut desired = Vec::new();
    for text in [&settings.library_shortcut, &settings.search_shortcut] {
        if text == "Super" {
            continue;
        }
        let shortcut: Shortcut = text
            .parse()
            .map_err(|_| format!("无法识别快捷键：{text}"))?;
        if !shortcut
            .mods
            .intersects(Modifiers::CONTROL | Modifiers::ALT | Modifiers::SUPER)
        {
            return Err("快捷键需要包含 Ctrl、Alt 或 Win".into());
        }
        if shortcut.mods == Modifiers::CONTROL && shortcut.key == Code::Escape {
            return Err("Ctrl+Esc 保留给 Windows 开始菜单".into());
        }
        if desired.iter().any(|s: &Shortcut| s.id() == shortcut.id()) {
            return Err("快捷键不能重复".into());
        }
        desired.push(shortcut);
    }
    let mut registered = REGISTERED.lock().map_err(|_| "快捷键服务不可用")?;
    let mut added = Vec::new();
    for shortcut in &desired {
        if registered.iter().any(|s| s.id() == shortcut.id())
            && app.global_shortcut().is_registered(*shortcut)
        {
            continue;
        }
        if let Err(e) = app.global_shortcut().register(*shortcut) {
            for s in added {
                let _ = app.global_shortcut().unregister(s);
            }
            return Err(format!("快捷键已被占用或不可用，原配置已保留：{e}"));
        }
        added.push(*shortcut);
    }
    for shortcut in registered.iter() {
        if !desired.iter().any(|s| s.id() == shortcut.id()) {
            let _ = app.global_shortcut().unregister(*shortcut);
        }
    }
    *registered = desired;
    app.state::<Arc<AppState>>().hook_enabled.store(
        settings.capture_win && settings.library_shortcut == "Super",
        Ordering::Relaxed,
    );
    Ok(())
}

pub fn start_hook(app: AppHandle) -> Result<(), String> {
    let (sender, receiver) = mpsc::channel();
    let state = app.state::<Arc<AppState>>().inner().clone();
    CONTEXT
        .set((state, sender))
        .map_err(|_| "Win 键服务已启动")?;
    let show_app = app.clone();
    std::thread::spawn(move || {
        while receiver.recv().is_ok() {
            let _ = crate::windows::show(&show_app, "apps", true);
        }
    });
    let (ready_tx, ready_rx) = mpsc::sync_channel(1);
    std::thread::spawn(move || unsafe {
        THREAD_ID.store(GetCurrentThreadId(), Ordering::Relaxed);
        let module = GetModuleHandleW(None)
            .ok()
            .map(|h| windows::Win32::Foundation::HINSTANCE(h.0));
        let hook = match SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), module, 0) {
            Ok(hook) => {
                let _ = ready_tx.send(Ok(()));
                hook
            }
            Err(e) => {
                let _ = ready_tx.send(Err(format!("Win 键接管无法启用：{e}")));
                return;
            }
        };
        let mut message = MSG::default();
        while GetMessageW(&mut message, None, 0, 0).0 > 0 {
            let _ = TranslateMessage(&message);
            DispatchMessageW(&message);
        }
        let _ = UnhookWindowsHookEx(hook);
    });
    ready_rx
        .recv()
        .map_err(|_| "Win 键服务启动失败".to_string())?
}

unsafe extern "system" fn keyboard_proc(code: i32, w: WPARAM, l: LPARAM) -> LRESULT {
    if code < 0 {
        return CallNextHookEx(None, code, w, l);
    }
    let key = &*(l.0 as *const KBDLLHOOKSTRUCT);
    if key.flags.contains(LLKHF_INJECTED) {
        return CallNextHookEx(None, code, w, l);
    }
    let Some((state, sender)) = CONTEXT.get() else {
        return CallNextHookEx(None, code, w, l);
    };
    let active =
        state.hook_enabled.load(Ordering::Relaxed) && !state.capture_paused.load(Ordering::Relaxed);
    if !active {
        CANDIDATE.set(0);
        HELD.set(0);
        return CallNextHookEx(None, code, w, l);
    }
    let down = w.0 == WM_KEYDOWN as usize || w.0 == WM_SYSKEYDOWN as usize;
    let up = w.0 == WM_KEYUP as usize || w.0 == WM_SYSKEYUP as usize;
    let win = key.vkCode == VK_LWIN.0 as u32 || key.vkCode == VK_RWIN.0 as u32;
    let bit = if key.vkCode == VK_LWIN.0 as u32 { 1 } else { 2 };
    if win && down {
        // Lock/unlock can omit a release; discard stale held state before accepting a new press.
        let physical = (if GetAsyncKeyState(VK_LWIN.0 as i32) < 0 {
            1
        } else {
            0
        }) | (if GetAsyncKeyState(VK_RWIN.0 as i32) < 0 {
            2
        } else {
            0
        });
        HELD.set(HELD.get() & physical);
        if HELD.get() & bit != 0 {
            return CallNextHookEx(None, code, w, l);
        }
        if HELD.get() == 0 {
            let modified = [VK_CONTROL, VK_MENU, VK_SHIFT]
                .iter()
                .any(|k| GetAsyncKeyState(k.0 as i32) < 0);
            CANDIDATE.set(if modified { u32::MAX } else { key.vkCode });
        } else {
            CANDIDATE.set(u32::MAX);
        }
        HELD.set(HELD.get() | bit);
    } else if down && HELD.get() != 0 {
        CANDIDATE.set(u32::MAX);
    } else if win && up {
        let bare = HELD.get() == bit && CANDIDATE.get() == key.vkCode;
        HELD.set(HELD.get() & !bit);
        if HELD.get() == 0 {
            CANDIDATE.set(0);
        }
        if bare {
            // Forward real Win events unchanged. A harmless menu-mask key prevents Start on release.
            let input = |flags| INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VIRTUAL_KEY(0xFC),
                        dwFlags: flags,
                        ..Default::default()
                    },
                },
            };
            if SendInput(
                &[input(KEYBD_EVENT_FLAGS(0)), input(KEYEVENTF_KEYUP)],
                std::mem::size_of::<INPUT>() as i32,
            ) == 2
            {
                if !state.recording.load(Ordering::Relaxed) {
                    let _ = sender.send(());
                }
            }
        }
    }
    CallNextHookEx(None, code, w, l)
}

pub fn recording(app: &AppHandle, recording: bool) -> Result<(), String> {
    let state = app.state::<Arc<AppState>>();
    state.recording.store(recording, Ordering::Relaxed);
    let registered = REGISTERED.lock().map_err(|_| "快捷键服务不可用")?;
    let mut errors = Vec::new();
    for shortcut in registered.iter() {
        if recording && app.global_shortcut().is_registered(*shortcut) {
            if let Err(e) = app.global_shortcut().unregister(*shortcut) {
                errors.push(e.to_string());
            }
        } else if !app.global_shortcut().is_registered(*shortcut) {
            if !recording {
                if let Err(e) = app.global_shortcut().register(*shortcut) {
                    errors.push(format!("快捷键恢复失败：{e}"));
                }
            }
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("；"))
    }
}

pub fn stop_hook() {
    let id = THREAD_ID.load(Ordering::Relaxed);
    if id != 0 {
        unsafe {
            let _ = PostThreadMessageW(id, WM_QUIT, WPARAM(0), LPARAM(0));
        }
    }
}
