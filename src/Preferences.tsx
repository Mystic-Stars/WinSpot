import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpFromLine, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleHelp,
  Folder, FolderPlus, Grid2X2, Laptop, Plus,
  RefreshCw, RotateCcw, Search, Settings2, ShieldCheck, SlidersHorizontal, Trash2, X,
  AppWindow, HardDrive, Cpu, Terminal, Info, Command, Minus, Eye, Pipette, Pin
} from "lucide-solid";
import { api, chooseApp, desktop } from "./api";
import { AppIcon, BrandMark, EmptyState, RaycastCheckbox, Spinner } from "./components";
import AppEditor from "./AppEditor";
import { glassStyle, materialAppearance } from "./glass";
import { type Application, type Bootstrap, type FileSearchSettings, type ScanDirectory, type ScanStatus, type Settings, type AppOverride, toOverride } from "./types";

export type Section =
  | "general"
  | "shortcuts"
  | "applications"
  | "sources"
  | "advanced"
  | "about";

interface SettingSearchEntry {
  id: string;
  section: Section;
  title: string;
  description: string;
  keywords: string;
}

type ResizeDirection = "East" | "North" | "NorthEast" | "NorthWest" | "South" | "SouthEast" | "SouthWest" | "West";

const SETTING_SEARCH_ENTRIES: SettingSearchEntry[] = [
  { id: "setting-theme", section: "general", title: "外观主题", description: "选择浅色、深色或跟随系统外观", keywords: "主题 外观 waiguan zhuti theme appearance dark light system 深色 浅色 跟随系统 自动" },
  { id: "setting-theme", section: "general", title: "跟随系统外观", description: "自动切换深色或浅色模式", keywords: "跟随系统 自动 system auto" },
  { id: "setting-theme", section: "general", title: "深色主题", description: "暗色环境下的界面色彩方案", keywords: "暗色 夜间 anse yejian dark midnight charcoal" },
  { id: "setting-theme", section: "general", title: "浅色主题", description: "明亮环境下的界面色彩方案", keywords: "亮色 liangse light paper frost amber" },
  { id: "setting-interface-size", section: "general", title: "界面尺寸", description: "调整字体与应用图标的缩放大小", keywords: "尺寸 字体 缩放 jiemian chicun ziti suofang size font scale small medium large" },
  { id: "setting-opacity", section: "general", title: "窗口背景透明度", description: "调整毛玻璃面板的通透程度，数值越低背底越清晰", keywords: "透明度 不透明 毛玻璃 磨砂 toumingdu butoumingdu opacity transparency glass frost" },
  { id: "setting-blur", section: "general", title: "毛玻璃雾化强度", description: "调整实时宿主背板与透明背景的混合强度", keywords: "模糊 模糊度 雾化 漫反射 毛玻璃 磨砂 mohu blur frost glass strength" },
  { id: "setting-glass-tint", section: "general", title: "毛玻璃色调", description: "选择背景色调或跟随主题", keywords: "毛玻璃 色调 背景 颜色 tint color glass" },
  { id: "setting-glass-saturation", section: "general", title: "背景饱和度", description: "调整背板颜色的饱和度", keywords: "背景 饱和度 颜色 saturation glass" },
  { id: "setting-panel-radius", section: "general", title: "面板圆角", description: "调整应用库和展开搜索面板的圆角", keywords: "圆角 面板 形状 radius corner panel" },
  { id: "setting-icon-size", section: "general", title: "程序库图标大小", description: "调整应用矩阵中的图标像素大小", keywords: "图标 大小 tubiao daxiao icon size pixel" },
  { id: "setting-reduced-motion", section: "general", title: "减弱动态效果", description: "关闭窗口呼出时的过渡动效", keywords: "动画 动效 过渡 响应 donghua dongxiao guodu xiangying reduced motion animation transition" },
  { id: "setting-autostart", section: "general", title: "开机时自动启动", description: "登录 Windows 后在后台启动 WinSpot", keywords: "开机 自启 启动 kaiji ziqi qidong startup autostart login" },
  { id: "setting-monitor", section: "general", title: "目标显示器", description: "设置启动器窗口优先呼出的屏幕位置", keywords: "显示器 屏幕 xianshiqi pingmu monitor screen cursor" },
  { id: "setting-density", section: "general", title: "排列密度", description: "调整应用矩阵的网格间距", keywords: "密度 间距 紧凑 舒适 midu jianju jincou shushi density compact comfortable grid" },
  { id: "setting-search-shortcut", section: "shortcuts", title: "呼出极简搜索栏", description: "设置快速唤出单行搜索输入框的快捷键", keywords: "快捷键 热键 搜索 唤醒 kuaijian re jian sousuo huanxing search shortcut hotkey alt space" },
  { id: "setting-library-shortcut", section: "shortcuts", title: "呼出完整应用库", description: "设置展开完整应用程序库的快捷键", keywords: "快捷键 热键 应用库 程序库 kuaijian yingyongku chengxuku library shortcut hotkey win super" },
  { id: "setting-capture-win", section: "shortcuts", title: "单击 Win 键直接呼出", description: "使用 Windows 键唤醒 WinSpot", keywords: "win windows key 接管 截获 捕获 jieguan jieshou buhuo start menu" },
  { id: "setting-pause-capture", section: "shortcuts", title: "临时暂停 Win 键拦截", description: "暂时交还 Windows 键控制权", keywords: "暂停 pause win windows 游戏 拦截 zan ting lanjie" },
  { id: "setting-applications", section: "applications", title: "应用程序与分类管理", description: "搜索、按分类管理、隐藏、固定、别名及添加本地应用", keywords: "应用 程序 分类 标签 yingyong chengxu fenlei biaoqian application app category search filter hidden pinned add alias" },
  { id: "setting-sources", section: "sources", title: "索引与扫描状态", description: "查看索引应用并重新扫描", keywords: "索引 扫描 suoyin saomiao scan source catalog index refresh" },
  { id: "setting-directories", section: "sources", title: "扫描目录", description: "查看内置扫描路径，添加目录并管理递归和排除规则", keywords: "目录 文件夹 内置 自定义 开始菜单 桌面 路径 mulu wenjianjia folder directory path recursive exclude desktop start menu" },
  { id: "setting-file-search", section: "sources", title: "文件搜索", description: "配置 Everything、降级搜索和文件搜索目录", keywords: "文件 文件搜索 everything es exe 降级 搜索目录 file search fallback path" },
  { id: "setting-system-sources", section: "sources", title: "系统应用来源", description: "查看 App Paths 注册表和 Windows 打包应用来源", keywords: "来源 注册表 系统 打包 商店 laiyuan zhucebiao registry app paths windows appsfolder store" },
  { id: "setting-advanced", section: "advanced", title: "配置文件管理", description: "导出、导入或恢复默认设置", keywords: "配置 备份 导出 导入 重置 恢复 peizhi beifen daochu daoru zhongzhi config backup export import reset default" },
  { id: "setting-privacy", section: "advanced", title: "隐私与本地安全", description: "查看本地数据保护说明", keywords: "隐私 安全 本地 yinsi anquan bendi privacy security local telemetry" },
  { id: "setting-about", section: "about", title: "关于 WinSpot", description: "查看版本、平台和引擎信息", keywords: "关于 版本 更新 平台 架构 guanyu banben gengxin pingtai jiagou about version update platform" },
];

/* Raycast Smooth Toggle Switch */
export function RaycastSwitch(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      disabled={props.disabled}
      class={`raycast-switch ${props.checked ? "checked" : ""}`}
      onClick={() => props.onChange(!props.checked)}
    >
      <span class="raycast-switch-knob" />
    </button>
  );
}

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  icon?: any;
  iconColor?: string;
}

/* Raycast Dropdown Select Button & Menu (Replicating media_1790994929496.png) */
export function RaycastSelect<T extends string>(props: {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  icon?: any;
  iconColor?: string;
  width?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  let ref!: HTMLDivElement;
  let searchInputRef!: HTMLInputElement;

  const currentOption = () => props.options.find(o => o.value === props.value);
  const currentLabel = () => currentOption()?.label ?? props.value;
  const CurrentIcon = () => currentOption()?.icon ?? props.icon;
  const currentIconColor = () => currentOption()?.iconColor ?? props.iconColor;

  const filteredOptions = createMemo(() => {
    const q = query().trim().toLowerCase();
    if (!q) return props.options;
    return props.options.filter(o => o.label.toLowerCase().includes(q));
  });

  const handleClickOutside = (e: MouseEvent) => {
    if (ref && !ref.contains(e.target as Node)) {
      setOpen(false);
      setQuery("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && open()) {
      setOpen(false);
      setQuery("");
    }
  };

  createEffect(() => {
    if (open()) {
      setTimeout(() => searchInputRef?.focus(), 40);
    } else {
      setQuery("");
    }
  });

  onMount(() => {
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
  });
  onCleanup(() => {
    document.removeEventListener("mousedown", handleClickOutside);
    document.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div ref={ref} class="raycast-select-wrapper" style={{ width: props.width ?? "auto" }}>
      <button
        type="button"
        class={`raycast-select-btn ${open() ? "open" : ""}`}
        disabled={props.disabled}
        onClick={() => setOpen(!open())}
      >
        <span style={{ display: "flex", "align-items": "center", gap: "7px", "min-width": "0" }}>
          <Show when={CurrentIcon()}>{I => (
            <Dynamic
              component={I()}
              size={13}
              strokeWidth={2}
              style={{ "flex-shrink": 0, color: currentIconColor() ?? "var(--rc-text-secondary)" }}
            />
          )}</Show>
          <span style={{ "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis" }}>
            {currentLabel()}
          </span>
        </span>
        <ChevronDown size={12} strokeWidth={2.2} class="raycast-select-chevron" />
      </button>

      <Show when={open()}>
        <div class="raycast-select-popover">
          {/* Top Search Filter Input (Matching Screenshot media_1790994929496.png) */}
          <div class="raycast-select-search-wrap">
            <input
              ref={searchInputRef}
              type="text"
              class="raycast-select-search-input"
              placeholder="搜索..."
              value={query()}
              onInput={e => setQuery(e.currentTarget.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && filteredOptions().length > 0) {
                  props.onChange(filteredOptions()[0].value);
                  setOpen(false);
                }
              }}
            />
          </div>

          {/* Options List */}
          <div class="raycast-select-list">
            <For each={filteredOptions()} fallback={
              <div style={{ padding: "8px 10px", "font-size": "11.5px", color: "var(--rc-text-tertiary)", "text-align": "center" }}>
                无匹配选项
              </div>
            }>{opt => {
              const isSelected = () => opt.value === props.value;
              const OptIcon = opt.icon;
              return (
                <div
                  class={`raycast-select-item ${isSelected() ? "selected" : ""}`}
                  onClick={() => {
                    props.onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <Show when={OptIcon} fallback={<span style={{ width: "13px" }} />}>{I => (
                    <Dynamic
                      component={I()}
                      size={13}
                      strokeWidth={2}
                      style={{
                        "flex-shrink": 0,
                        color: opt.iconColor ?? (isSelected() ? "var(--rc-text-primary)" : "var(--rc-text-secondary)")
                      }}
                    />
                  )}</Show>
                  <span style={{ "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis" }}>
                    {opt.label}
                  </span>
                </div>
              );
            }}</For>
          </div>
        </div>
      </Show>
    </div>
  );
}

/* Raycast Segmented Aa Control (Interface Size) */
function RaycastSegmentedAa(props: {
  value: "small" | "medium" | "large";
  onChange: (v: "small" | "medium" | "large") => void;
}) {
  return (
    <div class="raycast-segmented-aa" role="radiogroup" aria-label="Interface Size">
      <button
        type="button"
        class={`raycast-segmented-aa-btn ${props.value === "small" ? "active" : ""}`}
        style={{ "font-size": "11px" }}
        onClick={() => props.onChange("small")}
        title="Small"
      >
        Aa
      </button>
      <button
        type="button"
        class={`raycast-segmented-aa-btn ${props.value === "medium" ? "active" : ""}`}
        style={{ "font-size": "13.5px" }}
        onClick={() => props.onChange("medium")}
        title="Medium"
      >
        Aa
      </button>
      <button
        type="button"
        class={`raycast-segmented-aa-btn ${props.value === "large" ? "active" : ""}`}
        style={{ "font-size": "16px" }}
        onClick={() => props.onChange("large")}
        title="Large"
      >
        Aa
      </button>
    </div>
  );
}

/* Raycast Mockup Window for Theme Cards */
function MockupThemeWindow(props: { dark?: boolean; style?: any }) {
  return (
    <div class={`raycast-theme-win ${props.dark ? "dark" : ""}`} style={props.style}>
      <div class="raycast-theme-win-header">
        <span class="raycast-theme-win-dot" />
        <span class="raycast-theme-win-bar" />
      </div>
      <div class="raycast-theme-win-body">
        <div class="raycast-theme-win-sidebar">
          <span class="raycast-theme-win-sideitem" />
          <span class="raycast-theme-win-sideitem" />
        </div>
        <div class="raycast-theme-win-main">
          <span class="raycast-theme-win-griditem accent" />
          <span class="raycast-theme-win-griditem" />
          <span class="raycast-theme-win-griditem" />
          <span class="raycast-theme-win-griditem" />
        </div>
      </div>
    </div>
  );
}

/* Raycast Theme Cards (Light / Dark / Follow System) */
function RaycastThemeCards(props: {
  theme: "system" | "light" | "dark";
  onChange: (theme: "system" | "light" | "dark") => void;
}) {
  return (
    <div class="raycast-theme-cards" role="radiogroup" aria-label="外观主题">
      {/* Light Theme Card */}
      <div
        class={`raycast-mode-card ${props.theme === "light" ? "selected" : ""}`}
        role="radio"
        aria-checked={props.theme === "light"}
        tabIndex={0}
        onClick={() => props.onChange("light")}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            props.onChange("light");
          }
        }}
      >
        <div class="raycast-mode-preview theme-light">
          <MockupThemeWindow />
        </div>
        <span class={`raycast-mode-label ${props.theme === "light" ? "active" : ""}`}>
          浅色
        </span>
      </div>

      {/* Dark Theme Card */}
      <div
        class={`raycast-mode-card ${props.theme === "dark" ? "selected" : ""}`}
        role="radio"
        aria-checked={props.theme === "dark"}
        tabIndex={0}
        onClick={() => props.onChange("dark")}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            props.onChange("dark");
          }
        }}
      >
        <div class="raycast-mode-preview theme-dark">
          <MockupThemeWindow dark />
        </div>
        <span class={`raycast-mode-label ${props.theme === "dark" ? "active" : ""}`}>
          深色
        </span>
      </div>

      {/* Follow System Theme Card */}
      <div
        class={`raycast-mode-card ${props.theme === "system" ? "selected" : ""}`}
        role="radio"
        aria-checked={props.theme === "system"}
        tabIndex={0}
        onClick={() => props.onChange("system")}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            props.onChange("system");
          }
        }}
      >
        <div class="raycast-mode-preview theme-system">
          <div class="raycast-theme-half left">
            <MockupThemeWindow style={{ position: "absolute", left: "15px", top: "12px" }} />
          </div>
          <div class="raycast-theme-half right">
            <MockupThemeWindow dark style={{ position: "absolute", left: "-37px", top: "12px" }} />
          </div>
          <div class="raycast-theme-divider" />
        </div>
        <span class={`raycast-mode-label ${props.theme === "system" ? "active" : ""}`}>
          跟随系统
        </span>
      </div>
    </div>
  );
}

/* Raycast Slider */
function RaycastSlider(props: {
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  width?: string;
}) {
  const percent = () => Math.round(((props.value - props.min) / (props.max - props.min)) * 100);

  return (
    <div class="raycast-slider-wrap" style={{ width: props.width ?? "210px" }}>
      <div class="raycast-slider-track-wrap">
        <div class="raycast-slider-track">
          <div class="raycast-slider-fill" style={{ width: `${percent()}%` }} />
        </div>
        <input
          type="range"
          min={props.min}
          max={props.max}
          step={props.step ?? 1}
          value={props.value}
          class="raycast-slider-input"
          onInput={e => props.onChange(+e.currentTarget.value)}
        />
      </div>
      <span class="raycast-slider-val">
        {props.value}{props.unit ?? ""}
      </span>
    </div>
  );
}

export interface TintPreset {
  name: string;
  value: string;
}

export const TINT_PRESETS: TintPreset[] = [
  { name: "极简白", value: "#ffffff" },
  { name: "板岩冷灰", value: "#e2e8f0" },
  { name: "冰霜天蓝", value: "#0ea5e9" },
  { name: "经典钴蓝", value: "#2563eb" },
  { name: "紫罗兰夜", value: "#7c3aed" },
  { name: "碧翠薄荷", value: "#059669" },
  { name: "琥珀暖金", value: "#d97706" },
  { name: "绯红珊瑚", value: "#e11d48" },
  { name: "深海石青", value: "#334155" },
  { name: "暗夜黑曜", value: "#18181b" },
];

function isLightColor(hex: string): boolean {
  if (!hex || !hex.startsWith("#") || hex.length < 7) return false;
  const num = parseInt(hex.slice(1, 7), 16);
  if (isNaN(num)) return false;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 165;
}

/* Raycast Glass Tint Picker Component */
export function RaycastGlassTintPicker(props: {
  value: string;
  onChange: (value: string) => void;
  systemDark?: boolean;
  theme?: "system" | "light" | "dark";
  disabled?: boolean;
}) {
  const [open, setOpen] = createSignal(false);
  const [customHex, setCustomHex] = createSignal("");
  let containerRef!: HTMLDivElement;

  const isAuto = () => props.value === "auto";

  const fallbackHex = () => {
    const isDark = props.theme === "system" ? !!props.systemDark : props.theme === "dark";
    return isDark ? "#1e2028" : "#ffffff";
  };

  const effectiveHex = () => (isAuto() ? fallbackHex() : props.value);

  const matchedPreset = () => TINT_PRESETS.find(p => p.value.toLowerCase() === props.value.toLowerCase());

  const label = () => {
    if (isAuto()) return "跟随主题";
    const preset = matchedPreset();
    if (preset) return preset.name;
    return props.value.toUpperCase();
  };

  createEffect(on(open, isOpen => {
    if (isOpen) {
      setCustomHex(isAuto() ? "" : props.value.replace(/^#/, "").toUpperCase());
    }
  }));

  const handleClickOutside = (e: MouseEvent) => {
    if (containerRef && !containerRef.contains(e.target as Node)) {
      setOpen(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && open()) {
      setOpen(false);
    }
  };

  onMount(() => {
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
  });
  onCleanup(() => {
    document.removeEventListener("mousedown", handleClickOutside);
    document.removeEventListener("keydown", handleKeyDown);
  });

  const handleHexInput = (e: any) => {
    const raw = (e.currentTarget.value || "").replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
    setCustomHex(raw.toUpperCase());
  };

  const applyCustomHex = () => {
    const hex = customHex().trim();
    if (hex.length === 6 && /^[0-9a-fA-F]{6}$/.test(hex)) {
      props.onChange(`#${hex.toLowerCase()}`);
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} class="raycast-tint-wrapper">
      <button
        type="button"
        class={`raycast-tint-btn ${open() ? "open" : ""}`}
        disabled={props.disabled}
        onClick={() => setOpen(!open())}
        aria-label="选择毛玻璃色调"
      >
        <div class="raycast-tint-btn-content">
          <Show when={isAuto()} fallback={
            <span class="tint-swatch" style={{ "background-color": effectiveHex() }} />
          }>
            <span class="tint-swatch-auto" title="跟随外观主题" />
          </Show>
          <span class="raycast-tint-label">{label()}</span>
        </div>
        <ChevronDown size={12} strokeWidth={2.2} class="raycast-select-chevron" />
      </button>

      <Show when={!isAuto()}>
        <button
          type="button"
          class="icon-button raycast-tint-reset-btn"
          title="恢复跟随主题"
          aria-label="恢复跟随主题"
          onClick={() => props.onChange("auto")}
        >
          <RotateCcw size={13} />
        </button>
      </Show>

      <Show when={open()}>
        <div class="raycast-tint-popover">
          {/* 1. 跟随主题选项 */}
          <div
            class={`raycast-tint-auto-row ${isAuto() ? "selected" : ""}`}
            onClick={() => {
              props.onChange("auto");
              setOpen(false);
            }}
          >
            <div class="raycast-tint-auto-left">
              <span class="tint-swatch-auto" />
              <div>
                <div class="raycast-tint-auto-title">跟随主题</div>
                <div class="raycast-tint-auto-desc">自适应浅色或深色底色</div>
              </div>
            </div>
            <Show when={isAuto()}>
              <Check size={14} strokeWidth={2.5} style={{ color: "var(--rc-accent)" }} />
            </Show>
          </div>

          <div class="raycast-tint-divider" />

          {/* 2. 精选色调网格 */}
          <div class="raycast-tint-section-label">精选色调</div>
          <div class="raycast-tint-grid">
            <For each={TINT_PRESETS}>{preset => {
              const isSelected = () => !isAuto() && props.value.toLowerCase() === preset.value.toLowerCase();
              return (
                <button
                  type="button"
                  class={`raycast-tint-grid-btn ${isSelected() ? "selected" : ""}`}
                  style={{ "background-color": preset.value }}
                  title={`${preset.name} (${preset.value.toUpperCase()})`}
                  onClick={() => {
                    props.onChange(preset.value);
                    setOpen(false);
                  }}
                >
                  <Show when={isSelected()}>
                    <Check
                      size={12}
                      strokeWidth={3}
                      color={isLightColor(preset.value) ? "#000000" : "#ffffff"}
                    />
                  </Show>
                </button>
              );
            }}</For>
          </div>

          <div class="raycast-tint-divider" />

          {/* 3. 自定义调色 */}
          <div class="raycast-tint-section-label">自定义调色</div>
          <div class="raycast-tint-custom-row">
            <label class="raycast-tint-picker-trigger" title="打开系统调色盘选择任意颜色">
              <input
                type="color"
                class="raycast-tint-native-input"
                value={effectiveHex()}
                onInput={e => {
                  props.onChange(e.currentTarget.value);
                  setCustomHex(e.currentTarget.value.replace(/^#/, "").toUpperCase());
                }}
              />
              <Pipette size={13} strokeWidth={2} />
            </label>

            <div class="raycast-tint-hex-wrap">
              <span class="raycast-tint-hex-prefix">#</span>
              <input
                type="text"
                class="raycast-tint-hex-input"
                placeholder="RRGGBB"
                value={customHex()}
                onInput={handleHexInput}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    applyCustomHex();
                  }
                }}
              />
            </div>

            <button
              type="button"
              class="raycast-btn primary raycast-tint-apply-btn"
              disabled={customHex().length !== 6}
              onClick={applyCustomHex}
            >
              应用
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}

/* Unified Modal Dialog */
export function RaycastModal(props: { title: string; children: any; onClose: () => void; width?: string }) {
  let dialog!: HTMLDivElement;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") props.onClose();
  };

  onMount(() => document.addEventListener("keydown", handleKeyDown));
  onCleanup(() => document.removeEventListener("keydown", handleKeyDown));

  return (
    <div
      class="rc-modal-backdrop"
      onMouseDown={e => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div
        ref={dialog}
        class="rc-modal-dialog"
        style={{ width: props.width ?? "480px" }}
      >
        <div class="rc-modal-header">
          <h3 class="rc-modal-title">{props.title}</h3>
          <button
            type="button"
            class="rc-modal-close-btn"
            onClick={props.onClose}
            title="关闭"
          >
            <X size={15} />
          </button>
        </div>
        <div class="rc-modal-body">
          {props.children}
        </div>
      </div>
    </div>
  );
}

/* Windows Logo SVG Icon for Keycaps */
function WindowsLogo(props: { size?: number }) {
  const s = () => props.size ?? 12;
  return (
    <svg width={s()} height={s()} viewBox="0 0 16 16" fill="currentColor" style={{ display: "inline-block", "vertical-align": "middle" }}>
      <rect x="1" y="1" width="6.2" height="6.2" rx="0.8" />
      <rect x="8.8" y="1" width="6.2" height="6.2" rx="0.8" />
      <rect x="1" y="8.8" width="6.2" height="6.2" rx="0.8" />
      <rect x="8.8" y="8.8" width="6.2" height="6.2" rx="0.8" />
    </svg>
  );
}

interface KeyPart {
  id: string;
  base: string;
  side?: "left" | "right" | "none";
  isModifier?: boolean;
}

/* 3D Tactile Keycap Button Component */
function KeycapButton(props: {
  base: string;
  side?: "left" | "right" | "none";
  isModifier?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      class="raycast-3d-key"
      onClick={(e) => {
        e.stopPropagation();
        props.onClick?.();
      }}
      title={props.title}
    >
      <Show when={props.side === "left" || props.side === "right"}>
        <span class="raycast-key-side">{props.side === "left" ? "L" : "R"}</span>
      </Show>
      <Show when={props.base === "Win"} fallback={<span>{props.base}</span>}>
        <WindowsLogo size={13} />
      </Show>
    </button>
  );
}

function parseShortcutToParts(val: string): KeyPart[] {
  if (!val || !val.trim()) return [];
  if (val === "Super") {
    return [{ id: "win-0", base: "Win", side: "none", isModifier: true }];
  }
  return val.split("+").map((raw, i) => {
    let base = raw.trim();
    let isMod = false;
    let side: "left" | "right" | "none" = "none";
    if (base.startsWith("L") && base.length > 1 && ["LCtrl", "LAlt", "LShift", "LWin", "LSuper"].includes(base)) {
      side = "left";
      base = base.slice(1);
    } else if (base.startsWith("R") && base.length > 1 && ["RCtrl", "RAlt", "RShift", "RWin", "RSuper"].includes(base)) {
      side = "right";
      base = base.slice(1);
    }
    if (base === "Control" || base === "Ctrl") {
      base = "Ctrl";
      isMod = true;
    } else if (base === "Alt") {
      base = "Alt";
      isMod = true;
    } else if (base === "Shift") {
      base = "Shift";
      isMod = true;
    } else if (base === "Super" || base === "Win") {
      base = "Win";
      isMod = true;
    }
    return {
      id: `${base}-${i}`,
      base,
      side,
      isModifier: isMod,
    };
  });
}

function partsToShortcutString(parts: KeyPart[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1 && parts[0].base === "Win") {
    return "Super";
  }
  return parts.map(p => {
    if (p.base === "Ctrl") return "Control";
    if (p.base === "Win") return "Super";
    return p.base;
  }).join("+");
}

function normalizeKeyName(code: string, key: string): string {
  if (code === "Space" || key === " ") return "Space";
  if (code.startsWith("Key")) return code.slice(3).toUpperCase();
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "Num" + code.slice(6);
  if (/^F\d+$/.test(code)) return code;
  if (key && key.length === 1) return key.toUpperCase();
  return key || code;
}

interface ConflictInfo {
  isConflict: boolean;
  message?: string;
  source?: string;
}

function checkShortcutConflict(
  parts: KeyPart[],
  str: string,
  otherShortcut: string | undefined,
  isLibraryShortcut: boolean
): ConflictInfo {
  if (!parts.length || !str) {
    return { isConflict: false };
  }

  // 1. Conflict with the other WinSpot shortcut
  if (otherShortcut && str.toLowerCase() === otherShortcut.toLowerCase()) {
    return {
      isConflict: true,
      message: "已被 WinSpot 占用",
      source: isLibraryShortcut ? "极简搜索栏" : "完整应用库",
    };
  }

  // 2. Search shortcut cannot be single Win
  if (!isLibraryShortcut && (str === "Super" || (parts.length === 1 && parts[0].base === "Win"))) {
    return {
      isConflict: true,
      message: "搜索快捷键不支持单独 Win 键",
      source: "需要组合键 (例如 Alt+Space)",
    };
  }

  // 3. System reserved shortcuts
  const s = str.toLowerCase();
  if (s === "control+escape" || s === "ctrl+escape" || s === "ctrl+esc") {
    return {
      isConflict: true,
      message: "保留给 Windows 开始菜单",
      source: "Windows 开始菜单",
    };
  }
  if (s === "super+l" || s === "win+l") {
    return {
      isConflict: true,
      message: "保留给 Windows 锁屏",
      source: "Windows 锁屏",
    };
  }
  if (s === "super+d" || s === "win+d") {
    return {
      isConflict: true,
      message: "保留给 Windows 显示桌面",
      source: "Windows 桌面",
    };
  }
  if (s === "super+e" || s === "win+e") {
    return {
      isConflict: true,
      message: "保留给 Windows 资源管理器",
      source: "Windows 资源管理器",
    };
  }
  if (s === "super+r" || s === "win+r") {
    return {
      isConflict: true,
      message: "保留给 Windows 运行",
      source: "Windows 运行",
    };
  }
  if (s === "super+tab" || s === "win+tab") {
    return {
      isConflict: true,
      message: "保留给 Windows 任务视图",
      source: "Windows 任务视图",
    };
  }
  if (s === "control+alt+delete") {
    return {
      isConflict: true,
      message: "保留给 Windows 安全选项",
      source: "Windows 安全中心",
    };
  }

  // 4. Must contain Ctrl, Alt or Win if not single Super
  if (str !== "Super") {
    const hasMod = parts.some(p => p.base === "Ctrl" || p.base === "Alt" || p.base === "Win");
    const hasKey = parts.some(p => !p.isModifier);
    if (!hasMod || !hasKey) {
      return {
        isConflict: true,
        message: "快捷键需要包含修饰键与普通按键",
        source: "Ctrl、Alt 或 Win 组合",
      };
    }
  }

  return { isConflict: false };
}

/* Carousel Examples for Waiting/Idle State */
const CAROUSEL_EXAMPLES: { keys: { base: string; side?: "left" | "right" | "none"; isModifier?: boolean }[]; label: string }[] = [
  {
    keys: [{ base: "Win", isModifier: true, side: "none" }],
    label: "单键直接唤起",
  },
  {
    keys: [{ base: "Alt", isModifier: true, side: "none" }, { base: "Space" }],
    label: "修饰键 + 普通键",
  },
  {
    keys: [{ base: "Ctrl", isModifier: true, side: "none" }, { base: "Space" }],
    label: "修饰键 + 普通键",
  },
  {
    keys: [{ base: "F1" }],
    label: "功能键直接唤起",
  },
  {
    keys: [{ base: "Ctrl", isModifier: true, side: "none" }, { base: "Shift", isModifier: true, side: "none" }, { base: "P" }],
    label: "多修饰键组合唤起",
  },
  {
    keys: [{ base: "Win", isModifier: true, side: "none" }, { base: "Space" }],
    label: "Win 组合键唤起",
  },
];

/* Raycast-Style Shortcut Recorder Component */
function ShortcutRecorder(props: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  title?: string;
  icon?: any;
  otherShortcut?: string;
  isLibraryShortcut?: boolean;
  report: (e: unknown) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const [currentParts, setCurrentParts] = createSignal<KeyPart[]>(parseShortcutToParts(props.value));
  const [carouselIndex, setCarouselIndex] = createSignal(0);
  let containerRef!: HTMLDivElement;
  let activeModifierSides: Record<string, "left" | "right"> = {};
  let carouselTimer: any = null;

  // Sync internal parts when props.value changes externally
  createEffect(on(() => props.value, (val) => {
    if (!open()) {
      setCurrentParts(parseShortcutToParts(val));
    }
  }));

  const currentShortcutStr = () => partsToShortcutString(currentParts());

  const conflict = createMemo(() => {
    return checkShortcutConflict(
      currentParts(),
      currentShortcutStr(),
      props.otherShortcut,
      !!props.isLibraryShortcut
    );
  });

  const startCarousel = () => {
    stopCarousel();
    carouselTimer = setInterval(() => {
      setCarouselIndex(idx => (idx + 1) % CAROUSEL_EXAMPLES.length);
    }, 2400);
  };

  const stopCarousel = () => {
    if (carouselTimer) {
      clearInterval(carouselTimer);
      carouselTimer = null;
    }
  };

  const openPopover = () => {
    if (open()) return;
    setCurrentParts(parseShortcutToParts(props.value));
    setOpen(true);
    if (desktop) void api.recording(true).catch(props.report);
    if (currentParts().length === 0) {
      startCarousel();
    }
  };

  const closePopover = () => {
    if (!open()) return;
    setOpen(false);
    stopCarousel();
    activeModifierSides = {};
    if (desktop) void api.recording(false).catch(props.report);
  };

  onCleanup(() => {
    stopCarousel();
    if (desktop) void api.recording(false).catch(props.report);
  });

  // Start or stop carousel based on currentParts length
  createEffect(() => {
    if (open() && currentParts().length === 0) {
      startCarousel();
    } else {
      stopCarousel();
    }
  });

  // Toggle modifier side (e.g. Right Ctrl <-> Left Ctrl)
  const togglePartSide = (index: number) => {
    const parts = [...currentParts()];
    const part = parts[index];
    if (!part || !part.isModifier) return;

    let nextSide: "left" | "right" | "none" = "left";
    if (part.side === "right") nextSide = "left";
    else if (part.side === "left") nextSide = "right";
    else nextSide = "left";

    parts[index] = { ...part, side: nextSide };
    setCurrentParts(parts);

    const str = partsToShortcutString(parts);
    const conf = checkShortcutConflict(parts, str, props.otherShortcut, !!props.isLibraryShortcut);
    if (!conf.isConflict) {
      props.onChange(str);
    }
  };

  // Keyboard events listener
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!open()) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // Escape closes popover
    if (e.key === "Escape") {
      closePopover();
      return;
    }

    // Enter confirms and closes if valid
    if (e.key === "Enter") {
      if (currentParts().length > 0 && !conflict().isConflict) {
        closePopover();
      }
      return;
    }

    // Backspace deletes recorded shortcut to carousel/empty state
    if (e.key === "Backspace") {
      setCurrentParts([]);
      return;
    }

    if (e.key === "Tab") return;

    // Track which modifier side (left vs right) was pressed
    if (e.key === "Control") activeModifierSides["Control"] = e.code === "ControlRight" ? "right" : "left";
    if (e.key === "Alt") activeModifierSides["Alt"] = e.code === "AltRight" ? "right" : "left";
    if (e.key === "Shift") activeModifierSides["Shift"] = e.code === "ShiftRight" ? "right" : "left";
    if (e.key === "Meta") activeModifierSides["Win"] = e.code === "MetaRight" ? "right" : "left";

    // Library shortcut allows single Win key
    if (props.isLibraryShortcut && (e.key === "Meta" || e.code === "MetaLeft" || e.code === "MetaRight")) {
      const side = e.code === "MetaRight" ? "right" : "left";
      const newParts: KeyPart[] = [{ id: "win-0", base: "Win", side, isModifier: true }];
      setCurrentParts(newParts);
      const conf = checkShortcutConflict(newParts, "Super", props.otherShortcut, true);
      if (!conf.isConflict) {
        props.onChange("Super");
      }
      return;
    }

    // If only modifier is currently pressed, wait for combination
    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
      return;
    }

    // Compose modifier + key combination
    const newParts: KeyPart[] = [];
    if (e.ctrlKey) {
      const side = activeModifierSides["Control"] ?? (e.code === "ControlRight" ? "right" : "left");
      newParts.push({ id: "ctrl-mod", base: "Ctrl", side, isModifier: true });
    }
    if (e.altKey) {
      const side = activeModifierSides["Alt"] ?? (e.code === "AltRight" ? "right" : "left");
      newParts.push({ id: "alt-mod", base: "Alt", side, isModifier: true });
    }
    if (e.shiftKey) {
      const side = activeModifierSides["Shift"] ?? (e.code === "ShiftRight" ? "right" : "left");
      newParts.push({ id: "shift-mod", base: "Shift", side, isModifier: true });
    }
    if (e.metaKey) {
      const side = activeModifierSides["Win"] ?? (e.code === "MetaRight" ? "right" : "left");
      newParts.push({ id: "win-mod", base: "Win", side, isModifier: true });
    }

    const keyName = normalizeKeyName(e.code, e.key);
    newParts.push({ id: `key-${keyName}`, base: keyName, side: "none", isModifier: false });

    setCurrentParts(newParts);
    const shortcutStr = partsToShortcutString(newParts);
    const conf = checkShortcutConflict(newParts, shortcutStr, props.otherShortcut, !!props.isLibraryShortcut);
    if (!conf.isConflict) {
      props.onChange(shortcutStr);
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    if (!open()) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (e.key === "Control") delete activeModifierSides["Control"];
    if (e.key === "Alt") delete activeModifierSides["Alt"];
    if (e.key === "Shift") delete activeModifierSides["Shift"];
    if (e.key === "Meta") delete activeModifierSides["Win"];
  };

  const handleClickOutside = (e: MouseEvent) => {
    if (containerRef && !containerRef.contains(e.target as Node)) {
      closePopover();
    }
  };

  onMount(() => {
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown, { capture: true, passive: false });
    window.addEventListener("keyup", handleKeyUp, { capture: true, passive: false });
  });

  onCleanup(() => {
    document.removeEventListener("mousedown", handleClickOutside);
    window.removeEventListener("keydown", handleKeyDown, { capture: true });
    window.removeEventListener("keyup", handleKeyUp, { capture: true });
  });

  const stateClass = () => {
    if (currentParts().length === 0) return "";
    return conflict().isConflict ? "is-conflict" : "is-valid";
  };

  return (
    <div ref={containerRef} class="raycast-hotkey-wrapper">
      <div class="raycast-hotkey-trigger-group">
        {/* Trigger Input Button */}
        <button
          type="button"
          class={`raycast-hotkey-trigger ${open() ? "active" : ""}`}
          aria-label={props.label}
          onClick={() => {
            if (open()) closePopover();
            else openPopover();
          }}
        >
          <Show when={props.value} fallback={<span style={{ color: "var(--rc-text-tertiary)" }}>录制快捷键</span>}>
            <For each={parseShortcutToParts(props.value)}>{part =>
              <Show when={part.base === "Win"} fallback={
                <span style={{
                  background: "var(--rc-hover)",
                  border: "1px solid var(--rc-control-border)",
                  padding: "1px 6px",
                  "border-radius": "4px",
                  "font-size": "11px",
                  "font-weight": "600",
                  "display": "inline-flex",
                  "align-items": "center",
                  gap: "2px"
                }}>
                  <Show when={part.side === "left" || part.side === "right"}>
                    <span class="raycast-key-side">{part.side === "left" ? "L" : "R"}</span>
                  </Show>
                  {part.base}
                </span>
              }>
                <span style={{
                  background: "var(--rc-hover)",
                  border: "1px solid var(--rc-control-border)",
                  padding: "1px 6px",
                  "border-radius": "4px",
                  "font-size": "11px",
                  "font-weight": "600",
                  "display": "inline-flex",
                  "align-items": "center",
                  gap: "3px"
                }}>
                  <Show when={part.side === "left" || part.side === "right"}>
                    <span class="raycast-key-side">{part.side === "left" ? "L" : "R"}</span>
                  </Show>
                  <WindowsLogo size={11} />
                </span>
              </Show>
            }</For>
          </Show>
        </button>

        {/* Checkmark Button */}
        <button
          type="button"
          class={`raycast-hotkey-check-btn ${props.value ? "confirmed" : ""}`}
          title={open() ? "完成录制 (Enter)" : "录制快捷键"}
          onClick={() => {
            if (open()) closePopover();
            else openPopover();
          }}
        >
          <Check size={13} strokeWidth={2.4} />
        </button>
      </div>

      {/* Raycast Popover Window */}
      <Show when={open()}>
        <div class={`raycast-hotkey-popover ${stateClass()}`}>
          <div class="raycast-hotkey-body">
            {/* Header Text */}
            <div class="raycast-hotkey-header">
              <Show when={currentParts().length > 0} fallback={<span>推荐示例</span>}>
                <Show when={conflict().isConflict} fallback={<span>按 Backspace 退格键清除</span>}>
                  <span>
                    已被 <strong style={{ color: "#d32f2f", "margin-left": "3px" }}>{conflict().source || "WinSpot"}</strong> 占用
                  </span>
                </Show>
              </Show>
            </div>

            {/* 3D Keycaps Container */}
            <div class="raycast-hotkey-keys-container">
              <Show when={currentParts().length > 0} fallback={
                <For each={CAROUSEL_EXAMPLES[carouselIndex()].keys}>{key =>
                  <KeycapButton base={key.base} side={key.side} isModifier={key.isModifier} />
                }</For>
              }>
                <For each={currentParts()}>{(part, idx) =>
                  <KeycapButton
                    base={part.base}
                    side={part.side}
                    isModifier={part.isModifier}
                    onClick={() => togglePartSide(idx())}
                    title={part.isModifier ? "点击切换左/右按键" : undefined}
                  />
                }</For>
              </Show>
            </div>

            {/* Subtitle / Tip Text */}
            <div class="raycast-hotkey-subtext">
              <Show when={currentParts().length > 0} fallback={
                <span>{CAROUSEL_EXAMPLES[carouselIndex()].label}</span>
              }>
                <Show when={conflict().isConflict} fallback={
                  <>
                    <span>或点击按键微调左/右键</span>
                    <Info size={12} strokeWidth={2} style={{ "margin-left": "2px", opacity: 0.8 }} />
                  </>
                }>
                  <span>按 Esc 放弃，或直接按下新快捷键</span>
                </Show>
              </Show>
            </div>
          </div>

          {/* Footer Bar */}
          <div class="raycast-hotkey-footer">
            <div class="raycast-hotkey-footer-left">
              <div class="raycast-hotkey-footer-badge">
                <Show when={props.icon} fallback={<Command size={11} strokeWidth={2.4} />}>
                  <Dynamic component={props.icon} size={11} strokeWidth={2.4} />
                </Show>
              </div>
              <span>{props.title || props.label}</span>
            </div>
            <div class="raycast-hotkey-footer-right">
              <span>按</span>
              <button type="button" class="raycast-micro-key" onClick={closePopover}>Esc</button>
              <span>关闭</span>
              <Show when={!conflict().isConflict && currentParts().length > 0}>
                <span>或</span>
                <button type="button" class="raycast-micro-key" onClick={closePopover}>↵</button>
                <span>保存</span>
              </Show>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}

/* Main Raycast Preferences Component */
export default function Preferences(props: {
  apps: Application[];
  settings: Settings;
  scan: ScanStatus;
  scanSources: Bootstrap["scanSources"];
  monitors: Bootstrap["monitors"];
  paused: boolean;
  systemDark?: boolean;
  onUpdateSettings?: (settings: Settings) => void;
  refresh: () => Promise<Bootstrap | undefined>;
  report: (e: unknown) => void;
}) {
  const [section, setSection] = createSignal<Section>("general");
  const [history, setHistory] = createSignal<Section[]>(["general"]);
  const [historyIdx, setHistoryIdx] = createSignal(0);

  const [draft, setDraft] = createSignal<Settings>(structuredClone(props.settings));
  const [syncStatus, setSyncStatus] = createSignal<"synced" | "saving">("synced");

  // Application & Category State
  const [editor, setEditor] = createSignal<Application>();
  const [directory, setDirectory] = createSignal<ScanDirectory>();
  const [sidebarQuery, setSidebarQuery] = createSignal("");
  const [appQuery, setAppQuery] = createSignal("");
  const [appCategoryFilter, setAppCategoryFilter] = createSignal("all");
  const [expandedCategories, setExpandedCategories] = createSignal<Set<string>>(new Set());
  const [categoryModalOpen, setCategoryModalOpen] = createSignal(false);
  const [newCategoryName, setNewCategoryName] = createSignal("");
  const [editingAliasAppId, setEditingAliasAppId] = createSignal<string | null>(null);
  const [editingAliasValue, setEditingAliasValue] = createSignal("");
  const [confirm, setConfirm] = createSignal<"reset" | "import">();
  const [showErrors, setShowErrors] = createSignal(false);
  const [sourceHelpVisible, setSourceHelpVisible] = createSignal(false);
  const [toastMessage, setToastMessage] = createSignal<{ title?: string; text: string } | null>(null);

  let sourceHelpButton!: HTMLButtonElement;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  const showToast = (text: string, title = "WinSpot") => {
    clearTimeout(toastTimer);
    setToastMessage({ title, text });
    toastTimer = setTimeout(() => setToastMessage(null), 3500);
  };

  const navigateTo = (sec: Section) => {
    if (sec === section()) return;
    const nextHistory = history().slice(0, historyIdx() + 1);
    nextHistory.push(sec);
    setHistory(nextHistory);
    setHistoryIdx(nextHistory.length - 1);
    setSection(sec);
  };

  const canGoBack = () => historyIdx() > 0;
  const canGoForward = () => historyIdx() < history().length - 1;

  const goBack = () => {
    if (canGoBack()) {
      const nextIdx = historyIdx() - 1;
      setHistoryIdx(nextIdx);
      setSection(history()[nextIdx]);
    }
  };

  const goForward = () => {
    if (canGoForward()) {
      const nextIdx = historyIdx() + 1;
      setHistoryIdx(nextIdx);
      setSection(history()[nextIdx]);
    }
  };

  createEffect(on(() => props.settings, settings => {
    setDraft(structuredClone(settings));
  }));
  createEffect(on(section, () => setSourceHelpVisible(false)));

  const saveToBackend = (next: Settings, debounce = false) => {
    clearTimeout(debounceTimer);
    setSyncStatus("saving");
    const exec = async () => {
      try {
        await api.saveSettings(next);
        setSyncStatus("synced");
      } catch (e) {
        props.report(e);
        setSyncStatus("synced");
      }
    };
    if (debounce) {
      debounceTimer = setTimeout(() => void exec(), 180);
    } else {
      void exec();
    }
  };

  const change = <K extends keyof Settings>(key: K, value: Settings[K], debounce = false) => {
    const next = { ...draft(), [key]: value };
    setDraft(next);
    props.onUpdateSettings?.(next);
    saveToBackend(next, debounce);
  };

  const handleInterfaceSizeChange = (size: "small" | "medium" | "large") => {
    if (size === "small") {
      change("density", "compact");
      change("iconSize", 52);
    } else if (size === "large") {
      change("density", "comfortable");
      change("iconSize", 76);
    } else {
      change("density", "comfortable");
      change("iconSize", 64);
    }
  };

  const interfaceSize = () => {
    if (draft().iconSize <= 56) return "small";
    if (draft().iconSize >= 72) return "large";
    return "medium";
  };

  const closeWindow = async () => {
    if (desktop) await getCurrentWindow().destroy();
    else location.search = "";
  };

  const minimizeWindow = async () => {
    if (desktop) {
      try {
        await getCurrentWindow().minimize();
      } catch (e) {
        props.report(e);
      }
    }
  };

  // Nav Items: ONLY real features supported by WinSpot!
  interface SidebarItem {
    id: Section;
    label: string;
    icon: any;
  }

  const sidebarItems: SidebarItem[] = [
    { id: "general", label: "常规", icon: Settings2 },
    { id: "shortcuts", label: "快捷键", icon: Command },
    { id: "applications", label: "应用程序", icon: Grid2X2 },
    { id: "sources", label: "扫描源", icon: Folder },
    { id: "advanced", label: "高级设置", icon: SlidersHorizontal },
    { id: "about", label: "关于", icon: Info },
  ];

  const currentTitle = () => sidebarItems.find(i => i.id === section())?.label ?? "常规";

  const normalizeSearchText = (value: string) =>
    value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[，。；、/\\()[\]{}:：+_-]+/g, " ");

  const matchesSearch = (entry: SettingSearchEntry, query: string) => {
    const searchable = normalizeSearchText(`${entry.title} ${entry.description} ${entry.keywords}`);
    const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
    return tokens.length > 0 && tokens.every(token => searchable.includes(token));
  };

  const searchResults = createMemo(() => {
    const query = sidebarQuery().trim();
    return query ? SETTING_SEARCH_ENTRIES.filter(entry => matchesSearch(entry, query)) : [];
  });

  const openSearchResult = (entry: SettingSearchEntry) => {
    setSidebarQuery("");
    navigateTo(entry.section);
    window.setTimeout(() => {
      requestAnimationFrame(() => {
        document.getElementById(entry.id)?.scrollIntoView({
          behavior: draft().reducedMotion ? "auto" : "smooth",
          block: "center",
        });
      });
    }, 0);
  };

  const addDirectory = async () => {
    try {
      if (!desktop) throw new Error("请在 WinSpot 桌面应用中添加扫描目录");
      const paths = await open({ title: "添加扫描目录", directory: true, multiple: true });
      if (!paths) return;
      const list = Array.isArray(paths) ? paths : [paths];
      const next = [...draft().directories];
      const normalizePath = (path: string) => path.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
      const builtinPaths = new Set(builtinDirectories().map(source => normalizePath(source.path)));
      let skipped = 0;
      for (const path of list) {
        if (!builtinPaths.has(normalizePath(path)) && !next.some(d => normalizePath(d.path) === normalizePath(path))) {
          next.push({
            id: crypto.randomUUID(), path, enabled: true, recursive: true, exclusions: [],
          });
        } else {
          skipped += 1;
        }
      }
      if (next.length > 64) throw new Error("最多添加 64 个扫描目录");
      if (next.length !== draft().directories.length) change("directories", next);
      if (skipped) showToast(`已跳过 ${skipped} 个已列出的扫描目录`);
    } catch (e) {
      props.report(e);
    }
  };

  const updateFileSearch = (patch: Partial<FileSearchSettings>, debounce = false) =>
    change("fileSearch", { ...draft().fileSearch, ...patch }, debounce);

  const chooseEverythingPath = async () => {
    try {
      if (!desktop) throw new Error("请在 WinSpot 桌面应用中选择 Everything 的 es.exe");
      const path = await open({
        title: "选择 Everything 的 es.exe",
        directory: false,
        multiple: false,
        filters: [{ name: "Everything 命令行客户端", extensions: ["exe"] }],
      });
      if (typeof path === "string") updateFileSearch({ everythingPath: path });
    } catch (e) {
      props.report(e);
    }
  };

  const addFileSearchDirectory = async () => {
    try {
      if (!desktop) throw new Error("请在 WinSpot 桌面应用中添加文件搜索目录");
      const paths = await open({ title: "添加文件搜索目录", directory: true, multiple: true });
      if (!paths) return;
      const list = Array.isArray(paths) ? paths : [paths];
      const normalizePath = (path: string) => path.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
      const next = [...draft().fileSearch.directories];
      let skipped = 0;
      for (const path of list) {
        if (next.some(item => normalizePath(item) === normalizePath(path))) {
          skipped += 1;
        } else {
          next.push(path);
        }
      }
      if (next.length > 32) throw new Error("文件搜索最多添加 32 个目录");
      if (next.length !== draft().fileSearch.directories.length) updateFileSearch({ directories: next });
      if (skipped) showToast(`已跳过 ${skipped} 个重复文件搜索目录`);
    } catch (e) {
      props.report(e);
    }
  };

  const builtinDirectories = createMemo(() => props.scanSources.filter(source => source.kind === "directory"));
  const systemSources = createMemo(() => props.scanSources.filter(source => source.kind !== "directory"));

  const updateDirectory = (id: string, patch: Partial<ScanDirectory>) =>
    change("directories", draft().directories.map(d => d.id === id ? { ...d, ...patch } : d));

  const [showEmptyCategories, setShowEmptyCategories] = createSignal(false);

  // Normalize category naming (e.g. 开发工具 -> 开发者工具)
  const normalizeCategory = (c: string): string => {
    const trimmed = (c || "").trim();
    if (trimmed === "开发工具" || trimmed === "开发者工具") return "开发者工具";
    if (trimmed === "系统工具" || trimmed === "工具") return "工具";
    if (trimmed === "效率" || trimmed === "效率与财务") return "效率与财务";
    if (trimmed === "阅读" || trimmed === "信息与阅读") return "信息与阅读";
    return trimmed || "其他";
  };

  // Helper to test if an app belongs to a category
  const isAppInCategory = (app: Application, cat: string) => {
    const normTarget = normalizeCategory(cat);
    const normApp = normalizeCategory(app.category);
    if (normTarget === "其他") {
      const allNorm = draft().categories.map(normalizeCategory);
      return normApp === "其他" || !allNorm.includes(normApp);
    }
    return normApp === normTarget;
  };

  // All distinct, normalized categories from settings & discovered apps
  const allCategories = createMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const c of draft().categories) {
      const norm = normalizeCategory(c);
      if (!seen.has(norm)) {
        seen.add(norm);
        list.push(norm);
      }
    }
    if (!seen.has("其他")) {
      seen.add("其他");
      list.push("其他");
    }
    for (const a of props.apps) {
      const norm = normalizeCategory(a.category);
      if (!seen.has(norm)) {
        seen.add(norm);
        list.push(norm);
      }
    }
    return list;
  });

  // Raw apps in a category (for badge count & checkbox computation)
  const getRawCategoryApps = (cat: string) => {
    return props.apps.filter(a => isAppInCategory(a, cat));
  };

  // Filtered apps in a category (respecting search query)
  const getCategoryApps = (cat: string) => {
    const q = appQuery().trim().toLowerCase();
    return props.apps.filter(a => {
      if (!isAppInCategory(a, cat)) return false;
      if (q) {
        const target = `${a.name} ${a.originalName} ${a.alias} ${a.target} ${a.resolvedTarget ?? ""} ${a.launchArguments ?? ""} ${a.workingDirectory ?? ""}`.toLowerCase();
        if (!target.includes(q)) return false;
      }
      return true;
    });
  };

  // Total matching apps count across all categories
  const totalMatchingApps = createMemo(() => {
    const q = appQuery().trim().toLowerCase();
    if (!q) return props.apps.length;
    return props.apps.filter(a => {
      const target = `${a.name} ${a.originalName} ${a.alias} ${a.target} ${a.resolvedTarget ?? ""} ${a.launchArguments ?? ""} ${a.workingDirectory ?? ""}`.toLowerCase();
      return target.includes(q);
    }).length;
  });

  // Non-empty categories (with at least 1 app)
  const nonEmptyCategories = createMemo(() => {
    return allCategories().filter(cat => getRawCategoryApps(cat).length > 0);
  });

  // Empty categories (0 apps)
  const emptyCategories = createMemo(() => {
    return allCategories().filter(cat => getRawCategoryApps(cat).length === 0);
  });

  // Streamlined displayed categories: shows non-empty by default, or all if toggled/filtering/searching
  const displayCategories = createMemo(() => {
    const filter = appCategoryFilter();
    if (filter !== "all") {
      return allCategories().filter(c => c === filter);
    }
    if (appQuery().trim() || showEmptyCategories() || nonEmptyCategories().length === 0) {
      return allCategories();
    }
    return nonEmptyCategories();
  });

  // Checks whether a category is expanded
  const isCategoryExpanded = (cat: string) => {
    if (appQuery().trim()) {
      return getCategoryApps(cat).length > 0;
    }
    if (appCategoryFilter() !== "all") {
      return true;
    }
    return expandedCategories().has(cat);
  };

  const toggleCategoryExpand = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // Category master checkbox state: true (all visible), false (all hidden), or "indeterminate"
  const getCategoryCheckState = (cat: string): boolean | "indeterminate" => {
    const apps = getRawCategoryApps(cat);
    if (apps.length === 0) return true;
    const visibleCount = apps.filter(a => !a.hidden).length;
    if (visibleCount === apps.length) return true;
    if (visibleCount === 0) return false;
    return "indeterminate";
  };

  // Batch toggle category visibility
  const handleCategoryToggleVisibility = async (cat: string, nextVisible: boolean) => {
    const apps = getRawCategoryApps(cat);
    try {
      for (const app of apps) {
        if (app.hidden === nextVisible) {
          await api.updateApp(toOverride(app, { hidden: !nextVisible }));
        }
      }
      await props.refresh();
      showToast(nextVisible ? `已显示分类「${cat}」下的全部应用` : `已隐藏分类「${cat}」下的全部应用`);
    } catch (e) {
      props.report(e);
    }
  };

  // App quick actions
  const updateAppOverride = async (app: Application, patch: Partial<AppOverride>) => {
    try {
      await api.updateApp(toOverride(app, patch));
      await props.refresh();
    } catch (e) {
      props.report(e);
    }
  };

  const toggleAppPin = (app: Application) => {
    void updateAppOverride(app, { pinned: !app.pinned });
  };

  const toggleAppHidden = (app: Application) => {
    void updateAppOverride(app, { hidden: !app.hidden });
  };

  const startEditAlias = (app: Application) => {
    setEditingAliasAppId(app.id);
    setEditingAliasValue(app.alias || "");
  };

  const saveAlias = (app: Application) => {
    if (editingAliasAppId() === app.id) {
      const nextAlias = editingAliasValue().trim();
      setEditingAliasAppId(null);
      if (nextAlias !== (app.alias || "")) {
        void updateAppOverride(app, { alias: nextAlias });
      }
    }
  };

  const moveCategory = (index: number, direction: number) => {
    const categories = [...draft().categories];
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= categories.length) return;
    [categories[index], categories[targetIdx]] = [categories[targetIdx], categories[index]];
    change("categories", categories);
  };

  const addCategory = () => {
    const name = newCategoryName().trim();
    if (!name) return;
    if (draft().categories.includes(name) || ["全部", "已固定"].includes(name)) {
      props.report("分类名称已存在或为保留名称");
      return;
    }
    change("categories", [...draft().categories, name]);
    setNewCategoryName("");
    setCategoryModalOpen(false);
    showToast(`已新建分类「${name}」`);
  };

  const deleteCategory = async (name: string) => {
    if (name === "其他") return;
    const catApps = props.apps.filter(a => isAppInCategory(a, name));
    for (const app of catApps) {
      await api.updateApp(toOverride(app, { category: "其他" })).catch(props.report);
    }
    change("categories", draft().categories.filter(c => c !== name && normalizeCategory(c) !== normalizeCategory(name)));
    await props.refresh();
    showToast(`已删除分类「${name}」`);
  };

  const exportConfig = async () => {
    try {
      const path = await save({ title: "导出 WinSpot 配置文件", defaultPath: "WinSpot-config.json", filters: [{ name: "JSON", extensions: ["json"] }] });
      if (path) {
        await api.exportConfig(path);
        showToast("配置已成功导出为备份文件");
      }
    } catch (e) {
      props.report(e);
      showToast(String(e), "导出失败");
    }
  };

  const confirmAction = async () => {
    const action = confirm();
    setConfirm(undefined);
    try {
      if (action === "reset") {
        await api.reset();
        await props.refresh();
        showToast("已恢复出厂默认偏好设置");
      }
      if (action === "import") {
        const path = await open({ title: "导入配置", multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
        if (typeof path === "string") {
          await api.importConfig(path);
          await props.refresh();
          showToast("配置已成功导入");
        }
      }
    } catch (e) {
      props.report(e);
      showToast(String(e), "操作失败");
    }
  };

  onCleanup(() => {
    clearTimeout(debounceTimer);
    clearTimeout(toastTimer);
  });

  const startWindowDragging = (e: MouseEvent) => {
    if (desktop && e.button === 0 && !(e.target as HTMLElement).closest("button, input, textarea, select, a, .clickable")) {
      void getCurrentWindow().startDragging().catch(props.report);
    }
  };

  const startWindowResize = (e: MouseEvent, direction: ResizeDirection) => {
    if (!desktop || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    void getCurrentWindow().startResizeDragging(direction).catch(props.report);
  };

  return (
    <div class="raycast-window">
      <div class="window-resize-handle north" aria-hidden="true" onMouseDown={e => startWindowResize(e, "North")} />
      <div class="window-resize-handle south" aria-hidden="true" onMouseDown={e => startWindowResize(e, "South")} />
      <div class="window-resize-handle east" aria-hidden="true" onMouseDown={e => startWindowResize(e, "East")} />
      <div class="window-resize-handle west" aria-hidden="true" onMouseDown={e => startWindowResize(e, "West")} />
      <div class="window-resize-handle north-east" aria-hidden="true" onMouseDown={e => startWindowResize(e, "NorthEast")} />
      <div class="window-resize-handle north-west" aria-hidden="true" onMouseDown={e => startWindowResize(e, "NorthWest")} />
      <div class="window-resize-handle south-east" aria-hidden="true" onMouseDown={e => startWindowResize(e, "SouthEast")} />
      <div class="window-resize-handle south-west" aria-hidden="true" onMouseDown={e => startWindowResize(e, "SouthWest")} />

      {/* Left Sidebar */}
      <aside
        class="raycast-sidebar"
        onMouseDown={startWindowDragging}
      >
        <div class="raycast-sidebar-header">
          <span class="raycast-sidebar-title">设置</span>
        </div>

        {/* Search settings input */}
        <div class="raycast-search-box">
          <span class="raycast-search-icon">
            <Search size={14} strokeWidth={2} />
          </span>
          <input
            type="text"
            class="raycast-search-input"
            placeholder="搜索设置..."
            value={sidebarQuery()}
            onInput={e => setSidebarQuery(e.currentTarget.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && searchResults().length > 0) {
                e.preventDefault();
                openSearchResult(searchResults()[0]);
              }
            }}
          />
          <Show when={sidebarQuery()}>
            <button
              type="button"
              class="raycast-search-clear"
              onClick={() => setSidebarQuery("")}
              aria-label="清除设置搜索"
              title="清除搜索"
            >
              <X size={12} strokeWidth={2.4} />
            </button>
          </Show>
        </div>

        <Show
          when={sidebarQuery().trim()}
          fallback={
            /* Nav Items List: Real WinSpot features only */
            <div class="raycast-nav-list" style={{ "margin-top": "6px" }}>
              <For each={sidebarItems}>{item => {
                const isSelected = () => section() === item.id;
                const ItemIcon = item.icon;
                return (
                  <button
                    type="button"
                    class={`raycast-nav-item ${isSelected() ? "active" : ""}`}
                    onClick={() => navigateTo(item.id)}
                  >
                    <span class="raycast-nav-icon">
                      <ItemIcon size={16} strokeWidth={isSelected() ? 2.2 : 1.8} />
                    </span>
                    <span class="raycast-nav-label">{item.label}</span>
                    <Show when={item.id === "sources" && props.scan.running}>
                      <span style={{ "margin-left": "auto", width: "6px", height: "6px", "border-radius": "50%", background: "var(--rc-accent)" }} />
                    </Show>
                  </button>
                );
              }}</For>
            </div>
          }
        >
          <div class="preferences-search-results" role="listbox" aria-label="设置搜索结果">
            <Show
              when={searchResults().length > 0}
              fallback={<div class="preferences-search-empty">没有找到匹配的设置</div>}
            >
              <div class="preferences-search-count">设置结果 · {searchResults().length}</div>
              <For each={searchResults()}>{entry => {
                const SearchIcon = sidebarItems.find(item => item.id === entry.section)?.icon;
                return (
                  <button
                    type="button"
                    class="preferences-search-result"
                    role="option"
                    onClick={() => openSearchResult(entry)}
                  >
                    <span class="preferences-search-result-icon">
                      <Show when={SearchIcon}>{Icon => <Dynamic component={Icon()} size={14} strokeWidth={1.9} />}</Show>
                    </span>
                    <span class="preferences-search-result-copy">
                      <span class="preferences-search-result-title">{entry.title}</span>
                      <span class="preferences-search-result-description">{entry.description}</span>
                      <span class="preferences-search-result-section">
                        {sidebarItems.find(item => item.id === entry.section)?.label}
                      </span>
                    </span>
                    <ChevronRight size={13} class="preferences-search-result-arrow" />
                  </button>
                );
              }}</For>
            </Show>
          </div>
        </Show>
      </aside>

      {/* Right Main Content */}
      <div class="raycast-main">
        {/* Header Bar */}
        <header
          class="raycast-header"
          onMouseDown={startWindowDragging}
        >
          <div class="raycast-header-left">
            <button
              type="button"
              class="raycast-nav-arrow"
              disabled={!canGoBack()}
              onClick={goBack}
              title="后退"
            >
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              class="raycast-nav-arrow"
              disabled={!canGoForward()}
              onClick={goForward}
              title="前进"
            >
              <ChevronRight size={16} strokeWidth={2} />
            </button>
            <span class="raycast-header-title">{currentTitle()}</span>
          </div>

          <div class="raycast-header-right">
            <Show when={syncStatus() === "saving"}>
              <span style={{ "font-size": "11.5px", color: "var(--rc-text-secondary)", display: "flex", "align-items": "center", gap: "6px" }}>
                <Spinner /> 保存中
              </span>
            </Show>

            {/* Window Controls: Minimize & Close */}
            <div class="raycast-window-controls">
              <button
                type="button"
                class="raycast-win-btn"
                title="最小化"
                onClick={() => void minimizeWindow()}
              >
                <Minus size={14} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                class="raycast-win-btn close"
                title="关闭"
                onClick={() => void closeWindow()}
              >
                <X size={15} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </header>

        {/* Scrollable Content Body */}
        <div class="raycast-body">
          <div class={`raycast-content-container ${section() === "applications" ? "wide" : ""}`}>

            {/* General Section */}
            <Show when={section() === "general"}>
              <div class="raycast-group">
                <div class="raycast-group-title">外观与界面</div>
                <div class="raycast-group-rows">

                  {/* Appearance Theme Cards (Light / Dark / Follow System) */}
                  <div class="raycast-window-mode-row" id="setting-theme">
                    <div class="raycast-row-info">
                      <span class="raycast-row-title">外观主题</span>
                      <span class="raycast-row-subtitle">
                        {draft().theme === "system"
                          ? `跟随 Windows 系统自动切换（当前匹配为${props.systemDark ? "深色" : "浅色"}外观）`
                          : draft().theme === "dark"
                          ? "已固定使用深色外观"
                          : "已固定使用浅色外观"}
                      </span>
                    </div>
                    <div class="raycast-row-control">
                      <RaycastThemeCards
                        theme={draft().theme}
                        onChange={theme => {
                          change("theme", theme);
                          if (theme === "system") {
                            showToast(`已开启跟随系统外观（当前匹配为${props.systemDark ? "深色" : "浅色"}）`);
                          } else {
                            showToast(`已切换至${theme === "dark" ? "深色" : "浅色"}外观`);
                          }
                        }}
                      />
                    </div>
                  </div>

                  {/* Interface Size */}
                  <div class="raycast-row" id="setting-interface-size">
                    <div class="raycast-row-info">
                      <span class="raycast-row-title">界面尺寸</span>
                      <span class="raycast-row-subtitle">调整 WinSpot 界面字体与应用图标的缩放大小</span>
                    </div>
                    <div class="raycast-row-control">
                      <RaycastSegmentedAa
                        value={interfaceSize()}
                        onChange={handleInterfaceSizeChange}
                      />
                    </div>
                  </div>

                  {/* Panel Opacity */}
                  <div class="raycast-row" id="setting-opacity">
                    <div class="raycast-row-info">
                      <span class="raycast-row-title">窗口背景不透明度</span>
                      <span class="raycast-row-subtitle">调整毛玻璃面板的通透程度，数值越低背底越清晰</span>
                    </div>
                    <div class="raycast-row-control">
                      <RaycastSlider
                        min={20}
                        max={100}
                        value={draft().opacity}
                        unit="%"
                        onChange={v => change("opacity", v, true)}
                      />
                    </div>
                  </div>

                  {/* Background Blur */}
                  <div class="raycast-row" id="setting-blur">
                    <div class="raycast-row-info">
                      <span class="raycast-row-title">毛玻璃雾化强度</span>
                      <span class="raycast-row-subtitle">0 为清透背景，数值越高磨砂质感越强</span>
                    </div>
                    <div class="raycast-row-control">
                      <RaycastSlider
                        min={0}
                        max={80}
                        step={2}
                        value={draft().blur}
                        unit=""
                        onChange={v => change("blur", v, true)}
                      />
                    </div>
                  </div>

                  <div class="raycast-row" id="setting-glass-tint">
                    <div class="raycast-row-info">
                      <span class="raycast-row-title">毛玻璃色调</span>
                      <span class="raycast-row-subtitle">
                        {draft().glassTint === "auto"
                          ? "自适应浅色或深色底色"
                          : `自定义背景色调 (${draft().glassTint.toUpperCase()})`}
                      </span>
                    </div>
                    <div class="raycast-row-control">
                      <RaycastGlassTintPicker
                        value={draft().glassTint}
                        systemDark={!!props.systemDark}
                        theme={draft().theme}
                        onChange={v => change("glassTint", v, true)}
                      />
                    </div>
                  </div>

                  <div class="raycast-row" id="setting-glass-saturation">
                    <div class="raycast-row-info">
                      <span class="raycast-row-title">背景饱和度</span>
                    </div>
                    <div class="raycast-row-control">
                      <RaycastSlider min={0} max={200} step={5} value={draft().glassSaturation}
                        unit="%" onChange={v => change("glassSaturation", v, true)} />
                    </div>
                  </div>

                  <div class="raycast-row" id="setting-panel-radius">
                    <div class="raycast-row-info">
                      <span class="raycast-row-title">面板圆角</span>
                    </div>
                    <div class="raycast-row-control">
                      <RaycastSlider min={0} max={64} step={1} value={draft().panelRadius}
                        unit="px" onChange={v => change("panelRadius", v, true)} />
                    </div>
                  </div>

                  {/* Glass Material Live Preview */}
                  <div class="raycast-row glass-preview-row">
                    <div class="raycast-row-info">
                      <span class="raycast-row-title">材质预览</span>
                    </div>
                    <Show when={desktop} fallback={
                    <div class="glass-preview-container" style={glassStyle(materialAppearance(draft(), !!props.systemDark))}>
                      <div class="glass-preview-backdrop">
                        <div class="glass-preview-scene">
                          <div class="glass-preview-desktop-elements" aria-hidden="true">
                            <span class="preview-desktop-icon icon-blue" />
                            <span class="preview-desktop-icon icon-purple" />
                            <span class="preview-desktop-icon icon-amber" />
                            <span class="preview-desktop-bar" />
                          </div>
                        </div>
                        <div class="glass-preview-card native-surface">
                          <div class="glass-preview-chip">WinSpot Glass</div>
                          <span class="glass-preview-meta">{draft().opacity}% · {draft().blur} 雾化</span>
                        </div>
                      </div>
                    </div>
                    }>
                      <button type="button" class="raycast-btn" onClick={() => {
                        void api.previewMaterial(materialAppearance(draft(), !!props.systemDark)).catch(props.report);
                      }}><Eye size={14} />预览</button>
                    </Show>
                  </div>

                  {/* Library Icon Size */}
                  <div class="raycast-row" id="setting-icon-size">
                    <div class="raycast-row-info">
                      <span class="raycast-row-title">程序库图标大小</span>
                      <span class="raycast-row-subtitle">展开应用矩阵模式下图标的显示像素大小</span>
                    </div>
                    <div class="raycast-row-control">
                      <RaycastSlider
                        min={40}
                        max={84}
                        step={4}
                        value={draft().iconSize}
                        unit="px"
                        onChange={v => change("iconSize", v, true)}
                      />
                    </div>
                  </div>

                  {/* Reduced Motion */}
                  <div class="raycast-row" id="setting-reduced-motion">
                    <div class="raycast-row-info">
                      <span class="raycast-row-title">减弱动态效果</span>
                      <span class="raycast-row-subtitle">关闭窗口呼出时的缩放弹跳与过渡动效以提升响应速度</span>
                    </div>
                    <div class="raycast-row-control">
                      <RaycastSwitch
                        checked={draft().reducedMotion}
                        onChange={v => change("reducedMotion", v)}
                      />
                    </div>
                  </div>

                </div>
              </div>

              {/* Startup & Monitor Section */}
              <div class="raycast-group">
                <div class="raycast-group-title">系统与启动</div>
                <div class="raycast-group-rows">
                  <div class="raycast-row" id="setting-autostart">
                    <div class="raycast-row-info">
                      <span class="raycast-row-title">开机时自动启动</span>
                      <span class="raycast-row-subtitle">登录 Windows 后在后台静默启动 WinSpot</span>
                    </div>
                    <div class="raycast-row-control">
                      <RaycastSwitch checked={draft().autostart} onChange={v => change("autostart", v)} />
                    </div>
                  </div>
                  <div class="raycast-row" id="setting-monitor">
                    <div class="raycast-row-info">
                      <span class="raycast-row-title">目标显示器</span>
                      <span class="raycast-row-subtitle">设置启动器窗口优先呼出的屏幕位置</span>
                    </div>
                    <div class="raycast-row-control">
                      <RaycastSelect
                        value={draft().monitor}
                        options={[
                          { value: "cursor", label: "跟随鼠标所在屏幕", icon: Laptop },
                          ...props.monitors.map(m => ({ value: m.id, label: m.name, icon: Laptop }))
                        ]}
                        onChange={v => change("monitor", v)}
                        width="200px"
                      />
                    </div>
                  </div>
                  <div class="raycast-row" id="setting-density">
                    <div class="raycast-row-info">
                      <span class="raycast-row-title">排列密度</span>
                      <span class="raycast-row-subtitle">展开应用矩阵模式下的网格间距密度</span>
                    </div>
                    <div class="raycast-row-control">
                      <RaycastSelect
                        value={draft().density}
                        options={[
                          { value: "comfortable", label: "舒适 (默认)" },
                          { value: "compact", label: "紧凑" },
                        ]}
                        onChange={v => change("density", v as any)}
                        width="200px"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </Show>

            {/* Shortcuts Section */}
            <Show when={section() === "shortcuts"}>
              <div class="raycast-group">
                <div class="raycast-group-title">全局唤醒热键</div>
                <div class="raycast-group-rows">
                  <div class="raycast-row" id="setting-search-shortcut">
                    <div class="raycast-row-info">
                      <span class="raycast-row-title">呼出极简搜索栏</span>
                      <span class="raycast-row-subtitle">快速唤出单行极简搜索输入框</span>
                    </div>
                    <div class="raycast-row-control" style={{ gap: "8px" }}>
                      <ShortcutRecorder
                        value={draft().searchShortcut}
                        onChange={v => change("searchShortcut", v)}
                        label="录制搜索快捷键"
                        title="极简搜索栏"
                        icon={Search}
                        otherShortcut={draft().libraryShortcut}
                        isLibraryShortcut={false}
                        report={props.report}
                      />
                      <button type="button" class="raycast-btn" onClick={() => change("searchShortcut", "Alt+Space")} title="恢复默认">
                        <RotateCcw size={12} />
                      </button>
                    </div>
                  </div>
                  <div class="raycast-row" id="setting-library-shortcut">
                    <div class="raycast-row-info">
                      <span class="raycast-row-title">呼出完整应用库</span>
                      <span class="raycast-row-subtitle">展开完整的应用程序分类库网格</span>
                    </div>
                    <div class="raycast-row-control" style={{ gap: "8px" }}>
                      <ShortcutRecorder
                        value={draft().libraryShortcut}
                        onChange={v => change("libraryShortcut", v)}
                        label="录制程序库快捷键"
                        title="完整应用库"
                        icon={Grid2X2}
                        otherShortcut={draft().searchShortcut}
                        isLibraryShortcut={true}
                        report={props.report}
                      />
                      <button type="button" class="raycast-btn" onClick={() => change("libraryShortcut", "Super")} title="恢复默认">
                        <RotateCcw size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="raycast-group">
                <div class="raycast-group-title">Windows 键接管配置</div>
                <div class="raycast-group-rows">
                  <div class="raycast-row" id="setting-capture-win">
                    <div class="raycast-row-info">
                      <span class="raycast-row-title">单击 Win 键直接呼出</span>
                      <span class="raycast-row-subtitle">按下键盘上的 Windows 键直接唤醒 WinSpot，代替系统开始菜单</span>
                    </div>
                    <div class="raycast-row-control">
                      <RaycastSwitch
                        checked={draft().captureWin && draft().libraryShortcut === "Super"}
                        disabled={draft().libraryShortcut !== "Super"}
                        onChange={v => change("captureWin", v)}
                      />
                    </div>
                  </div>
                  <div class="raycast-row" id="setting-pause-capture">
                    <div class="raycast-row-info">
                      <span class="raycast-row-title">临时暂停 Win 键拦截</span>
                      <span class="raycast-row-subtitle">在全屏游戏或需要系统原有 Win 快捷键时临时交还控制权</span>
                    </div>
                    <div class="raycast-row-control">
                      <RaycastSwitch checked={props.paused} onChange={v => void api.pause(v).catch(props.report)} />
                    </div>
                  </div>
                </div>
              </div>
            </Show>

            {/* Applications & Categories Merged Section (Raycast Shortcuts Style) */}
            <Show when={section() === "applications"}>
              <div class="raycast-group" id="setting-applications">
                {/* Shortcuts Page Toolbar */}
                <div class="raycast-shortcuts-toolbar">
                  <div class="raycast-shortcuts-toolbar-left">
                    <div class="raycast-search-box">
                      <Search size={13} style={{ color: "var(--rc-text-secondary)", "margin-right": "6px" }} />
                      <input
                        type="text"
                        class="raycast-search-input"
                        placeholder="搜索应用程序、拼音或别名..."
                        value={appQuery()}
                        onInput={e => setAppQuery(e.currentTarget.value)}
                      />
                      <Show when={appQuery()}>
                        <button
                          type="button"
                          class="raycast-search-clear"
                          onClick={() => setAppQuery("")}
                          title="清除搜索"
                        >
                          <X size={12} />
                        </button>
                      </Show>
                    </div>

                    <RaycastSelect
                      value={appCategoryFilter()}
                      options={[
                        { value: "all", label: "全部分类" },
                        ...allCategories().map(c => ({ value: c, label: c }))
                      ]}
                      onChange={setAppCategoryFilter}
                      width="130px"
                    />
                  </div>

                  <div class="raycast-shortcuts-toolbar-right">
                    <button
                      type="button"
                      class="raycast-btn"
                      onClick={() => setCategoryModalOpen(true)}
                      title="新建分类标签"
                    >
                      <Plus size={13} strokeWidth={2.2} /> 新建分类
                    </button>
                    <button
                      type="button"
                      class="raycast-btn primary"
                      onClick={() => void chooseApp().catch(props.report)}
                      title="添加本地应用程序"
                    >
                      <FolderPlus size={13} /> 添加本地应用
                    </button>
                  </div>
                </div>

                {/* Global Empty State When Searching */}
                <Show when={appQuery().trim() && totalMatchingApps() === 0}>
                  <div class="raycast-apps-empty-search">
                    <Search size={28} style={{ color: "var(--rc-text-tertiary)", opacity: 0.7 }} />
                    <div class="raycast-apps-empty-search-title">未找到相关应用程序</div>
                    <div class="raycast-apps-empty-search-desc">
                      没有匹配「{appQuery()}」的应用，请尝试其他关键词或添加本地应用
                    </div>
                    <button
                      type="button"
                      class="raycast-btn"
                      onClick={() => setAppQuery("")}
                      style={{ "margin-top": "12px" }}
                    >
                      清空搜索关键词
                    </button>
                  </div>
                </Show>

                {/* Categories Accordion List */}
                <Show when={!appQuery().trim() || totalMatchingApps() > 0}>
                  <div class="raycast-accordion-container">
                    <For each={displayCategories()}>{cat => {
                      const isExpanded = () => isCategoryExpanded(cat);
                      const rawApps = () => getRawCategoryApps(cat);
                      const catApps = () => getCategoryApps(cat);
                      const catIdx = () => {
                        const idx = draft().categories.indexOf(cat);
                        if (idx !== -1) return idx;
                        return draft().categories.findIndex(c => normalizeCategory(c) === cat);
                      };
                      const canMoveUp = () => catIdx() > 0;
                      const canMoveDown = () => catIdx() >= 0 && catIdx() < draft().categories.length - 1;
                      const canDelete = () => cat !== "其他" && (draft().categories.includes(cat) || draft().categories.some(c => normalizeCategory(c) === cat));

                      return (
                        <div class={`raycast-accordion-item ${isExpanded() ? "expanded" : ""}`}>
                          {/* Category Header */}
                          <div
                            class="raycast-accordion-header"
                            onClick={() => toggleCategoryExpand(cat)}
                          >
                            <div class="raycast-accordion-title-wrap">
                              <span class="raycast-accordion-arrow">
                                <ChevronRight size={13} strokeWidth={2.2} />
                              </span>
                              <span class="raycast-accordion-name">{cat}</span>
                              <span class="raycast-accordion-count-badge">{rawApps().length}</span>
                            </div>

                            <div class="raycast-accordion-actions" onClick={e => e.stopPropagation()}>
                              <div class="raycast-accordion-tools">
                                <button
                                  type="button"
                                  class="raycast-accordion-tool-btn"
                                  disabled={!canMoveUp()}
                                  onClick={() => moveCategory(catIdx(), -1)}
                                  title="上移分类"
                                >
                                  <ArrowUp size={12} strokeWidth={2} />
                                </button>
                                <button
                                  type="button"
                                  class="raycast-accordion-tool-btn"
                                  disabled={!canMoveDown()}
                                  onClick={() => moveCategory(catIdx(), 1)}
                                  title="下移分类"
                                >
                                  <ArrowDown size={12} strokeWidth={2} />
                                </button>
                                <Show when={canDelete()}>
                                  <button
                                    type="button"
                                    class="raycast-accordion-tool-btn danger"
                                    onClick={() => void deleteCategory(cat)}
                                    title="删除分类"
                                  >
                                    <Trash2 size={12} strokeWidth={2} />
                                  </button>
                                </Show>
                              </div>

                              <RaycastCheckbox
                                checked={getCategoryCheckState(cat)}
                                onChange={checked => handleCategoryToggleVisibility(cat, checked)}
                                title={getCategoryCheckState(cat) === true ? "已显示该分类全部应用（点击全部隐藏）" : "点击显示该分类全部应用"}
                                ariaLabel={`切换分类 ${cat} 下所有应用的显示状态`}
                              />
                            </div>
                          </div>

                          {/* Category Apps Table (Expanded) */}
                          <Show when={isExpanded()}>
                            <div class="raycast-app-table">
                              <div class="raycast-app-table-header">
                                <div class="raycast-app-col-name">应用名称</div>
                                <div class="raycast-app-col-alias">搜索别名</div>
                                <div class="raycast-app-col-pin">置顶</div>
                                <div class="raycast-app-col-action">显示</div>
                              </div>

                              <Show when={catApps().length > 0} fallback={
                                <div class="raycast-app-empty">
                                  {appQuery() ? "该分类下无匹配应用" : "暂无应用"}
                                </div>
                              }>
                                <For each={catApps()}>{app => (
                                  <div
                                    class={`raycast-app-table-row ${app.hidden ? "app-hidden" : ""}`}
                                    onClick={() => setEditor(app)}
                                    title="点击编辑应用属性与配置"
                                  >
                                    {/* Col: Name */}
                                    <div class="raycast-app-col-name">
                                      <AppIcon app={app} size={24} />
                                      <span class="raycast-app-name-text">{app.name}</span>
                                      <span class="raycast-app-type-tag">
                                        {app.kind === "packaged" ? "应用商店" : "本地应用"}
                                      </span>
                                      <Show when={!app.available}>
                                        <span class="raycast-app-offline-tag">离线</span>
                                      </Show>
                                    </div>

                                    {/* Col: Alias */}
                                    <div
                                      class="raycast-app-col-alias"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      <Show
                                        when={editingAliasAppId() === app.id}
                                        fallback={
                                          <Show
                                            when={app.alias}
                                            fallback={
                                              <button
                                                type="button"
                                                class="raycast-alias-placeholder"
                                                onClick={() => startEditAlias(app)}
                                                title="添加快速搜索别名或拼音缩写"
                                              >
                                                + 添加别名
                                              </button>
                                            }
                                          >
                                            <span
                                              class="raycast-alias-badge"
                                              onClick={() => startEditAlias(app)}
                                              title="点击修改别名"
                                            >
                                              {app.alias}
                                            </span>
                                          </Show>
                                        }
                                      >
                                        <input
                                          type="text"
                                          class="raycast-alias-input"
                                          placeholder="别名..."
                                          value={editingAliasValue()}
                                          onInput={e => setEditingAliasValue(e.currentTarget.value)}
                                          onKeyDown={e => {
                                            if (e.key === "Enter") saveAlias(app);
                                            if (e.key === "Escape") setEditingAliasAppId(null);
                                          }}
                                          onBlur={() => saveAlias(app)}
                                          autofocus
                                        />
                                      </Show>
                                    </div>

                                    {/* Col: Pin */}
                                    <div
                                      class="raycast-app-col-pin"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      <button
                                        type="button"
                                        class={`raycast-pin-btn ${app.pinned ? "pinned" : ""}`}
                                        onClick={() => toggleAppPin(app)}
                                        title={app.pinned ? "已置顶（点击取消置顶）" : "点击置顶到应用库前列"}
                                      >
                                        <Pin size={13} />
                                      </button>
                                    </div>

                                    {/* Col: Visibility Checkbox */}
                                    <div
                                      class="raycast-app-col-action"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      <RaycastCheckbox
                                        checked={!app.hidden}
                                        onChange={() => toggleAppHidden(app)}
                                        title={!app.hidden ? "已在启动器中显示（点击隐藏）" : "已隐藏（点击在启动器中显示）"}
                                        ariaLabel={`切换应用 ${app.name} 的显示状态`}
                                      />
                                    </div>
                                  </div>
                                )}</For>
                              </Show>
                            </div>
                          </Show>
                        </div>
                      );
                    }}</For>

                    <Show when={emptyCategories().length > 0 && !appQuery().trim() && appCategoryFilter() === "all"}>
                      <div
                        class="raycast-empty-categories-toggle"
                        onClick={() => setShowEmptyCategories(!showEmptyCategories())}
                        role="button"
                        tabIndex={0}
                      >
                        <Folder size={13} style={{ opacity: 0.65 }} />
                        <span>{showEmptyCategories() ? "收起无应用的空分类" : `已折叠 ${emptyCategories().length} 个无应用的空分类`}</span>
                        <span class="link-act">{showEmptyCategories() ? "收起" : "展开查看"}</span>
                      </div>
                    </Show>
                  </div>
                </Show>
              </div>
            </Show>

            {/* Sources Section */}
            <Show when={section() === "sources"}>
              <div class="raycast-group" id="setting-file-search">
                <div class="raycast-group-title">文件搜索</div>
                <div class="raycast-group-rows">
                  <div class="raycast-row">
                    <div class="raycast-row-info">
                      <span class="raycast-row-title">启用文件搜索</span>
                      <span class="raycast-row-subtitle">在聚焦搜索首页和文件搜索范围中查找本机文件与文件夹</span>
                    </div>
                    <div class="raycast-row-control">
                      <RaycastSwitch
                        checked={draft().fileSearch.enabled}
                        onChange={value => updateFileSearch({ enabled: value })}
                        label="启用文件搜索"
                      />
                    </div>
                  </div>

                  <Show when={draft().fileSearch.enabled}>
                    <div class="raycast-row">
                      <div class="raycast-row-info">
                        <span class="raycast-row-title">使用 Everything</span>
                        <span class="raycast-row-subtitle">优先使用 Everything 的 es.exe；路径为空时自动检查 PATH 和常见安装目录</span>
                      </div>
                      <div class="raycast-row-control">
                        <RaycastSwitch
                          checked={draft().fileSearch.everythingEnabled}
                          onChange={value => updateFileSearch({ everythingEnabled: value })}
                          label="使用 Everything"
                        />
                      </div>
                    </div>

                    <div class="raycast-row">
                      <div class="raycast-row-info">
                        <span class="raycast-row-title">Everything 客户端路径</span>
                        <span class="raycast-row-subtitle">{draft().fileSearch.everythingPath || "自动发现 es.exe"}</span>
                      </div>
                      <div class="raycast-row-control" style={{ gap: "6px", "max-width": "470px" }}>
                        <input
                          class="rc-input preferences-file-search-path"
                          value={draft().fileSearch.everythingPath}
                          placeholder="自动发现 es.exe"
                          readonly
                          aria-label="Everything 客户端路径"
                        />
                        <button type="button" class="raycast-btn" onClick={() => void chooseEverythingPath()} title="选择 es.exe">
                          <FolderPlus size={13} /> 选择
                        </button>
                        <button
                          type="button"
                          class="raycast-btn"
                          disabled={!draft().fileSearch.everythingPath}
                          onClick={() => updateFileSearch({ everythingPath: "" })}
                          title="恢复自动发现"
                        >
                          自动
                        </button>
                      </div>
                    </div>

                    <div class="raycast-row">
                      <div class="raycast-row-info">
                        <span class="raycast-row-title">Everything 不可用时降级搜索</span>
                        <span class="raycast-row-subtitle">扫描桌面、文档、下载和下面配置的目录，不进行全盘扫描</span>
                      </div>
                      <div class="raycast-row-control">
                        <RaycastSwitch
                          checked={draft().fileSearch.fallbackEnabled}
                          onChange={value => updateFileSearch({ fallbackEnabled: value })}
                          label="启用文件搜索降级"
                        />
                      </div>
                    </div>

                    <div class="raycast-row preferences-source-heading">
                      <div class="raycast-row-info">
                        <span class="raycast-row-title">文件搜索补充目录</span>
                        <span class="raycast-row-subtitle">Everything 不可用时额外扫描的目录，最多 32 个</span>
                      </div>
                      <div class="raycast-row-control">
                        <button type="button" class="raycast-btn" disabled={!draft().fileSearch.fallbackEnabled} onClick={() => void addFileSearchDirectory()}>
                          <FolderPlus size={13} /> 添加目录
                        </button>
                      </div>
                    </div>

                    <For each={draft().fileSearch.directories}>
                      {path => (
                        <div class="raycast-row preferences-source-row">
                          <Folder size={16} class="preferences-source-icon" />
                          <div class="raycast-row-info">
                            <span class="raycast-row-title preferences-source-path">{path}</span>
                            <span class="raycast-row-subtitle">文件搜索降级目录 · 递归遍历</span>
                          </div>
                          <div class="raycast-row-control preferences-source-controls">
                            <button
                              type="button"
                              class="raycast-btn danger"
                              onClick={() => updateFileSearch({ directories: draft().fileSearch.directories.filter(item => item !== path) })}
                              title="删除文件搜索目录"
                              aria-label={`删除文件搜索目录 ${path}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      )}
                    </For>
                  </Show>
                </div>
              </div>

              <div class="raycast-group" id="setting-sources">
                <div class="raycast-group-title">索引与扫描状态</div>
                <div class="raycast-group-rows">
                  <div class="raycast-row">
                    <div class="raycast-row-info">
                      <span class="raycast-row-title">已建立索引应用：{props.apps.filter(a => !a.filtered && !a.excluded).length} 个</span>
                      <span class="raycast-row-subtitle">
                        {props.scan.running ? `扫描进行中，已检索 ${props.scan.scanned} 个文件…` : props.scan.finishedAt ? `上次扫描完成于 ${new Date(props.scan.finishedAt * 1000).toLocaleTimeString("zh-CN")}` : "准备就绪"}
                      </span>
                    </div>
                    <div class="raycast-row-control">
                      <button
                        type="button"
                        class="raycast-btn"
                        disabled={props.scan.running}
                        onClick={() => void api.scan().catch(props.report)}
                      >
                        <RefreshCw size={13} class={props.scan.running ? "spin" : ""} /> 重新扫描
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="raycast-group" id="setting-directories">
                <div class="raycast-group-title preferences-source-heading">
                  <span>扫描目录</span>
                  <div
                    class="preferences-source-help-wrap"
                    onMouseEnter={() => setSourceHelpVisible(true)}
                    onMouseLeave={() => {
                      if (document.activeElement !== sourceHelpButton) setSourceHelpVisible(false);
                    }}
                  >
                    <button
                      ref={sourceHelpButton}
                      type="button"
                      class="preferences-source-help"
                      aria-label="扫描原理"
                      aria-describedby="scan-sources-tooltip"
                      onFocus={() => setSourceHelpVisible(true)}
                      onBlur={() => setSourceHelpVisible(false)}
                      onKeyDown={e => {
                        if (e.key === "Escape") {
                          e.stopPropagation();
                          setSourceHelpVisible(false);
                        }
                      }}
                    >
                      <CircleHelp size={15} />
                    </button>
                    <div
                      id="scan-sources-tooltip"
                      class="preferences-source-tooltip"
                      role="tooltip"
                      hidden={!sourceHelpVisible()}
                    >
                      <strong>扫描原理</strong>
                      <p>WinSpot 不会全盘扫描。内置目录由 Windows 提供，始终参与扫描；从中查找 .exe 和 .lnk，并读取 App Paths 注册表与 Windows AppsFolder 补充应用。</p>
                      <p>添加目录后会自动重新扫描，可单独启停、设置递归和排除规则。递归最多 64 层，不跟随符号链接或目录联接；排除规则是不区分大小写的路径片段，不是通配符。</p>
                      <p>相同启动入口会合并去重。目录内相关文件变化会合并后触发重扫；注册表和打包应用变化可手动重新扫描。索引只保存在本机。</p>
                    </div>
                  </div>
                  <button type="button" class="raycast-btn preferences-source-add" onClick={() => void addDirectory()}>
                    <FolderPlus size={14} /> 添加扫描目录…
                  </button>
                </div>
                <div class="raycast-group-rows">
                  <For each={builtinDirectories()}>{source => (
                    <div class="raycast-row preferences-source-row">
                      <Folder size={16} class="preferences-source-icon" />
                      <div class="raycast-row-info">
                        <span class="raycast-row-title">{source.name}</span>
                        <span class="raycast-row-subtitle preferences-source-path">{source.path}</span>
                      </div>
                      <span class="preferences-source-tag">内置</span>
                    </div>
                  )}</For>
                  <For each={draft().directories}>{dir => (
                    <div class="raycast-row preferences-source-row">
                      <Folder size={16} class="preferences-source-icon" />
                      <div class="raycast-row-info">
                        <span class="raycast-row-title preferences-source-path">{dir.path}</span>
                        <span class="raycast-row-subtitle">
                          自定义 · {dir.enabled ? dir.recursive ? "递归遍历子目录" : "仅顶层目录" : "已停用"}{dir.exclusions.length ? ` · 排除 ${dir.exclusions.length} 条规则` : ""}
                        </span>
                      </div>
                      <div class="raycast-row-control preferences-source-controls">
                        <RaycastSwitch checked={dir.enabled} onChange={v => updateDirectory(dir.id, { enabled: v })} label={`扫描目录 ${dir.path}`} />
                        <button type="button" class="raycast-btn" onClick={() => setDirectory(structuredClone(dir))} title="编辑扫描规则" aria-label={`编辑扫描规则 ${dir.path}`}>
                          <SlidersHorizontal size={13} />
                        </button>
                        <button type="button" class="raycast-btn danger" onClick={() => change("directories", draft().directories.filter(d => d.id !== dir.id))} title="删除目录" aria-label={`删除目录 ${dir.path}`}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )}</For>
                </div>
              </div>

              <Show when={systemSources().length}>
                <div class="raycast-group" id="setting-system-sources">
                  <div class="raycast-group-title">系统应用来源</div>
                  <div class="raycast-group-rows">
                    <For each={systemSources()}>{source => (
                      <div class="raycast-row preferences-source-row">
                        <Dynamic component={source.kind === "registry" ? HardDrive : AppWindow} size={16} class="preferences-source-icon" />
                        <div class="raycast-row-info">
                          <span class="raycast-row-title">{source.name}</span>
                          <span class="raycast-row-subtitle preferences-source-path">{source.path}</span>
                        </div>
                        <span class="preferences-source-tag">{source.kind === "registry" ? "32 / 64 位" : "Shell"}</span>
                      </div>
                    )}</For>
                  </div>
                </div>
              </Show>
            </Show>


            {/* Advanced Section */}
            <Show when={section() === "advanced"}>
              <div class="raycast-group" id="setting-advanced">
                <div class="raycast-group-title">配置文件管理</div>
                <div class="raycast-group-rows">
                  <div class="raycast-row">
                    <div class="raycast-row-info">
                      <span class="raycast-row-title">导出配置备份</span>
                      <span class="raycast-row-subtitle">将当前所有偏好设置、快捷键、扫描目录与分类备份为 JSON 文件</span>
                    </div>
                    <div class="raycast-row-control">
                      <button type="button" class="raycast-btn" onClick={() => void exportConfig()}>
                        <ArrowUpFromLine size={13} /> 导出配置
                      </button>
                    </div>
                  </div>
                  <div class="raycast-row">
                    <div class="raycast-row-info">
                      <span class="raycast-row-title">导入配置备份</span>
                      <span class="raycast-row-subtitle">从已导出的 JSON 备份文件中还原偏好设置</span>
                    </div>
                    <div class="raycast-row-control">
                      <button type="button" class="raycast-btn" onClick={() => setConfirm("import")}>
                        <ArrowDownToLine size={13} /> 导入配置
                      </button>
                    </div>
                  </div>
                  <div class="raycast-row">
                    <div class="raycast-row-info">
                      <span class="raycast-row-title">恢复出厂设置</span>
                      <span class="raycast-row-subtitle">将外观、快捷键与扫描目录重置为出厂初始状态（保留应用整理数据）</span>
                    </div>
                    <div class="raycast-row-control">
                      <button type="button" class="raycast-btn danger" onClick={() => setConfirm("reset")}>
                        <RotateCcw size={13} /> 恢复出厂设置
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="raycast-group" id="setting-privacy">
                <div class="raycast-group-title">隐私与本地安全</div>
                <div class="raycast-group-rows">
                  <div class="raycast-row">
                    <div class="raycast-row-info">
                      <span class="raycast-row-title">纯本地数据保护</span>
                      <span class="raycast-row-subtitle">WinSpot 绝不上报任何个人隐私数据，无遥测、无后台追踪</span>
                    </div>
                    <div class="raycast-row-control">
                      <ShieldCheck size={18} color="#34c759" />
                    </div>
                  </div>
                </div>
              </div>
            </Show>

            {/* About Section */}
            <Show when={section() === "about"}>
              <div class="raycast-group" id="setting-about" style={{ "text-align": "center", padding: "20px 0" }}>
                <div style={{ display: "inline-flex", "margin-bottom": "14px" }}>
                  <BrandMark size={64} />
                </div>
                <h2 style={{ "font-size": "22px", "font-weight": "700", margin: "0 0 6px 0", color: "var(--rc-text-primary)" }}>
                  WinSpot
                </h2>
                <div style={{ "font-size": "13px", color: "var(--rc-text-secondary)", "margin-bottom": "24px" }}>
                  版本 0.1.0 · Windows 效率启动器
                </div>

                <div class="raycast-group-rows" style={{ "text-align": "left", "max-width": "540px", margin: "0 auto" }}>
                  <div class="raycast-row">
                    <div class="raycast-row-info">
                      <span class="raycast-row-title">运行环境与平台</span>
                      <span class="raycast-row-subtitle">Windows 11 · x64 现代外壳</span>
                    </div>
                    <Cpu size={16} color="var(--rc-text-secondary)" />
                  </div>
                  <div class="raycast-row">
                    <div class="raycast-row-info">
                      <span class="raycast-row-title">核心引擎架构</span>
                      <span class="raycast-row-subtitle">Tauri v2 + Rust + SolidJS</span>
                    </div>
                    <Terminal size={16} color="var(--rc-text-secondary)" />
                  </div>
                  <div class="raycast-row">
                    <div class="raycast-row-info">
                      <span class="raycast-row-title">版本更新状态</span>
                      <span class="raycast-row-subtitle">当前已是最新稳定版本 (v0.1.0)</span>
                    </div>
                    <button type="button" class="raycast-btn" onClick={() => showToast("已是最新版本 (v0.1.0)")}>
                      检查更新
                    </button>
                  </div>
                </div>
              </div>
            </Show>

          </div>
        </div>
      </div>

      {/* Editor Modal for Apps */}
      <Show when={editor()}>
        {app => <AppEditor app={app()} settings={draft()} close={() => setEditor(undefined)} report={props.report} />}
      </Show>

      {/* New Category Modal */}
      <Show when={categoryModalOpen()}>
        <RaycastModal title="新建分类标签" onClose={() => setCategoryModalOpen(false)} width="400px">
          <form
            onSubmit={e => {
              e.preventDefault();
              addCategory();
            }}
            style={{ display: "flex", "flex-direction": "column", gap: "14px" }}
          >
            <div style={{ display: "flex", "flex-direction": "column", gap: "6px" }}>
              <label style={{ "font-size": "12px", "font-weight": "500", color: "var(--rc-text-secondary)" }}>
                分类名称
              </label>
              <input
                type="text"
                class="rc-input"
                placeholder="例如：多媒体、办公套件..."
                value={newCategoryName()}
                onInput={e => setNewCategoryName(e.currentTarget.value)}
                autofocus
              />
            </div>
            <div style={{ display: "flex", "justify-content": "flex-end", gap: "8px", "margin-top": "6px" }}>
              <button type="button" class="raycast-btn" onClick={() => setCategoryModalOpen(false)}>
                取消
              </button>
              <button
                type="submit"
                class="raycast-btn primary"
                disabled={!newCategoryName().trim()}
              >
                创建分类
              </button>
            </div>
          </form>
        </RaycastModal>
      </Show>

      {/* Directory Exclusion Settings Modal */}
      <Show when={directory()}>
        {dir => <DirectoryDialog value={dir()} close={() => setDirectory(undefined)}
          save={value => { updateDirectory(value.id, value); setDirectory(undefined); }} />}
      </Show>

      {/* Confirm Message Box */}
      <Show when={confirm()}>
        <RaycastModal
          title={confirm() === "reset" ? "恢复出厂默认设置？" : "导入配置文件？"}
          onClose={() => setConfirm(undefined)}
        >
          <p style={{ "font-size": "13px", color: "var(--rc-text-secondary)", "line-height": "1.5", margin: "0 0 16px 0" }}>
            {confirm() === "reset"
              ? "外观、快捷键与扫描目录将还原为出厂默认状态，已建立的应用整理记录将保留。"
              : "导入的配置文件将替换当前的所有外观、快捷键与目录设置。"}
          </p>
          <div style={{ display: "flex", "justify-content": "flex-end", gap: "10px" }}>
            <button type="button" class="raycast-btn" onClick={() => setConfirm(undefined)}>取消</button>
            <button
              type="button"
              class={`raycast-btn ${confirm() === "reset" ? "danger" : "primary"}`}
              onClick={() => void confirmAction()}
            >
              {confirm() === "import" ? "选择配置文件" : "确认恢复"}
            </button>
          </div>
        </RaycastModal>
      </Show>

      {/* Scan Errors Modal */}
      <Show when={showErrors()}>
        <RaycastModal title="扫描提示信息" onClose={() => setShowErrors(false)}>
          <ul style={{ "padding-left": "20px", "font-size": "12px", color: "var(--rc-text-secondary)", "line-height": "1.7", "margin-bottom": "16px" }}>
            <For each={props.scan.errors}>{error => <li>{error}</li>}</For>
          </ul>
          <div style={{ display: "flex", "justify-content": "flex-end" }}>
            <button type="button" class="raycast-btn primary" onClick={() => setShowErrors(false)}>完成</button>
          </div>
        </RaycastModal>
      </Show>

      {/* Toast Notification */}
      <Show when={toastMessage()}>
        {msg => (
          <div class="toast">
            <span style={{ "font-weight": "600", color: "var(--rc-accent)" }}>{msg().title ?? "WinSpot"}</span>
            <span style={{ color: "var(--rc-text-primary)" }}>{msg().text}</span>
          </div>
        )}
      </Show>
    </div>
  );
}

function DirectoryDialog(props: { value: ScanDirectory; close: () => void; save: (value: ScanDirectory) => void }) {
  const [recursive, setRecursive] = createSignal(props.value.recursive);
  const [exclusions, setExclusions] = createSignal(props.value.exclusions.join("\n"));

  return (
    <RaycastModal title="目录扫描规则设置" onClose={props.close} width="500px">
      <div style={{
        "font-size": "11.5px",
        "font-family": "monospace",
        color: "var(--rc-text-secondary)",
        "word-break": "break-all",
        padding: "8px 10px",
        background: "var(--rc-input-bg)",
        border: "1px solid var(--rc-control-border)",
        "border-radius": "6px",
        "margin-bottom": "14px"
      }}>
        {props.value.path}
      </div>
      <div class="rc-modal-card" style={{ "margin-bottom": "14px" }}>
        <div class="rc-modal-row">
          <div style={{ display: "flex", "flex-direction": "column", gap: "2px" }}>
            <span class="rc-modal-row-label">递归扫描子目录</span>
            <span style={{ "font-size": "11px", color: "var(--rc-text-secondary)" }}>自动检索该目录下所有深层子文件夹中的应用</span>
          </div>
          <RaycastSwitch checked={recursive()} onChange={setRecursive} label="递归扫描" />
        </div>
      </div>
      <div>
        <label style={{ "font-size": "12px", "font-weight": "500", color: "var(--rc-text-secondary)", display: "block", "margin-bottom": "6px" }}>
          排除路径规则（每行一条）
        </label>
        <textarea
          class="rc-textarea"
          style={{ height: "96px" }}
          placeholder={"node_modules\n.git\ncache"}
          value={exclusions()}
          onInput={e => setExclusions(e.currentTarget.value)}
        />
      </div>
      <div class="rc-modal-footer">
        <button type="button" class="raycast-btn" onClick={props.close}>取消</button>
        <button
          type="button"
          class="raycast-btn primary"
          onClick={() => props.save({
            ...props.value,
            recursive: recursive(),
            exclusions: exclusions().split("\n").map(s => s.trim()).filter(Boolean),
          })}
        >
          <Check size={13} /> 保存
        </button>
      </div>
    </RaycastModal>
  );
}
