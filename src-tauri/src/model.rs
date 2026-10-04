use serde::{Deserialize, Serialize};

pub const CATEGORIES: &[&str] = &[
    "社交",
    "开发者工具",
    "工具",
    "效率与财务",
    "娱乐",
    "创意",
    "信息与阅读",
    "其他",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanDirectory {
    pub id: String,
    pub path: String,
    pub enabled: bool,
    pub recursive: bool,
    #[serde(default)]
    pub exclusions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct FileSearchSettings {
    pub enabled: bool,
    pub everything_enabled: bool,
    pub everything_path: String,
    pub fallback_enabled: bool,
    pub directories: Vec<String>,
}

impl Default for FileSearchSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            everything_enabled: true,
            everything_path: String::new(),
            fallback_enabled: true,
            directories: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ScanSourceKind {
    Directory,
    Registry,
    Shell,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSource {
    pub id: String,
    pub name: String,
    pub path: String,
    pub kind: ScanSourceKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub schema_version: u32,
    pub theme: String,
    #[serde(default = "default_blur")]
    pub blur: u32,
    pub opacity: u8,
    pub glass_tint: String,
    pub glass_saturation: u32,
    pub panel_radius: u32,
    pub icon_size: u32,
    pub density: String,
    pub reduced_motion: bool,
    pub library_shortcut: String,
    pub search_shortcut: String,
    pub capture_win: bool,
    pub autostart: bool,
    pub monitor: String,
    pub directories: Vec<ScanDirectory>,
    #[serde(default)]
    pub file_search: FileSearchSettings,
    pub categories: Vec<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            schema_version: 1,
            theme: "system".into(),
            blur: default_blur(),
            opacity: 80,
            glass_tint: "auto".into(),
            glass_saturation: 140,
            panel_radius: 26,
            icon_size: 64,
            density: "comfortable".into(),
            reduced_motion: false,
            library_shortcut: "Super".into(),
            search_shortcut: "Alt+Space".into(),
            capture_win: true,
            autostart: false,
            monitor: "cursor".into(),
            directories: vec![],
            file_search: FileSearchSettings::default(),
            categories: CATEGORIES.iter().map(|s| (*s).into()).collect(),
        }
    }
}

fn default_blur() -> u32 {
    24
}

impl Settings {
    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version != 1 {
            return Err("不支持此配置版本".into());
        }
        if !["system", "light", "dark"].contains(&self.theme.as_str())
            || !["comfortable", "compact"].contains(&self.density.as_str())
            || !(20..=100).contains(&self.opacity)
            || !(0..=80).contains(&self.blur)
            || self.glass_saturation > 200
            || self.panel_radius > 64
            || !valid_glass_tint(&self.glass_tint)
            || !(40..=96).contains(&self.icon_size)
        {
            return Err("外观设置超出允许范围".into());
        }
        if self.library_shortcut == self.search_shortcut {
            return Err("两个入口不能使用相同快捷键".into());
        }
        if self.search_shortcut == "Super" {
            return Err("搜索快捷键需要包含修饰键与普通按键".into());
        }
        if self.categories.len() > 32
            || self
                .categories
                .iter()
                .any(|c| c.trim().is_empty() || c.chars().count() > 20)
        {
            return Err("分类最多 32 个，名称为 1–20 个字符".into());
        }
        let unique: std::collections::HashSet<_> = self.categories.iter().collect();
        if unique.len() != self.categories.len() {
            return Err("分类名称不能重复".into());
        }
        if self
            .categories
            .iter()
            .any(|c| ["全部", "已固定"].contains(&c.as_str()))
        {
            return Err("分类名称为保留名称".into());
        }
        if self.directories.len() > 64 {
            return Err("最多添加 64 个扫描目录".into());
        }
        let mut ids = std::collections::HashSet::new();
        for dir in &self.directories {
            if dir.id.is_empty()
                || !ids.insert(&dir.id)
                || !std::path::Path::new(&dir.path).is_absolute()
            {
                return Err("目录必须是绝对路径且标识不能重复".into());
            }
        }
        if self.file_search.directories.len() > 32 {
            return Err("文件搜索最多添加 32 个目录".into());
        }
        if !self.file_search.everything_path.is_empty() {
            let path = std::path::Path::new(&self.file_search.everything_path);
            if !path.is_absolute()
                || !path
                    .extension()
                    .is_some_and(|e| e.eq_ignore_ascii_case("exe"))
            {
                return Err("Everything 路径必须是绝对路径的 es.exe".into());
            }
        }
        if self
            .file_search
            .directories
            .iter()
            .any(|path| !std::path::Path::new(path).is_absolute())
        {
            return Err("文件搜索目录必须是绝对路径".into());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Application {
    pub id: String,
    pub name: String,
    pub original_name: String,
    pub target: String,
    #[serde(default)]
    pub resolved_target: Option<String>,
    #[serde(default)]
    pub launch_arguments: Option<String>,
    #[serde(default)]
    pub working_directory: Option<String>,
    pub kind: String,
    pub source: String,
    pub category: String,
    pub icon: Option<String>,
    pub alias: String,
    pub pinned: bool,
    pub hidden: bool,
    pub filtered: bool,
    pub filter_reason: Option<String>,
    pub available: bool,
    #[serde(default)]
    pub excluded: bool,
    pub order: i64,
    pub launch_count: u64,
    pub last_launched: u64,
    #[serde(skip)]
    pub search_fields: Vec<String>,
    #[serde(skip)]
    pub search_initials: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileResult {
    pub id: String,
    pub name: String,
    pub path: String,
    pub kind: String,
    pub extension: Option<String>,
    pub size: Option<u64>,
    pub modified_at: Option<u64>,
    pub available: bool,
    pub preview_key: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePreview {
    pub thumbnail: Option<String>,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SearchItem {
    App { app: Application },
    File { file: FileResult },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub items: Vec<SearchItem>,
    pub file_provider: String,
    pub file_detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppOverride {
    pub id: String,
    pub name: String,
    pub alias: String,
    pub category: String,
    pub pinned: bool,
    pub hidden: bool,
    pub filtered: bool,
    pub order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScanStatus {
    pub running: bool,
    pub scanned: usize,
    pub found: usize,
    pub errors: Vec<String>,
    pub cancelled: bool,
    pub finished_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub id: String,
    pub name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    pub settings: Settings,
    pub apps: Vec<Application>,
    pub scan: ScanStatus,
    pub scan_sources: Vec<ScanSource>,
    pub monitors: Vec<MonitorInfo>,
    pub capture_paused: bool,
    pub startup_errors: Vec<String>,
    pub start_hidden: bool,
    pub backdrop: BackdropState,
}

#[derive(Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackdropState {
    pub available: bool,
    pub transparency_enabled: bool,
    pub revision: u64,
}

#[derive(Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialAppearance {
    pub blur: u32,
    pub opacity: u8,
    pub tint: String,
    pub saturation: u32,
    pub dark: bool,
    pub radius: u32,
}

impl MaterialAppearance {
    pub fn validate(&self) -> Result<(), String> {
        if self.blur > 80
            || !(20..=100).contains(&self.opacity)
            || self.saturation > 200
            || self.radius > 64
            || !valid_glass_tint(&self.tint)
        {
            return Err("材质参数超出允许范围".into());
        }
        Ok(())
    }
}

pub fn valid_glass_tint(value: &str) -> bool {
    value == "auto"
        || (value.len() == 7
            && value.starts_with('#')
            && value.bytes().skip(1).all(|byte| byte.is_ascii_hexdigit()))
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialSurface {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub radius: f64,
    pub opacity: f32,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialScene {
    pub revision: u64,
    pub surfaces: Vec<MaterialSurface>,
    #[serde(default)]
    pub interactions: Vec<MaterialSurface>,
    pub overlay: bool,
    pub appearance: MaterialAppearance,
}

impl MaterialScene {
    pub fn validate(&self) -> Result<(), String> {
        self.appearance.validate()?;
        if self.surfaces.len() > 3 || self.interactions.len() > 4 {
            return Err("材质面板数量超出限制".into());
        }
        for surface in self.surfaces.iter().chain(self.interactions.iter()) {
            if [
                surface.x,
                surface.y,
                surface.width,
                surface.height,
                surface.radius,
            ]
            .iter()
            .any(|value| !value.is_finite())
                || !surface.opacity.is_finite()
                || !(-2048.0..=8192.0).contains(&surface.x)
                || !(-2048.0..=8192.0).contains(&surface.y)
                || !(0.0..=8192.0).contains(&surface.width)
                || !(0.0..=8192.0).contains(&surface.height)
                || !(0.0..=4096.0).contains(&surface.radius)
                || !(0.0..=1.0).contains(&surface.opacity)
            {
                return Err("无效的材质面板范围".into());
            }
        }
        Ok(())
    }
}

pub fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
