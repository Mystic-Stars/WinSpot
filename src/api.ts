import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { defaults, emptyScan, type AppOverride, type Application, type Bootstrap, type FilePreview, type MaterialAppearance, type MaterialScene, type Mode, type SearchResponse, type Settings } from "./types";

export const desktop = isTauri();

const STORAGE_SETTINGS = "winspot_settings_storage";

function loadLocalSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...defaults,
        ...parsed,
        fileSearch: { ...defaults.fileSearch, ...(parsed.fileSearch || {}) },
      };
    }
  } catch {}
  return structuredClone(defaults);
}

function saveLocalSettings(settings: Settings) {
  try {
    localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings));
  } catch {}
}

const mockListeners = new Map<string, Set<(data: any) => void>>();

export function dispatchMockEvent(event: string, payload: any) {
  const set = mockListeners.get(event);
  if (set) {
    set.forEach(cb => {
      try { cb(payload); } catch (e) { console.error(e); }
    });
  }
}

export const api = {
  bootstrap: (): Promise<Bootstrap> => desktop ? invoke("bootstrap") : Promise.resolve({
    settings: loadLocalSettings(),
    apps: [
      { id: "mock-1", name: "Google Chrome", originalName: "Google Chrome", target: "C:\\Chrome\\chrome.exe", resolvedTarget: "C:\\Chrome\\chrome.exe", launchArguments: null, workingDirectory: null, kind: "executable", source: "系统", category: "开发工具", icon: null, alias: "gc,chrome", pinned: true, hidden: false, filtered: false, filterReason: null, available: true, excluded: false, order: 0, launchCount: 12, lastLaunched: Date.now() },
      { id: "mock-2", name: "Visual Studio Code", originalName: "Code", target: "C:\\VSCode\\Code.exe", resolvedTarget: "C:\\VSCode\\Code.exe", launchArguments: null, workingDirectory: null, kind: "executable", source: "系统", category: "开发工具", icon: null, alias: "vs,code", pinned: true, hidden: false, filtered: false, filterReason: null, available: true, excluded: false, order: 1, launchCount: 30, lastLaunched: Date.now() },
      { id: "mock-3", name: "微信", originalName: "WeChat", target: "C:\\WeChat\\WeChat.exe", resolvedTarget: "C:\\WeChat\\WeChat.exe", launchArguments: null, workingDirectory: null, kind: "executable", source: "系统", category: "社交", icon: null, alias: "wx", pinned: false, hidden: false, filtered: false, filterReason: null, available: true, excluded: false, order: 2, launchCount: 5, lastLaunched: Date.now() },
    ],
    scan: { ...emptyScan, finishedAt: Math.floor(Date.now() / 1000), found: 3 },
    scanSources: [],
    monitors: [{ id: "cursor", name: "跟随鼠标所在显示器" }, { id: "mon-1", name: "主显示器 · 2560 × 1440" }],
    capturePaused: false, startupErrors: [], startHidden: false,
    backdrop: { available: false, transparencyEnabled: true, revision: 0 },
  }),
  updateMaterial: (scene: MaterialScene) => desktop
    ? invoke<void>("update_material", { scene })
    : Promise.resolve(),
  previewMaterial: (appearance: MaterialAppearance) => desktop
    ? invoke<void>("preview_material", { appearance })
    : Promise.resolve(),
  search: (query: string, scope: "all" | "apps" | "files" = "all", limit = 100) =>
    desktop
      ? invoke<SearchResponse>("search_items", { query, scope, limit })
      : Promise.resolve({ items: [], fileProvider: "unavailable", fileDetail: "浏览器预览不执行文件搜索" } as SearchResponse),
  launch: (id: string) => desktop ? invoke<void>("launch_app", { id }) : Promise.resolve(),
  scan: () => desktop ? invoke<void>("start_scan") : Promise.resolve(),
  cancelScan: () => desktop ? invoke<void>("cancel_scan") : Promise.resolve(),
  saveSettings: async (settings: Settings) => {
    if (desktop) {
      await invoke<void>("save_settings", { settings });
    } else {
      saveLocalSettings(settings);
      dispatchMockEvent("settings-changed", settings);
    }
  },
  updateApp: (value: AppOverride) => desktop ? invoke<void>("update_app", { value }) : Promise.resolve(),
  show: (mode: Mode, toggle = false) => desktop ? invoke<void>("show_view", { mode, toggle }) : Promise.resolve(),
  hide: () => desktop ? invoke<void>("hide_launcher") : Promise.resolve(),
  settings: () => desktop ? invoke<void>("open_settings") : Promise.resolve(),
  resize: (height: number) => desktop ? invoke<void>("resize_launcher", { height }) : Promise.resolve(),
  openFile: (path: string) => desktop ? invoke<void>("open_file", { path }) : Promise.resolve(),
  revealFile: (path: string) => desktop ? invoke<void>("reveal_file", { path }) : Promise.resolve(),
  filePreview: (id: string, previewKey: string): Promise<FilePreview> => desktop
    ? invoke<FilePreview>("file_preview", { id, previewKey })
    : Promise.resolve({ thumbnail: null, detail: "浏览器预览不读取本地图片" }),
  exportConfig: (path: string) => desktop ? invoke<void>("export_config", { path }) : Promise.resolve(),
  importConfig: (path: string) => desktop ? invoke<void>("import_config", { path }) : Promise.resolve(),
  reset: async () => {
    if (desktop) {
      await invoke<void>("reset_settings");
    } else {
      saveLocalSettings(defaults);
      dispatchMockEvent("settings-changed", defaults);
    }
  },
  pause: (paused: boolean) => desktop ? invoke<void>("set_capture_paused", { paused }) : Promise.resolve(),
  recording: (recording: boolean) => desktop ? invoke<void>("set_shortcut_recording", { recording }) : Promise.resolve(),
  installUpdate: async () => {
    if (!desktop) return false;
    const update = await check();
    if (!update) return false;
    await update.downloadAndInstall();
    await relaunch();
    return true;
  },
};

export async function subscribe<T>(event: string, fn: (value: T) => void) {
  if (desktop) {
    return listen<T>(event, e => fn(e.payload));
  }
  if (!mockListeners.has(event)) {
    mockListeners.set(event, new Set());
  }
  const set = mockListeners.get(event)!;
  set.add(fn);
  return () => { set.delete(fn); };
}

export function iconUrl(path: string) { return convertFileSrc(path); }

export async function chooseApp() {
  if (!desktop) throw new Error("请在 WinSpot 桌面应用中添加软件");
  const path = await open({ title: "添加应用", multiple: false, directory: false,
    filters: [{ name: "应用程序", extensions: ["exe", "lnk"] }] });
  if (typeof path === "string") await invoke("add_app", { path });
}

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
