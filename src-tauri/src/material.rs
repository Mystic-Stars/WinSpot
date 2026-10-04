use crate::{
    model::{BackdropState, MaterialAppearance, MaterialScene, Settings},
    native, AppState,
};
use std::{
    cell::RefCell,
    sync::{atomic::Ordering, Arc, Mutex},
};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use windows::{
    core::{h, implement, Interface, HSTRING, PCWSTR},
    Foundation::{IPropertyValue, PropertyValue},
    Graphics::Effects::{
        IGraphicsEffect, IGraphicsEffectSource, IGraphicsEffectSource_Impl, IGraphicsEffect_Impl,
    },
    System::{DispatcherQueue, DispatcherQueueController},
    Win32::{
        Foundation::{E_INVALIDARG, E_POINTER, HWND},
        Graphics::{
            Direct2D::CLSID_D2D1Saturation,
            Dwm::{DwmSetWindowAttribute, DWMWA_USE_HOSTBACKDROPBRUSH},
            Gdi::{
                CombineRgn, CreateRectRgn, CreateRoundRectRgn, DeleteObject, SetWindowRgn, HRGN,
                RGN_OR,
            },
        },
        System::WinRT::{
            Composition::ICompositorDesktopInterop,
            CreateDispatcherQueueController, DispatcherQueueOptions,
            Graphics::Direct2D::{
                IGraphicsEffectD2D1Interop, IGraphicsEffectD2D1Interop_Impl,
                GRAPHICS_EFFECT_PROPERTY_MAPPING, GRAPHICS_EFFECT_PROPERTY_MAPPING_DIRECT,
            },
            RoInitialize, RoUninitialize, DQTAT_COM_STA, DQTYPE_THREAD_CURRENT,
            RO_INIT_SINGLETHREADED,
        },
    },
    UI::{
        Color,
        Composition::{
            CompositionEffectSourceParameter, CompositionRoundedRectangleGeometry, Compositor,
            ContainerVisual, Desktop::DesktopWindowTarget, SpriteVisual, Visual,
        },
    },
};
use windows_numerics::{Vector2, Vector3};

// All WinRT composition objects stay on Tauri's UI thread.
thread_local! {
    static RUNTIME: RefCell<MaterialRuntime> = RefCell::new(MaterialRuntime::default());
}

#[derive(Default)]
struct MaterialRuntime {
    backdrop: Option<NativeBackdrop>,
    fallback_region: Option<WindowRegion>,
    region_failed: Option<u64>,
    _queue: Option<DispatcherQueueController>,
    _apartment: Option<WinRtApartment>,
}

struct WinRtApartment;

impl WinRtApartment {
    fn init() -> Result<Self, String> {
        unsafe {
            RoInitialize(RO_INIT_SINGLETHREADED)
                .map_err(|e| e.to_string())?;
        }
        Ok(Self)
    }
}

impl Drop for WinRtApartment {
    fn drop(&mut self) {
        unsafe {
            RoUninitialize();
        }
    }
}

#[implement(IGraphicsEffect, IGraphicsEffectSource, IGraphicsEffectD2D1Interop)]
struct SaturationEffect {
    name: Mutex<HSTRING>,
    amount: f32,
    source: IGraphicsEffectSource,
}

impl IGraphicsEffectSource_Impl for SaturationEffect_Impl {}

impl IGraphicsEffect_Impl for SaturationEffect_Impl {
    fn Name(&self) -> windows::core::Result<HSTRING> {
        Ok(self.name.lock().unwrap().clone())
    }

    fn SetName(&self, name: &HSTRING) -> windows::core::Result<()> {
        *self.name.lock().unwrap() = name.clone();
        Ok(())
    }
}

impl IGraphicsEffectD2D1Interop_Impl for SaturationEffect_Impl {
    fn GetEffectId(&self) -> windows::core::Result<windows::core::GUID> {
        Ok(CLSID_D2D1Saturation)
    }

    fn GetNamedPropertyMapping(
        &self,
        name: &PCWSTR,
        index: *mut u32,
        mapping: *mut GRAPHICS_EFFECT_PROPERTY_MAPPING,
    ) -> windows::core::Result<()> {
        if name.is_null() || index.is_null() || mapping.is_null() {
            return Err(E_POINTER.into());
        }
        unsafe {
            if name
                .to_string()
                .map_err(|_| windows::core::Error::from(E_INVALIDARG))?
                != "Saturation"
            {
                return Err(E_INVALIDARG.into());
            }
            *index = 0;
            *mapping = GRAPHICS_EFFECT_PROPERTY_MAPPING_DIRECT;
        }
        Ok(())
    }

    fn GetPropertyCount(&self) -> windows::core::Result<u32> {
        Ok(1)
    }

    fn GetProperty(&self, index: u32) -> windows::core::Result<IPropertyValue> {
        if index != 0 {
            return Err(E_INVALIDARG.into());
        }
        PropertyValue::CreateSingle(self.amount)?.cast()
    }

    fn GetSource(&self, index: u32) -> windows::core::Result<IGraphicsEffectSource> {
        if index != 0 {
            return Err(E_INVALIDARG.into());
        }
        Ok(self.source.clone())
    }

    fn GetSourceCount(&self) -> windows::core::Result<u32> {
        Ok(1)
    }
}

struct SurfaceVisual {
    container: ContainerVisual,
    geometry: CompositionRoundedRectangleGeometry,
    backdrop: SpriteVisual,
    tint: SpriteVisual,
}

impl SurfaceVisual {
    fn new(compositor: &Compositor) -> windows::core::Result<Self> {
        let container = compositor.CreateContainerVisual()?;
        let geometry = compositor.CreateRoundedRectangleGeometry()?;
        let clip = compositor.CreateGeometricClipWithGeometry(&geometry)?;
        container.SetClip(&clip)?;
        let backdrop = compositor.CreateSpriteVisual()?;
        let tint = compositor.CreateSpriteVisual()?;
        for visual in [&backdrop, &tint] {
            visual.SetRelativeSizeAdjustment(Vector2 { X: 1.0, Y: 1.0 })?;
        }
        container.Children()?.InsertAtTop(&backdrop)?;
        container.Children()?.InsertAtTop(&tint)?;
        container.SetOpacity(0.0)?;
        Ok(Self {
            container,
            geometry,
            backdrop,
            tint,
        })
    }
}

struct NativeBackdrop {
    compositor: Compositor,
    target: DesktopWindowTarget,
    root: ContainerVisual,
    surfaces: Vec<SurfaceVisual>,
    appearance: Option<MaterialAppearance>,
    transparent: bool,
    scene: Option<MaterialScene>,
    region: Option<WindowRegion>,
    failed: bool,
}

impl NativeBackdrop {
    fn new(window: &WebviewWindow) -> Result<Self, String> {
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        unsafe {
            let enabled: i32 = 1;
            DwmSetWindowAttribute(
                HWND(hwnd.0),
                DWMWA_USE_HOSTBACKDROPBRUSH,
                (&enabled as *const i32).cast(),
                std::mem::size_of_val(&enabled) as u32,
            )
            .map_err(|e| format!("无法启用宿主背板：{e}"))?;
        }
        let compositor = Compositor::new().map_err(|e| e.to_string())?;
        let interop: ICompositorDesktopInterop = compositor.cast().map_err(|e| e.to_string())?;
        // Below child HWNDs: WebView2 keeps its own focus, mouse and IME handling.
        let target = unsafe { interop.CreateDesktopWindowTarget(HWND(hwnd.0), false) }
            .map_err(|e| format!("无法连接原生合成层：{e}"))?;
        let root = compositor
            .CreateContainerVisual()
            .map_err(|e| e.to_string())?;
        root.SetOpacity(0.0).map_err(|e| e.to_string())?;
        target.SetRoot(&root).map_err(|e| e.to_string())?;
        let mut surfaces = Vec::new();
        for _ in 0..3 {
            let surface = SurfaceVisual::new(&compositor).map_err(|e| e.to_string())?;
            root.Children()
                .and_then(|children| children.InsertAtTop(&surface.container))
                .map_err(|e| e.to_string())?;
            surfaces.push(surface);
        }
        Ok(Self {
            compositor,
            target,
            root,
            surfaces,
            appearance: None,
            transparent: false,
            scene: None,
            region: None,
            failed: false,
        })
    }

    fn set_appearance(&mut self, appearance: &MaterialAppearance) -> windows::core::Result<()> {
        let transparent = native::transparency_enabled();
        if self.appearance.as_ref() == Some(appearance) && self.transparent == transparent {
            return Ok(());
        }
        let source = CompositionEffectSourceParameter::Create(h!("Backdrop"))?;
        let effect: IGraphicsEffect = SaturationEffect {
            name: Mutex::new(h!("Saturation").clone()),
            amount: appearance.saturation as f32 / 100.0,
            source: source.cast()?,
        }
        .into();
        let factory = self.compositor.CreateEffectFactory(&effect)?;
        let backdrop = factory.CreateBrush()?;
        let host = self.compositor.CreateHostBackdropBrush()?;
        backdrop.SetSourceParameter(h!("Backdrop"), &host)?;

        let tint = self.compositor.CreateLinearGradientBrush()?;
        tint.SetStartPoint(Vector2 { X: 0.0, Y: 0.0 })?;
        tint.SetEndPoint(Vector2 { X: 1.0, Y: 1.0 })?;
        let (start, end) = tint_colors(appearance);
        let stops = tint.ColorStops()?;
        stops.InsertAt(
            0,
            &self
                .compositor
                .CreateColorGradientStopWithOffsetAndColor(0.0, start)?,
        )?;
        stops.InsertAt(
            1,
            &self
                .compositor
                .CreateColorGradientStopWithOffsetAndColor(1.0, end)?,
        )?;
        let opacity = if transparent {
            appearance.opacity as f32 / 100.0
        } else {
            1.0
        };
        // Host blur has a system-defined baseline. Strength blends it with genuine transparency.
        let strength = if transparent && appearance.opacity < 100 {
            appearance.blur as f32 / 80.0
        } else {
            0.0
        };
        for surface in &self.surfaces {
            surface.backdrop.SetBrush(&backdrop)?;
            surface.backdrop.SetOpacity(strength)?;
            surface.tint.SetBrush(&tint)?;
            surface.tint.SetOpacity(opacity)?;
        }
        self.appearance = Some(appearance.clone());
        if let Some(scene) = &mut self.scene {
            scene.appearance = appearance.clone();
        }
        self.transparent = transparent;
        Ok(())
    }

    fn update(&mut self, window: &WebviewWindow, scene: &MaterialScene) -> Result<(), String> {
        self.set_appearance(&scene.appearance)
            .map_err(|e| e.to_string())?;
        let scale = window.scale_factor().map_err(|e| e.to_string())? as f32;
        let size = window.inner_size().map_err(|e| e.to_string())?;
        self.set_geometry(scene, scale, size.width as f32, size.height as f32)
            .map_err(|e| e.to_string())?;
        set_window_region(window, scene, &mut self.region)?;
        self.root
            .SetOpacity(if scene.surfaces.is_empty() { 0.0 } else { 1.0 })
            .map_err(|e| e.to_string())?;
        self.scene = Some(scene.clone());
        Ok(())
    }

    fn set_geometry(
        &self,
        scene: &MaterialScene,
        scale: f32,
        width: f32,
        height: f32,
    ) -> windows::core::Result<()> {
        self.root.SetSize(Vector2 {
            X: width,
            Y: height,
        })?;
        for (index, visual) in self.surfaces.iter().enumerate() {
            let Some(surface) = scene.surfaces.get(index) else {
                visual.container.SetOpacity(0.0)?;
                continue;
            };
            let size = Vector2 {
                X: surface.width as f32 * scale,
                Y: surface.height as f32 * scale,
            };
            let radius = (surface.radius as f32 * scale).min(size.X.min(size.Y) / 2.0);
            visual.container.SetOffset(Vector3 {
                X: surface.x as f32 * scale,
                Y: surface.y as f32 * scale,
                Z: 0.0,
            })?;
            visual.container.SetSize(size)?;
            visual.geometry.SetSize(size)?;
            visual.geometry.SetCornerRadius(Vector2 {
                X: radius,
                Y: radius,
            })?;
            visual.container.SetOpacity(surface.opacity)?;
        }
        Ok(())
    }

    fn hide(&mut self) {
        let _ = self.root.SetOpacity(0.0);
        self.scene = None;
        self.region = None;
    }
}

fn tint_colors(appearance: &MaterialAppearance) -> (Color, Color) {
    let rgb = if appearance.tint == "auto" {
        if appearance.dark {
            [30, 32, 40]
        } else {
            [255, 255, 255]
        }
    } else {
        let value = u32::from_str_radix(&appearance.tint[1..], 16).unwrap_or(0);
        [(value >> 16) as u8, (value >> 8) as u8, value as u8]
    };
    let end = if appearance.tint == "auto" {
        if appearance.dark {
            [16, 17, 22]
        } else {
            [240, 243, 248]
        }
    } else {
        rgb.map(|channel| (channel as f32 * 0.94).round() as u8)
    };
    let color = |rgb: [u8; 3]| Color {
        A: 255,
        R: rgb[0],
        G: rgb[1],
        B: rgb[2],
    };
    (color(rgb), color(end))
}

struct OwnedRegion(Option<HRGN>);

impl Drop for OwnedRegion {
    fn drop(&mut self) {
        if let Some(region) = self.0.take() {
            unsafe {
                let _ = DeleteObject(region.into());
            }
        }
    }
}

#[derive(Clone, PartialEq)]
struct WindowRegion {
    full: bool,
    parts: Vec<(i32, i32, i32, i32, i32)>,
}

fn set_window_region(
    window: &WebviewWindow,
    scene: &MaterialScene,
    previous: &mut Option<WindowRegion>,
) -> Result<(), String> {
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let next = WindowRegion {
        full: scene.overlay || (scene.surfaces.is_empty() && scene.interactions.is_empty()),
        parts: if scene.overlay {
            Vec::new()
        } else {
            scene
                .surfaces
                .iter()
                .chain(scene.interactions.iter())
                .map(|surface| {
                    (
                        (surface.x * scale).floor() as i32 - 2,
                        (surface.y * scale).floor() as i32 - 2,
                        ((surface.x + surface.width) * scale).ceil() as i32 + 2,
                        ((surface.y + surface.height) * scale).ceil() as i32 + 2,
                        (surface.radius * scale * 2.0).round() as i32 + 4,
                    )
                })
                .collect()
        },
    };
    if previous.as_ref() == Some(&next) {
        return Ok(());
    }
    unsafe {
        if next.full {
            if SetWindowRgn(HWND(hwnd.0), None, false) == 0 {
                return Err("无法恢复窗口交互范围".into());
            }
            *previous = Some(next);
            return Ok(());
        }
        let region = CreateRectRgn(0, 0, 0, 0);
        if region.is_invalid() {
            return Err("无法创建窗口交互范围".into());
        }
        let mut owned = OwnedRegion(Some(region));
        for &(left, top, right, bottom, diameter) in &next.parts {
            // A two-pixel gutter preserves the compositor's anti-aliased border.
            let part = CreateRoundRectRgn(left, top, right, bottom, diameter, diameter);
            if part.is_invalid() {
                return Err("无法创建面板交互范围".into());
            }
            let _part = OwnedRegion(Some(part));
            if CombineRgn(Some(region), Some(region), Some(part), RGN_OR).0 == 0 {
                return Err("无法合并面板交互范围".into());
            }
        }
        if SetWindowRgn(HWND(hwnd.0), Some(region), false) == 0 {
            return Err("无法应用窗口交互范围".into());
        }
        // Successful SetWindowRgn transfers region ownership to Windows.
        owned.0 = None;
    }
    *previous = Some(next);
    Ok(())
}

pub fn appearance(settings: &Settings) -> MaterialAppearance {
    MaterialAppearance {
        blur: settings.blur,
        opacity: settings.opacity,
        tint: settings.glass_tint.clone(),
        saturation: settings.glass_saturation,
        radius: settings.panel_radius,
        dark: match settings.theme.as_str() {
            "dark" => true,
            "light" => false,
            _ => native::is_system_dark(),
        },
    }
}

fn publish(app: &AppHandle, available: bool) {
    let state = app.state::<Arc<AppState>>();
    let next = BackdropState {
        available,
        transparency_enabled: native::transparency_enabled(),
        revision: state.transition.load(Ordering::Relaxed),
    };
    let changed = {
        let mut current = state.backdrop.write().unwrap();
        let changed = *current != next;
        *current = next.clone();
        changed
    };
    if changed {
        let _ = app.emit_to("main", "backdrop-changed", next);
    }
}

// Call only on Tauri's UI thread, including from run_on_main_thread closures.
pub fn configure(app: &AppHandle, window: &WebviewWindow, settings: &Settings) {
    let result = RUNTIME.with(|runtime| -> Result<bool, String> {
        let mut runtime = runtime.borrow_mut();
        if runtime._apartment.is_none() {
            runtime._apartment = Some(WinRtApartment::init()?);
        }
        if DispatcherQueue::GetForCurrentThread().is_err() && runtime._queue.is_none() {
            runtime._queue = Some(
                unsafe {
                    CreateDispatcherQueueController(DispatcherQueueOptions {
                        dwSize: std::mem::size_of::<DispatcherQueueOptions>() as u32,
                        threadType: DQTYPE_THREAD_CURRENT,
                        apartmentType: DQTAT_COM_STA,
                    })
                }
                .map_err(|e| format!("无法创建合成调度队列：{e}"))?,
            );
        }
        if runtime
            .backdrop
            .as_ref()
            .is_some_and(|backdrop| backdrop.failed)
        {
            if let Some(backdrop) = runtime.backdrop.take() {
                let _ = backdrop.target.SetRoot(None::<&Visual>);
                let _ = backdrop.compositor.Close();
            }
        }
        if runtime.backdrop.is_none() {
            runtime.backdrop = Some(NativeBackdrop::new(window)?);
        }
        let backdrop = runtime.backdrop.as_mut().unwrap();
        backdrop
            .set_appearance(&appearance(settings))
            .map_err(|e| e.to_string())?;
        let state = app.state::<Arc<AppState>>();
        if backdrop
            .scene
            .as_ref()
            .is_some_and(|scene| scene.revision != state.transition.load(Ordering::Relaxed))
        {
            backdrop.hide();
            unsafe {
                let hwnd = window.hwnd().map_err(|e| e.to_string())?;
                let _ = SetWindowRgn(HWND(hwnd.0), None, false);
            }
        }
        Ok(backdrop.scene.is_some())
    });
    match result {
        Ok(available) => publish(app, available),
        Err(error) => fail(app, window, error),
    }
}

pub fn update(app: &AppHandle, window: &WebviewWindow, scene: &MaterialScene) {
    let state = app.state::<Arc<AppState>>();
    if scene.revision != state.transition.load(Ordering::Relaxed)
        || (!state.visible.load(Ordering::Relaxed) && !window.is_visible().unwrap_or(false))
    {
        return;
    }
    let result = RUNTIME.with(|runtime| -> Result<bool, String> {
        let mut runtime = runtime.borrow_mut();
        if let Some(backdrop) = &mut runtime.backdrop {
            if !backdrop.failed {
                backdrop.update(window, scene)?;
                return Ok(true);
            }
        }
        if runtime.region_failed == Some(scene.revision) {
            return Ok(false);
        }
        set_window_region(window, scene, &mut runtime.fallback_region)?;
        Ok(false)
    });
    match result {
        Ok(available) => publish(app, available),
        Err(error) => fail(app, window, error),
    }
}

fn fail(app: &AppHandle, window: &WebviewWindow, error: String) {
    clear(window);
    RUNTIME.with(|runtime| {
        let mut runtime = runtime.borrow_mut();
        runtime.region_failed = Some(
            app.state::<Arc<AppState>>()
                .transition
                .load(Ordering::Relaxed),
        );
        if let Some(backdrop) = &mut runtime.backdrop {
            backdrop.failed = true;
        }
    });
    publish(app, false);
    let _ = app.emit(
        "app-error",
        format!("原生材质暂不可用，已回退实色：{error}"),
    );
}

pub fn clear(window: &WebviewWindow) {
    RUNTIME.with(|runtime| {
        let mut runtime = runtime.borrow_mut();
        runtime.fallback_region = None;
        runtime.region_failed = None;
        if let Some(backdrop) = &mut runtime.backdrop {
            backdrop.hide();
        }
    });
    if let Ok(hwnd) = window.hwnd() {
        unsafe {
            let _ = SetWindowRgn(HWND(hwnd.0), None, false);
        }
    }
}

pub fn refresh(app: &AppHandle, window: &WebviewWindow) {
    let result = RUNTIME.with(|runtime| -> Result<(), String> {
        // SetWindowRgn can cause reentrant window messages.
        let Ok(mut runtime) = runtime.try_borrow_mut() else {
            return Ok(());
        };
        if let Some(backdrop) = &mut runtime.backdrop {
            if let Some(scene) = backdrop.scene.clone() {
                let state = app.state::<Arc<AppState>>();
                if scene.revision == state.transition.load(Ordering::Relaxed)
                    && state.visible.load(Ordering::Relaxed)
                    && !backdrop.failed
                {
                    backdrop.update(window, &scene)?;
                }
            }
        }
        Ok(())
    });
    if let Err(error) = result {
        fail(app, window, error);
    }
}

pub fn shutdown() {
    RUNTIME.with(|runtime| {
        let mut runtime = runtime.borrow_mut();
        if let Some(backdrop) = runtime.backdrop.take() {
            let _ = backdrop.target.SetRoot(None::<&Visual>);
            let _ = backdrop.compositor.Close();
        }
        if let Some(queue) = runtime._queue.take() {
            let _ = queue.ShutdownQueueAsync();
        }
    });
}
