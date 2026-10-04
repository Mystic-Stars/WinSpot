use std::{
    path::{Component, Path, PathBuf, Prefix},
    ptr::null_mut,
};
use tauri::WebviewWindow;
use windows::{
    core::{Interface, PCWSTR, PWSTR},
    Win32::{
        Foundation::{HWND, SIZE},
        Graphics::Gdi::*,
        Storage::EnhancedStorage::PKEY_AppUserModel_ID,
        System::Com::*,
        UI::{Shell::*, WindowsAndMessaging::*},
    },
};

pub fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}

pub struct Com;
impl Com {
    pub fn init() -> Result<Self, String> {
        unsafe {
            CoInitializeEx(None, COINIT_APARTMENTTHREADED)
                .ok()
                .map_err(|e| e.to_string())?;
        }
        Ok(Self)
    }
}
impl Drop for Com {
    fn drop(&mut self) {
        unsafe {
            CoUninitialize();
        }
    }
}

unsafe fn take_string(ptr: PWSTR) -> String {
    let s = ptr.to_string().unwrap_or_default();
    CoTaskMemFree(Some(ptr.0.cast()));
    s
}

#[derive(Debug, Clone)]
pub struct ShortcutInfo {
    pub target: String,
    pub arguments: String,
    pub working_directory: String,
    pub identity: String,
}

pub fn shortcut_info(path: &Path) -> Option<ShortcutInfo> {
    unsafe {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;
        let persist: IPersistFile = link.cast().ok()?;
        let w = wide(&path.to_string_lossy());
        persist.Load(PCWSTR(w.as_ptr()), STGM_READ).ok()?;
        let mut target = [0u16; 32768];
        link.GetPath(&mut target, null_mut(), 0).ok()?;
        let target = String::from_utf16_lossy(
            &target[..target.iter().position(|c| *c == 0).unwrap_or(target.len())],
        );
        if target.is_empty() {
            return None;
        }
        let mut args = [0u16; 8192];
        let mut work = [0u16; 32768];
        let _ = link.GetArguments(&mut args);
        let _ = link.GetWorkingDirectory(&mut work);
        let args = String::from_utf16_lossy(
            &args[..args.iter().position(|c| *c == 0).unwrap_or(args.len())],
        );
        let work = String::from_utf16_lossy(
            &work[..work.iter().position(|c| *c == 0).unwrap_or(work.len())],
        );
        // The ordinary no-argument shortcut and its executable share an identity.
        let default_work = Path::new(&target)
            .parent()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default();
        let custom_work = !work.is_empty() && !work.eq_ignore_ascii_case(&default_work);
        let identity = if args.is_empty() && !custom_work {
            target.to_lowercase()
        } else {
            format!(
                "{}\0{}\0{}",
                target.to_lowercase(),
                args,
                work.to_lowercase()
            )
        };
        Some(ShortcutInfo {
            target,
            arguments: args,
            working_directory: work,
            identity,
        })
    }
}

pub fn known_path(id: &windows::core::GUID) -> Option<String> {
    unsafe {
        SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, None)
            .ok()
            .map(|p| take_string(p))
    }
}

pub fn packaged_apps() -> Result<Vec<(String, String)>, String> {
    unsafe {
        let root: IShellItem = SHGetKnownFolderItem(&FOLDERID_AppsFolder, KF_FLAG_DEFAULT, None)
            .map_err(|e| e.to_string())?;
        let items: IEnumShellItems = root
            .BindToHandler(None, &BHID_EnumItems)
            .map_err(|e| e.to_string())?;
        let mut result = Vec::new();
        loop {
            let mut fetched = 0;
            let mut next = [None];
            if items.Next(&mut next, Some(&mut fetched)).is_err() || fetched == 0 {
                break;
            }
            if let Some(item) = next[0].take() {
                let name = item
                    .GetDisplayName(SIGDN_NORMALDISPLAY)
                    .ok()
                    .map(|s| take_string(s))
                    .unwrap_or_default();
                let id = item
                    .cast::<IShellItem2>()
                    .ok()
                    .and_then(|item| item.GetString(&PKEY_AppUserModel_ID).ok())
                    .map(|s| take_string(s))
                    .unwrap_or_else(|| {
                        let parsing = item
                            .GetDisplayName(SIGDN_DESKTOPABSOLUTEPARSING)
                            .ok()
                            .map(|s| take_string(s))
                            .unwrap_or_default();
                        parsing.rsplit('\\').next().unwrap_or("").to_owned()
                    });
                // Desktop shortcuts are discovered separately; only packaged AUMIDs contain '!'.
                if !name.is_empty() && id.contains('!') && !id.contains('\\') {
                    result.push((name, id));
                }
            }
        }
        Ok(result)
    }
}

pub fn extract_icon(target: &str, packaged: bool, output: &Path) -> Result<(), String> {
    unsafe {
        let path = if packaged {
            format!("shell:AppsFolder\\{target}")
        } else {
            target.into()
        };
        let w = wide(&path);
        let item: IShellItemImageFactory =
            SHCreateItemFromParsingName(PCWSTR(w.as_ptr()), None).map_err(|e| e.to_string())?;
        let bitmap = item
            .GetImage(
                SIZE { cx: 128, cy: 128 },
                SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK,
            )
            .map_err(|e| e.to_string())?;
        let result = save_bitmap(bitmap, output);
        let _ = DeleteObject(bitmap.into());
        result
    }
}

pub fn extract_thumbnail(path: &Path, output: &Path) -> Result<(), String> {
    let _com = Com::init()?;
    let target = wide(&shell_path(path).to_string_lossy());
    unsafe {
        let item: IShellItemImageFactory =
            SHCreateItemFromParsingName(PCWSTR(target.as_ptr()), None)
                .map_err(|e| format!("无法读取图片：{e}"))?;
        // Never substitute an application icon for an actual image thumbnail.
        let bitmap = item
            .GetImage(SIZE { cx: 512, cy: 512 }, SIIGBF_THUMBNAILONLY)
            .map_err(|e| format!("Windows 无法生成此图片的预览：{e}"))?;
        let result = save_bitmap(bitmap, output);
        let _ = DeleteObject(bitmap.into());
        result
    }
}

fn shell_path(path: &Path) -> PathBuf {
    let mut components = path.components();
    let Some(Component::Prefix(prefix)) = components.next() else {
        return path.to_path_buf();
    };
    let mut normal = match prefix.kind() {
        Prefix::VerbatimDisk(drive) => PathBuf::from(format!("{}:\\", char::from(drive))),
        Prefix::VerbatimUNC(server, share) => {
            let mut normal = PathBuf::from("\\\\");
            normal.push(server);
            normal.push(share);
            normal
        }
        _ => return path.to_path_buf(),
    };
    for component in components {
        if component == Component::RootDir {
            continue;
        }
        let name = component.as_os_str().to_string_lossy();
        if name.ends_with('.') || name.ends_with(' ') {
            return path.to_path_buf();
        }
        normal.push(component.as_os_str());
    }
    // Shell parsing is not filesystem parsing. Keep verbatim paths when required.
    if normal.as_os_str().to_string_lossy().encode_utf16().count() < 260 {
        normal
    } else {
        path.to_path_buf()
    }
}

unsafe fn save_bitmap(bitmap: HBITMAP, output: &Path) -> Result<(), String> {
    let mut info = BITMAP::default();
    if GetObjectW(
        bitmap.into(),
        std::mem::size_of::<BITMAP>() as i32,
        Some((&mut info as *mut BITMAP).cast()),
    ) == 0
    {
        return Err("读取应用图标失败".into());
    }
    let width = info.bmWidth as u32;
    let height = info.bmHeight.unsigned_abs();
    if width == 0 || height == 0 || width > 1024 || height > 1024 {
        return Err("无效图标尺寸".into());
    }
    let dc = GetDC(None);
    let mut header = BITMAPINFO::default();
    header.bmiHeader = BITMAPINFOHEADER {
        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: width as i32,
        biHeight: -(height as i32),
        biPlanes: 1,
        biBitCount: 32,
        biCompression: BI_RGB.0,
        ..Default::default()
    };
    let mut pixels = vec![0u8; (width * height * 4) as usize];
    let read = GetDIBits(
        dc,
        bitmap,
        0,
        height,
        Some(pixels.as_mut_ptr().cast()),
        &mut header,
        DIB_RGB_COLORS,
    );
    ReleaseDC(None, dc);
    if read == 0 {
        return Err("提取应用图标失败".into());
    }
    let has_alpha = pixels.chunks_exact(4).any(|p| p[3] != 0);
    for p in pixels.chunks_exact_mut(4) {
        p.swap(0, 2);
        if !has_alpha {
            p[3] = 255;
        }
        // Shell bitmaps use premultiplied BGRA; PNG expects straight RGBA.
        if p[3] > 0 && p[3] < 255 {
            for i in 0..3 {
                p[i] = ((p[i] as u32 * 255) / p[3] as u32).min(255) as u8;
            }
        }
    }
    image::save_buffer(output, &pixels, width, height, image::ColorType::Rgba8)
        .map_err(|e| e.to_string())
}

pub fn launch(target: &str, kind: &str) -> Result<(), String> {
    let _com = Com::init()?;
    unsafe {
        let w = wide(target);
        if kind == "packaged" {
            let manager: IApplicationActivationManager =
                CoCreateInstance(&ApplicationActivationManager, None, CLSCTX_LOCAL_SERVER)
                    .map_err(|e| e.to_string())?;
            manager
                .ActivateApplication(PCWSTR(w.as_ptr()), PCWSTR::null(), AO_NONE)
                .map_err(|e| e.to_string())?;
        } else {
            let path = Path::new(target);
            if !path.is_file() {
                return Err("应用已移动或磁盘未连接，请重新扫描".into());
            }
            let extension = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            if !["exe", "lnk"].contains(&extension.as_str()) {
                return Err("不支持的启动目标".into());
            }
            let verb = wide("open");
            let directory = wide(&path.parent().unwrap_or(Path::new("")).to_string_lossy());
            let code = ShellExecuteW(
                None,
                PCWSTR(verb.as_ptr()),
                PCWSTR(w.as_ptr()),
                None,
                if kind == "shortcut" {
                    PCWSTR::null()
                } else {
                    PCWSTR(directory.as_ptr())
                },
                SW_SHOWNORMAL,
            );
            if code.0 as isize <= 32 {
                return Err(format!("Windows 无法启动此应用（{}）", code.0 as isize));
            }
        }
    }
    Ok(())
}

pub fn open_path(path: &Path) -> Result<(), String> {
    let target = wide(&shell_path(path).to_string_lossy());
    let verb = wide("open");
    unsafe {
        let code = ShellExecuteW(
            None,
            PCWSTR(verb.as_ptr()),
            PCWSTR(target.as_ptr()),
            None,
            None,
            SW_SHOWNORMAL,
        );
        if code.0 as isize <= 32 {
            return Err(format!("Windows 无法打开此文件（{}）", code.0 as isize));
        }
    }
    Ok(())
}

pub fn reveal_path(path: &Path) -> Result<(), String> {
    if path.is_dir() {
        return open_path(path);
    }
    let executable = wide("explorer.exe");
    let verb = wide("open");
    let argument = wide(&format!("/select,\"{}\"", shell_path(path).display()));
    unsafe {
        let code = ShellExecuteW(
            None,
            PCWSTR(verb.as_ptr()),
            PCWSTR(executable.as_ptr()),
            PCWSTR(argument.as_ptr()),
            None,
            SW_SHOWNORMAL,
        );
        if code.0 as isize <= 32 {
            return Err(format!("Windows 无法定位此文件（{}）", code.0 as isize));
        }
    }
    Ok(())
}

pub fn owns_foreground(window: &WebviewWindow) -> bool {
    let Ok(hwnd) = window.hwnd() else {
        return false;
    };
    unsafe {
        let foreground = GetForegroundWindow();
        let root = GetAncestor(foreground, GA_ROOTOWNER);
        foreground.0 == hwnd.0 || root.0 == hwnd.0
    }
}

pub fn focus(window: &WebviewWindow) {
    let _ = window.set_focus();
    if let Ok(h) = window.hwnd() {
        unsafe {
            let _ = SetForegroundWindow(HWND(h.0));
        }
    }
}

pub fn transparency_enabled() -> bool {
    winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize")
        .and_then(|key| key.get_value::<u32, _>("EnableTransparency"))
        .unwrap_or(1)
        != 0
}

pub fn autostart(enabled: bool) -> Result<(), String> {
    let (key, _) = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
        .create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
        .map_err(|e| e.to_string())?;
    if enabled {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        key.set_value("WinSpot", &format!("\"{}\" --background", exe.display()))
            .map_err(|e| e.to_string())?;
    } else if let Err(e) = key.delete_value("WinSpot") {
        if e.kind() != std::io::ErrorKind::NotFound {
            return Err(e.to_string());
        }
    }
    Ok(())
}

pub fn is_system_dark() -> bool {
    winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize")
        .and_then(|key| key.get_value::<u32, _>("AppsUseLightTheme"))
        .map(|v| v == 0)
        .unwrap_or(false)
}

pub fn configure_window_appearance(window: &WebviewWindow) {
    if let Ok(h) = window.hwnd() {
        use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWINDOWATTRIBUTE};
        use windows::Win32::UI::WindowsAndMessaging::{
            DeleteMenu, GetMenuItemCount, GetSystemMenu, GetWindowLongPtrW, SetWindowLongPtrW,
            GWL_STYLE, MF_BYPOSITION, WS_SYSMENU,
        };
        unsafe {
            // 禁用并清理原生系统菜单（彻底阻止 Alt+Space 呼出 Win32 窗口系统菜单）
            let style = GetWindowLongPtrW(HWND(h.0), GWL_STYLE);
            let _ = SetWindowLongPtrW(HWND(h.0), GWL_STYLE, style & !(WS_SYSMENU.0 as isize));
            let hmenu = GetSystemMenu(HWND(h.0), false);
            if !hmenu.0.is_null() {
                let count = GetMenuItemCount(Some(hmenu));
                for i in (0..count).rev() {
                    let _ = DeleteMenu(hmenu, i as u32, MF_BYPOSITION);
                }
            }

            // DWMWA_WINDOW_CORNER_PREFERENCE = 33, DWMWCP_DONOTROUND = 1 (透明无边框窗口由前端裁剪圆角，禁用 DWM 原生裁剪)
            let preference: u32 = 1;
            let _ = DwmSetWindowAttribute(
                HWND(h.0),
                DWMWINDOWATTRIBUTE(33),
                &preference as *const _ as *const std::ffi::c_void,
                std::mem::size_of_val(&preference) as u32,
            );
            // DWMWA_BORDER_COLOR = 34, DWMWA_COLOR_NONE = 0xFFFFFFFE (remove native border)
            let border_none: u32 = 0xFFFFFFFE;
            let _ = DwmSetWindowAttribute(
                HWND(h.0),
                DWMWINDOWATTRIBUTE(34),
                &border_none as *const _ as *const std::ffi::c_void,
                std::mem::size_of_val(&border_none) as u32,
            );
        }
    }
}
