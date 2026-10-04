export interface ScanDirectory {
  id: string;
  path: string;
  enabled: boolean;
  recursive: boolean;
  exclusions: string[];
}

export interface FileSearchSettings {
  enabled: boolean;
  everythingEnabled: boolean;
  everythingPath: string;
  fallbackEnabled: boolean;
  directories: string[];
}

export interface ScanSource {
  id: string;
  name: string;
  path: string;
  kind: "directory" | "registry" | "shell";
}

export interface Settings {
  schemaVersion: number;
  theme: "system" | "light" | "dark";
  blur: number;
  opacity: number;
  glassTint: string;
  glassSaturation: number;
  panelRadius: number;
  iconSize: number;
  density: "comfortable" | "compact";
  reducedMotion: boolean;
  libraryShortcut: string;
  searchShortcut: string;
  captureWin: boolean;
  autostart: boolean;
  monitor: string;
  directories: ScanDirectory[];
  fileSearch: FileSearchSettings;
  categories: string[];
}

export interface Application {
  id: string;
  name: string;
  originalName: string;
  target: string;
  resolvedTarget: string | null;
  launchArguments: string | null;
  workingDirectory: string | null;
  kind: "shortcut" | "executable" | "packaged";
  source: string;
  category: string;
  icon: string | null;
  alias: string;
  pinned: boolean;
  hidden: boolean;
  filtered: boolean;
  filterReason: string | null;
  available: boolean;
  excluded: boolean;
  order: number;
  launchCount: number;
  lastLaunched: number;
}

export interface FileResult {
  id: string;
  name: string;
  path: string;
  kind: "file" | "directory";
  extension: string | null;
  size: number | null;
  modifiedAt: number | null;
  available: boolean;
  previewKey: string | null;
}

export interface FilePreview {
  thumbnail: string | null;
  detail: string | null;
}

export type SearchItem =
  | { kind: "app"; app: Application }
  | { kind: "file"; file: FileResult };

export type FileSearchProvider = "everything" | "fallback" | "disabled" | "unavailable" | "notUsed";

export interface SearchResponse {
  items: SearchItem[];
  fileProvider: FileSearchProvider;
  fileDetail: string | null;
}

export type AppOverride = Pick<Application, "id" | "name" | "alias" | "category" | "pinned" | "hidden" | "filtered" | "order">;

export interface ScanStatus {
  running: boolean;
  scanned: number;
  found: number;
  errors: string[];
  cancelled: boolean;
  finishedAt: number;
}

export interface MaterialSurface {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  opacity: number;
}

export interface MaterialAppearance {
  blur: number;
  opacity: number;
  tint: string;
  saturation: number;
  dark: boolean;
  radius: number;
}

export interface MaterialScene {
  revision: number;
  surfaces: MaterialSurface[];
  interactions: MaterialSurface[];
  overlay: boolean;
  appearance: MaterialAppearance;
}

export interface BackdropState {
  available: boolean;
  transparencyEnabled: boolean;
  revision: number;
}

export interface Bootstrap {
  settings: Settings;
  apps: Application[];
  scan: ScanStatus;
  scanSources: ScanSource[];
  monitors: { id: string; name: string }[];
  capturePaused: boolean;
  startupErrors: string[];
  startHidden: boolean;
  backdrop: BackdropState;
}

export type Mode = "home" | "apps" | "files";
export const defaults: Settings = {
  schemaVersion: 1,
  theme: "system",
  blur: 24,
  opacity: 80,
  glassTint: "auto",
  glassSaturation: 140,
  panelRadius: 26,
  iconSize: 64,
  density: "comfortable",
  reducedMotion: false,
  libraryShortcut: "Super",
  searchShortcut: "Alt+Space",
  captureWin: true,
  autostart: false,
  monitor: "cursor",
  directories: [],
  fileSearch: {
    enabled: true,
    everythingEnabled: true,
    everythingPath: "",
    fallbackEnabled: true,
    directories: [],
  },
  categories: ["社交", "开发者工具", "工具", "效率与财务", "娱乐", "创意", "信息与阅读", "其他"],
};

export const emptyScan: ScanStatus = {
  running: false, scanned: 0, found: 0, errors: [], cancelled: false, finishedAt: 0,
};

export function toOverride(app: Application, patch: Partial<AppOverride> = {}): AppOverride {
  return { id: app.id, name: app.name, alias: app.alias, category: app.category,
    pinned: app.pinned, hidden: app.hidden, filtered: app.filtered, order: app.order, ...patch };
}
