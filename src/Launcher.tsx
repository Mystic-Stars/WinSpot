import { batch, createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show, type JSX } from "solid-js";
import {
  ArrowLeft, ArrowUpRight, Ellipsis, FolderOpen, Grid2X2, Plus, Search,
  Settings2, Pin, RefreshCw, X, SlidersHorizontal,
} from "lucide-solid";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api, chooseApp, desktop } from "./api";
import { AppIcon, BrandMark, EmptyState, Spinner, Win11Mark } from "./components";
import AppEditor from "./AppEditor";
import FileVisual from "./FileVisual";
import { fileTypeLabel } from "./fileIcons";
import { displayWindowsPath } from "./paths";
import { type Application, type FileResult, type FileSearchProvider, type Mode, type ScanStatus, type SearchItem, type Settings } from "./types";

const CATEGORY_TABS = [
  "社交",
  "开发者工具",
  "工具",
  "效率与财务",
  "娱乐",
  "创意",
  "信息与阅读",
  "其他",
] as const;

function matchCategory(appCat: string, targetCat: string): boolean {
  if (appCat === targetCat) return true;
  if (targetCat === "开发者工具" && (appCat === "开发工具" || appCat === "开发者工具")) return true;
  if (targetCat === "工具" && (appCat === "系统工具" || appCat === "工具")) return true;
  if (targetCat === "效率与财务" && (appCat === "效率" || appCat === "效率与财务")) return true;
  if (targetCat === "信息与阅读" && (appCat === "阅读" || appCat === "信息与阅读")) return true;
  if (targetCat === "其他") {
    const known = ["社交", "开发者工具", "开发工具", "工具", "系统工具", "效率与财务", "效率", "娱乐", "创意", "信息与阅读", "阅读"];
    return !known.includes(appCat) || appCat === "其他";
  }
  return false;
}

function formatFileSize(size: number | null): string {
  if (size === null) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function Launcher(props: {
  apps: Application[]; settings: Settings; scan: ScanStatus; mode: Mode; openVersion: number;
  visible: boolean; ready: boolean; show: (mode: Mode) => void; report: (e: unknown) => void;
}) {
  const [query, setQuery] = createSignal("");
  const [category, setCategory] = createSignal("全部");
  const [results, setResults] = createSignal<SearchItem[]>([]);
  const [searching, setSearching] = createSignal(false);
  const [fileProvider, setFileProvider] = createSignal<FileSearchProvider>("notUsed");
  const [fileDetail, setFileDetail] = createSignal<string>();
  const [selected, setSelected] = createSignal(0);
  const [scroll, setScroll] = createSignal(0);
  const [menu, setMenu] = createSignal(false);
  const [editor, setEditor] = createSignal<Application>();
  const [launching, setLaunching] = createSignal<string>();
  const [openingFile, setOpeningFile] = createSignal<string>();
  const [keyboardMode, setKeyboardMode] = createSignal(false);
  const [selectedByMouse, setSelectedByMouse] = createSignal(false);
  const [composing, setComposing] = createSignal(false);
  const [scopesHovered, setScopesHovered] = createSignal(false);
  let hideScopesTimer: ReturnType<typeof setTimeout> | undefined;
  let longPressTimer: ReturnType<typeof setTimeout> | undefined;
  let isLongPressTriggered = false;
  let input: HTMLInputElement | undefined;
  let measureSpan: HTMLSpanElement | undefined;
  const [inputWidth, setInputWidth] = createSignal(120);
  let grid: HTMLDivElement | undefined;
  let list: HTMLDivElement | undefined;
  let menuRef: HTMLDivElement | undefined;
  let searchTimer: ReturnType<typeof setTimeout>;
  let focusFrame: number | undefined;
  let request = 0;
  let disposed = false;
  const restoreInputFocus = () => {
    if (disposed || composing() || !props.visible || editor()) return;
    if (focusFrame !== undefined) cancelAnimationFrame(focusFrame);
    focusFrame = requestAnimationFrame(() => {
      focusFrame = undefined;
      if (!disposed && !composing() && props.visible && !editor() && input?.isConnected) {
        input.focus({ preventScroll: true });
      }
    });
  };
  const handleInput: JSX.EventHandler<HTMLInputElement, InputEvent> = e => {
    // Keep provisional IME text in the input until composition commits.
    if (!composing() && !e.isComposing) setQuery(e.currentTarget.value);
  };
  const handleCompositionStart = () => setComposing(true);
  const handleCompositionEnd: JSX.EventHandler<HTMLInputElement, CompositionEvent> = e => {
    batch(() => {
      setQuery(e.currentTarget.value);
      setComposing(false);
    });
  };
  const savedPositions: Record<Mode, { selected: number; scroll: number }> = {
    home: { selected: 0, scroll: 0 },
    apps: { selected: 0, scroll: 0 },
    files: { selected: 0, scroll: 0 },
  };
  let lastMode: Mode = props.mode;
  let lastQuery = "";

  const hasQuery = createMemo(() => query().trim().length > 0);
  const visibleApps = createMemo(() => (props.apps || []).filter(a => !a.hidden && !a.filtered && !a.excluded));
  const appResults = createMemo(() => results().flatMap(item => item.kind === "app" ? [item.app] : []));
  const searchItems = createMemo(() => results().slice(0, 100));
  const searchHeight = createMemo(() => {
    if (!hasQuery()) return 84;
    const files = searchItems().flatMap(item => item.kind === "file" ? [item.file] : []);
    const minimum = files.some(file => file.previewKey) ? 500 : files.length ? 420 : 260;
    return Math.min(520, Math.max(minimum, searchItems().length * 48 + 110));
  });
  const morphHeight = createMemo(() => {
    if (props.mode === "apps") return 600;
    if (hasQuery()) return searchHeight();
    return 60;
  });
  const morphRadius = createMemo(() => {
    if (props.mode === "apps") return props.settings.panelRadius;
    if (hasQuery()) return Math.round(props.settings.panelRadius * 20 / 26);
    return 30;
  });
  const selectedItem = createMemo(() => searchItems()[selected()]);
  const selectedApp = createMemo(() => {
    const item = selectedItem();
    return item?.kind === "app" ? item.app : undefined;
  });
  const selectedFile = createMemo(() => {
    const item = selectedItem();
    return item?.kind === "file" ? item.file : undefined;
  });

  const recommendedApps = createMemo(() => {
    const all = visibleApps() || [];
    if (!all.length) return [];
    const sorted = [...all].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const timeDiff = (b.lastLaunched || 0) - (a.lastLaunched || 0);
      if (timeDiff !== 0) return timeDiff;
      const countDiff = (b.launchCount || 0) - (a.launchCount || 0);
      if (countDiff !== 0) return countDiff;
      return a.order - b.order;
    });
    return sorted.slice(0, 7);
  });

  const showRecommended = () => !hasQuery() && category() === "全部" && (recommendedApps()?.length || 0) > 0;

  const mainGridApps = createMemo(() => {
    if (hasQuery()) return appResults() || [];
    const cat = category();
    const all = visibleApps() || [];
    if (cat === "全部") {
      if (showRecommended()) {
        const recList = recommendedApps() || [];
        const recIds = new Set(recList.map(a => a.id));
        const remaining = all.filter(a => !recIds.has(a.id));
        return remaining.length ? remaining : all;
      }
      return all;
    }
    return all.filter(a => matchCategory(a.category, cat));
  });

  const libraryItems = createMemo(() => {
    const gridApps = mainGridApps() || [];
    return showRecommended() ? [...(recommendedApps() || []), ...gridApps] : gridApps;
  });
  const libraryRowHeight = 110;
  const items = createMemo<SearchItem[]>(() =>
    props.mode === "apps"
      ? libraryItems().map(app => ({ kind: "app", app }))
      : searchItems(),
  );
  const searchStart = createMemo(() => Math.max(0, Math.floor(scroll() / 48) - 1));
  const searchVisible = createMemo(() => searchItems().slice(searchStart(), searchStart() + 14));
  const fileProviderLabel = () => {
    if (fileProvider() === "everything") return "Everything";
    if (fileProvider() === "fallback") return "本地降级";
    if (fileProvider() === "disabled") return "文件搜索已关闭";
    if (fileProvider() === "unavailable") return "Everything 不可用";
    return "";
  };

  const activeSelectedApp = createMemo(() => {
    if (hasQuery()) {
      const list = mainGridApps() || [];
      if (list.length > 0) {
        const idx = Math.min(Math.max(0, selected()), list.length - 1);
        return list[idx] || list[0];
      }
      const text = query().trim().toLowerCase();
      if (!text) return undefined;
      const all = visibleApps() || [];
      return all.find(a => a.name.toLowerCase().startsWith(text))
        || all.find(a => a.name.toLowerCase().includes(text));
    }
    if (selectedByMouse() || keyboardMode()) {
      const list = libraryItems() || [];
      if (list.length > 0) {
        const idx = Math.min(Math.max(0, selected()), list.length - 1);
        return list[idx];
      }
    }
    return undefined;
  });

  const matchPillText = createMemo(() => {
    const app = activeSelectedApp();
    if (!app) return "";
    const text = query().trim();
    if (!text) return `${app.name} - 打开`;
    const name = app.name;
    if (name.toLowerCase().startsWith(text.toLowerCase())) return `${name.slice(text.length)} - 打开`;
    return `- ${name}`;
  });

  const isTileSelected = (idx: number) => {
    if (hasQuery()) return mainGridApps().length > 0 && selected() === idx;
    return (keyboardMode() || selectedByMouse()) && selected() === idx;
  };

  const handleTilePointerDown = (e: PointerEvent, idx: number) => {
    if (e.button !== 0) return;
    isLongPressTriggered = false;
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      isLongPressTriggered = true;
      batch(() => {
        setSelected(idx);
        setSelectedByMouse(true);
      });
    }, 220);
  };

  const handleTilePointerUp = () => clearTimeout(longPressTimer);
  const handleTilePointerLeave = () => clearTimeout(longPressTimer);

  const run = async (app: Application) => {
    if (launching()) return;
    setLaunching(app.id);
    setMenu(false);
    try {
      await api.launch(app.id);
    } catch (e) {
      props.report(e);
    } finally {
      setLaunching(undefined);
    }
  };

  const openFile = async (file: FileResult) => {
    if (openingFile()) return;
    setOpeningFile(file.id);
    try {
      await api.openFile(file.path);
    } catch (e) {
      props.report(e);
    } finally {
      setOpeningFile(undefined);
    }
  };

  const revealFile = async (file: FileResult) => {
    try {
      await api.revealFile(file.path);
    } catch (e) {
      props.report(e);
    }
  };

  const runItem = async (item: SearchItem | undefined) => {
    if (!item) return;
    if (item.kind === "app") await run(item.app);
    else await openFile(item.file);
  };

  const handleTileClick = (e: MouseEvent, app: Application) => {
    if (isLongPressTriggered) {
      e.preventDefault();
      e.stopPropagation();
      isLongPressTriggered = false;
      return;
    }
    void run(app);
  };

  const measureTextWidth = (text: string): number => {
    if (!text) return 120;
    if (measureSpan && measureSpan.isConnected) {
      measureSpan.textContent = text;
      const rect = measureSpan.getBoundingClientRect();
      if (rect.width > 0) {
        return Math.ceil(rect.width) + 4;
      }
    }
    let estimated = 0;
    for (const ch of text) {
      estimated += ch.charCodeAt(0) > 255 ? 16 : 9.5;
    }
    return Math.max(16, Math.ceil(estimated) + 6);
  };

  createEffect(on(() => [query(), props.mode] as const, ([text, mode]) => {
    if (!text) {
      setInputWidth(120);
      return;
    }
    setInputWidth(measureTextWidth(text));
    if (mode === "apps") {
      requestAnimationFrame(() => {
        if (!disposed && measureSpan && measureSpan.isConnected) {
          measureSpan.textContent = text;
          const rect = measureSpan.getBoundingClientRect();
          if (rect.width > 0) {
            setInputWidth(Math.ceil(rect.width) + 4);
          }
        }
      });
    }
  }));

  createEffect(on(() => [query(), props.apps, props.mode, props.visible, props.settings, composing()] as const, ([text, , mode, visible, , isComposing]) => {
    clearTimeout(searchTimer);
    const current = ++request;
    setSearching(false);
    const modeChanged = mode !== lastMode;
    const queryChanged = text !== lastQuery;
    if (modeChanged) {
      savedPositions[lastMode] = { selected: selected(), scroll: scroll() };
      const restored = savedPositions[mode];
      setSelected(restored.selected);
      setScroll(restored.scroll);
      requestAnimationFrame(() => {
        if (mode === "apps") grid?.scrollTo(0, restored.scroll);
        else list?.scrollTo(0, restored.scroll);
      });
    } else if (queryChanged || !visible) {
      setSelected(0);
      setScroll(0);
      grid?.scrollTo(0, 0);
      list?.scrollTo(0, 0);
    }
    lastMode = mode;
    lastQuery = text;
    if (!text.trim() || !visible) {
      setResults([]);
      setFileProvider("notUsed");
      setFileDetail(undefined);
      return;
    }
    if (isComposing) return;
    const scope = mode === "home" ? "all" : mode === "files" ? "files" : "apps";
    if (!desktop) {
      const needle = text.trim().toLowerCase();
      if (scope === "files") {
        setResults([]);
        setFileProvider("unavailable");
        setFileDetail("浏览器预览不执行文件搜索");
      } else {
        setResults(visibleApps()
          .filter(app => `${app.name} ${app.alias}`.toLowerCase().includes(needle))
          .map(app => ({ kind: "app", app })));
        setFileProvider("unavailable");
        setFileDetail("浏览器预览不执行文件搜索");
      }
      return;
    }
    setSearching(true);
    searchTimer = setTimeout(() => {
      void api.search(text, scope, mode === "apps" ? 10_000 : 100).then(data => {
        if (!disposed && current === request) {
          setResults(data.items);
          setFileProvider(data.fileProvider);
          setFileDetail(data.fileDetail || undefined);
        }
      }).catch(props.report).finally(() => {
        if (!disposed && current === request) setSearching(false);
      });
    }, 35);
  }));

  createEffect(on(() => props.openVersion, () => {
    batch(() => {
      setMenu(false);
      setEditor(undefined);
      setSelected(0);
      setScroll(0);
      setKeyboardMode(false);
      setSelectedByMouse(false);
      setScopesHovered(false);
    });
    restoreInputFocus();
  }));

  createEffect(on(() => props.mode, () => {
    setScopesHovered(false);
    restoreInputFocus();
  }));

  createEffect(on(() => [category(), props.mode] as const, () => {
    setScroll(0);
    setSelected(0);
    setSelectedByMouse(false);
    grid?.scrollTo(0, 0);
    list?.scrollTo(0, 0);
  }));

  createEffect(on(() => [props.mode, props.visible, props.openVersion, composing(), searchHeight()] as const, ([mode, visible, , isComposing, height]) => {
    if (mode !== "apps" && desktop && visible && !isComposing) {
      void api.resize(height).catch(props.report);
    }
  }));

  const ensureSelected = (index: number) => {
    if (props.mode === "apps" && grid) {
      const top = Math.floor(index / 7) * libraryRowHeight;
      if (top < grid.scrollTop) grid.scrollTop = top;
      else if (top + libraryRowHeight > grid.scrollTop + grid.clientHeight) grid.scrollTop = top + libraryRowHeight - grid.clientHeight;
    } else if (list) {
      const top = index * 48;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (top + 48 > list.scrollTop + list.clientHeight) list.scrollTop = top + 48 - list.clientHeight;
    }
  };

  const onKey = (e: KeyboardEvent) => {
    // IME boundary keydowns can report isComposing=false while keyCode is 229.
    if (editor() || composing() || e.isComposing || e.keyCode === 229 || !props.visible) return;
    if (e.key === "Tab" && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      if (props.mode === "files") {
        props.show("home");
      } else {
        props.show(props.mode === "apps" ? "home" : "apps");
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setSelectedByMouse(false);
      if (menu()) setMenu(false);
      else if (query()) {
        setQuery("");
        input?.focus();
      } else if (props.mode === "files") {
        props.show("home");
      } else if (desktop) {
        void api.hide().catch(props.report);
      }
      return;
    }
    if (e.key === "Backspace" && props.mode === "files" && !query() && (document.activeElement === input || document.activeElement === document.body)) {
      e.preventDefault();
      props.show("home");
      return;
    }
    const activeElement = document.activeElement;
    if (e.key === "Enter" && (
      activeElement === input
      || activeElement === document.body
      || activeElement?.classList.contains("app-tile")
      || activeElement?.classList.contains("spotlight-item-row")
    )) {
      e.preventDefault();
      const item = props.mode === "apps"
        ? (activeSelectedApp() ? { kind: "app" as const, app: activeSelectedApp()! } : items()[selected()])
        : items()[selected()];
      void runItem(item);
      return;
    }
    const allItems = items();
    const isAtInputEnd = activeElement === input && input?.selectionStart === input?.value.length;
    const isAtInputStart = activeElement === input && input?.selectionStart === 0;
    const isSingleRow = props.mode === "apps" && hasQuery() && allItems.length <= 7;
    const delta = e.key === "ArrowDown"
      ? (props.mode === "apps" ? (isSingleRow ? 1 : 7) : 1)
      : e.key === "ArrowUp"
        ? (props.mode === "apps" ? (isSingleRow ? -1 : -7) : -1)
        : props.mode === "apps" && e.key === "ArrowRight" && (activeElement !== input || isAtInputEnd) ? 1
          : props.mode === "apps" && e.key === "ArrowLeft" && (activeElement !== input || isAtInputStart) ? -1
            : 0;
    if (delta && allItems.length) {
      e.preventDefault();
      setKeyboardMode(true);
      const next = Math.max(0, Math.min(allItems.length - 1, selected() + delta));
      setSelected(next);
      ensureSelected(next);
    }
  };

  const handleDocClick = (e: MouseEvent) => {
    if (menu() && menuRef && !menuRef.contains(e.target as Node)) setMenu(false);
  };

  onMount(() => {
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", handleDocClick);
  });
  onCleanup(() => {
    disposed = true;
    clearTimeout(searchTimer);
    clearTimeout(longPressTimer);
    clearTimeout(hideScopesTimer);
    if (focusFrame !== undefined) cancelAnimationFrame(focusFrame);
    request++;
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("mousedown", handleDocClick);
  });

  const add = () => {
    setMenu(false);
    void chooseApp().catch(props.report);
  };

  const scopeButton = (mode: Mode, title: string, icon: "apps" | "files") => (
    <button
      type="button"
      class="scope-circle"
      classList={{ active: props.mode === mode }}
      aria-label={title}
      title={title}
      onClick={() => props.show(mode)}
    >
      {icon === "apps" ? <Win11Mark size={24} /> : <FolderOpen size={24} strokeWidth={1.8} />}
    </button>
  );

  const fileScopeBackButton = () => (
    <button
      type="button"
      class="spotlight-scope-back"
      aria-label="返回聚焦搜索"
      title="返回聚焦搜索"
      onClick={() => props.show("home")}
    >
      <span class="spotlight-scope-back-default"><FolderOpen size={22} strokeWidth={1.8} /></span>
      <ArrowLeft size={20} class="spotlight-scope-back-hover" strokeWidth={2.1} />
    </button>
  );

  const renderSearchRow = (item: SearchItem, index: () => number) => {
    const idx = () => searchStart() + index();
    const isSelected = () => selected() === idx();
    const file = item.kind === "file" ? item.file : undefined;
    const app = item.kind === "app" ? item.app : undefined;
    const filePath = file ? displayWindowsPath(file.path) : "";
    return (
      <button
        class="spotlight-item-row"
        classList={{ selected: isSelected(), unavailable: item.kind === "app" && !item.app.available }}
        style={{ top: `${idx() * 48}px`, position: "absolute" }}
        role="option"
        aria-selected={isSelected()}
        title={app?.name ?? filePath}
        onMouseEnter={() => setSelected(idx())}
        onClick={() => void runItem(item)}
      >
        {app
          ? <AppIcon app={app} size={32} />
          : file && <FileVisual file={file} active={props.visible && !searching()} variant="result" />}
        <div class="spotlight-item-info">
          <span class="spotlight-item-name">{app?.name || file?.name}</span>
          <span class="spotlight-item-category">
            {app ? `${app.category}${app.available ? "" : " · 暂不可用"}` : `${fileTypeLabel(file!)} · ${filePath}`}
          </span>
        </div>
        {app && <Show when={app.pinned}><Pin size={12} class="spotlight-item-pin" /></Show>}
        {file && <Show when={openingFile() === file.id} fallback={<span class="spotlight-item-enter"><kbd>↵</kbd></span>}><Spinner /></Show>}
        {app && <Show when={launching() === app.id} fallback={<span class="spotlight-item-enter"><kbd>↵</kbd></span>}><Spinner /></Show>}
      </button>
    );
  };

  return (
    <main
      class={`launcher ${props.mode} ${props.visible ? "is-visible" : ""}`}
      classList={{ "keyboard-mode": keyboardMode() }}
      onPointerMove={() => setKeyboardMode(false)}
      onClick={e => {
        if ((e.target as HTMLElement).classList.contains("launcher-stage") && desktop) {
          void api.hide().catch(props.report);
        }
      }}
    >
      <div class="launcher-stage">
        <span ref={el => {
          measureSpan = el;
          if (query()) {
            setInputWidth(measureTextWidth(query()));
          }
        }} class="library-search-measure" aria-hidden="true" />
        <div
          class="spotlight-bar-shell"
          onPointerMove={e => {
            if (props.mode !== "home" || hasQuery()) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = e.clientX - rect.left;
            if (relX >= rect.width * 0.55) {
              clearTimeout(hideScopesTimer);
              setScopesHovered(true);
            }
          }}
          onPointerLeave={() => {
            clearTimeout(hideScopesTimer);
            hideScopesTimer = setTimeout(() => {
              setScopesHovered(false);
            }, 260);
          }}
        >
          {/* 单一变形卡片：通过 height 与 border-radius 平滑过渡实现真正同一窗口的原地无缝形变 */}
          <div
            class="winspot-morph-card native-surface"
            data-material-surface="panel"
            classList={{
              "is-library": props.mode === "apps",
              "is-search-expanded": hasQuery() && props.mode !== "apps",
              "is-capsule": !hasQuery() && props.mode !== "apps",
              "with-scopes": scopesHovered() && !hasQuery() && props.mode === "home",
            }}
            style={{
              height: `${morphHeight()}px`,
              "border-radius": `${morphRadius()}px`,
            }}
          >
            <Show when={props.mode === "apps"} fallback={
              <header class={hasQuery() ? "spotlight-card-header" : "spotlight-capsule-header"}>
                <Show when={props.mode === "files"}>
                  {fileScopeBackButton()}
                </Show>
                <Show when={props.mode !== "files"}>
                  <span class="spotlight-capsule-icon">
                    <Search size={22} strokeWidth={2.2} />
                  </span>
                </Show>
                <input
                  ref={el => input = el}
                  value={query()}
                  maxlength={256}
                  class="spotlight-capsule-input"
                  placeholder={props.mode === "files" ? "搜索文件" : "聚焦搜索"}
                  aria-label={props.mode === "files" ? "搜索文件" : "聚焦搜索"}
                  autocomplete="off"
                  spellcheck={false}
                  onInput={handleInput}
                  onCompositionStart={handleCompositionStart}
                  onCompositionEnd={handleCompositionEnd}
                />
                <Show when={searching()}><Spinner /></Show>
                <Show when={query()}>
                  <button class="capsule-clear-btn" title="清除" aria-label="清除" onClick={() => { setQuery(""); input?.focus(); }}>
                    <X size={13} strokeWidth={2.2} />
                  </button>
                </Show>
                <Show when={hasQuery() && props.mode === "home"}>
                  <div class="spotlight-header-scopes">
                    {scopeButton("apps", "应用库", "apps")}
                    {scopeButton("files", "文件搜索", "files")}
                  </div>
                </Show>
                <Show when={!hasQuery() && props.mode === "home"}>
                  <div
                    class="spotlight-capsule-hover-trigger"
                    onPointerEnter={() => {
                      clearTimeout(hideScopesTimer);
                      setScopesHovered(true);
                    }}
                    onClick={() => input?.focus()}
                  />
                </Show>
              </header>
            }>
              <header
                class="library-header"
                onMouseDown={e => {
                  if (e.button === 0 && desktop && !(e.target as HTMLElement).closest("button, input, .library-dropdown-menu, .library-matched-app-icon")) {
                    void getCurrentWindow().startDragging();
                  }
                }}
              >
                <div class="library-header-left">
                  <button class="library-back-button" aria-label="返回聚焦搜索" title="返回聚焦搜索" onClick={() => props.show("home")}>
                    <span class="library-back-default"><Win11Mark size={20} class="library-brand-icon" /></span>
                    <ArrowLeft size={21} class="library-back-hover" strokeWidth={2.1} />
                  </button>
                  <div class="library-search-area" onClick={() => input?.focus()}>
                    <input
                      ref={el => input = el}
                      value={query()}
                      maxlength={256}
                      class="library-search-input"
                      style={{ width: composing() ? `${Math.max(120, inputWidth())}px` : hasQuery() ? `${inputWidth()}px` : matchPillText() ? "0px" : undefined }}
                      placeholder={hasQuery() || matchPillText() ? "" : "应用程序"}
                      aria-label="搜索应用程序"
                      autocomplete="off"
                      spellcheck={false}
                      onInput={handleInput}
                      onCompositionStart={handleCompositionStart}
                      onCompositionEnd={handleCompositionEnd}
                    />
                    <Show when={!composing() && matchPillText()}><span class="library-match-pill" aria-hidden="true">{matchPillText()}</span></Show>
                  </div>
                </div>

                <div class="library-header-right" ref={el => menuRef = el}>
                  <Show when={activeSelectedApp()}>
                    {app => (
                      <div
                        class="library-matched-app-icon"
                        title={`打开 ${app().name}`}
                        aria-label={`打开 ${app().name}`}
                        role="button"
                        tabIndex={-1}
                        onClick={() => void run(app())}
                      >
                        <AppIcon app={app()} size={24} />
                      </div>
                    )}
                  </Show>
                  <button
                    type="button"
                    class="library-more-btn"
                    classList={{ active: menu() }}
                    aria-label="更多操作"
                    title="更多选项"
                    onClick={e => { e.stopPropagation(); setMenu(!menu()); }}
                  >
                    <Ellipsis size={18} strokeWidth={2.4} />
                  </button>
                  <Show when={menu()}>
                    <div class="library-dropdown-menu" role="menu">
                      <button class="dropdown-item" role="menuitem" onClick={() => { setMenu(false); props.show("home"); }}>
                        <Search size={14} /><span>聚焦搜索</span><kbd class="dropdown-shortcut">Tab</kbd>
                      </button>
                      <button class="dropdown-item" role="menuitem" onClick={() => { setMenu(false); props.show("files"); }}>
                        <FolderOpen size={14} /><span>文件搜索</span>
                      </button>
                      <button class="dropdown-item" role="menuitem" disabled={props.scan.running} onClick={() => { setMenu(false); void api.scan().catch(props.report); }}>
                        <RefreshCw size={14} class={props.scan.running ? "spin" : ""} />
                        <span>{props.scan.running ? `扫描中 (${props.scan.found})` : "重新扫描应用"}</span>
                      </button>
                      <button class="dropdown-item" role="menuitem" onClick={add}><Plus size={14} /><span>添加应用…</span></button>
                      <div class="dropdown-separator" />
                      <button class="dropdown-item" role="menuitem" onClick={() => { setMenu(false); if (desktop) void api.settings().catch(props.report); else location.search = "?window=settings"; }}>
                        <Settings2 size={14} /><span>偏好设置…</span>
                      </button>
                    </div>
                  </Show>
                </div>
              </header>
            </Show>

            {/* 卡片身体 Body：随卡片高度向下展开 */}
            <div class="morph-card-body">
              <Show when={props.mode === "apps"}>
                <nav class="library-tabs-bar" role="tablist" aria-label="应用分类">
                  <For each={CATEGORY_TABS}>{name =>
                    <button
                      type="button"
                      role="tab"
                      class="library-tab-pill"
                      classList={{ active: category() === name }}
                      aria-selected={category() === name}
                      onClick={() => setCategory(c => c === name ? "全部" : name)}
                    >
                      {name}
                    </button>
                  }</For>
                </nav>

                <div
                  class="library-scroll-body"
                  ref={el => grid = el}
                  onScroll={e => setScroll(e.currentTarget.scrollTop)}
                  onClick={e => { if (!(e.target as HTMLElement).closest(".app-tile")) setSelectedByMouse(false); }}
                >
                  <Show when={showRecommended()}>
                    <section class="library-recommended-row" role="region" aria-label="推荐应用">
                      <For each={recommendedApps()}>{(app, index) =>
                        <div class="app-cell" role="listitem">
                          <button
                            class="app-tile"
                            title={app.name}
                            classList={{ selected: isTileSelected(index()), unavailable: !app.available }}
                            onClick={e => handleTileClick(e, app)}
                            onPointerDown={e => handleTilePointerDown(e, index())}
                            onPointerUp={handleTilePointerUp}
                            onPointerLeave={handleTilePointerLeave}
                            onPointerCancel={handleTilePointerLeave}
                            onFocus={() => setSelected(index())}
                            onContextMenu={e => { e.preventDefault(); setEditor(app); }}
                          >
                            <span class="tile-icon">
                              <AppIcon app={app} size={60} />
                              <Show when={launching() === app.id}><span class="launch-badge"><Spinner /></span></Show>
                              <Show when={app.pinned}><span class="pin-badge"><Pin size={9} fill="currentColor" /></span></Show>
                            </span>
                            <span class="app-name">{app.name}</span>
                          </button>
                        </div>
                      }</For>
                    </section>
                    <div class="library-divider" />
                  </Show>

                  <Show when={mainGridApps().length} fallback={
                    <EmptyState
                      title={!props.ready ? "正在载入应用库…" : hasQuery() ? "未找到匹配应用" :
                        category() !== "全部" ? `“${category()}”下暂无应用` : props.scan.running ? "正在发现本机应用…" : "暂无应用"}
                      detail={props.scan.running ? `已发现 ${props.scan.found} 个应用` : hasQuery() ? `“${query()}”` : undefined}
                      icon={props.scan.running ? <RefreshCw size={28} class="spin" /> : <Grid2X2 size={32} strokeWidth={1.4} />}
                    >
                      <Show when={!hasQuery() && !props.scan.running && category() === "全部"}>
                        <button class="launcher-button primary" onClick={add}><Plus size={14} /> 添加应用</button>
                      </Show>
                    </EmptyState>
                  }>
                    <div class="library-main-grid" role="list" aria-label="全部应用">
                      <For each={mainGridApps()}>{(app, index) => {
                        const idx = () => (showRecommended() ? recommendedApps().length : 0) + index();
                        return (
                          <div class="app-cell" role="listitem">
                            <button
                              class="app-tile"
                              title={app.name}
                              classList={{ selected: isTileSelected(idx()), unavailable: !app.available }}
                              onClick={e => handleTileClick(e, app)}
                              onPointerDown={e => handleTilePointerDown(e, idx())}
                              onPointerUp={handleTilePointerUp}
                              onPointerLeave={handleTilePointerLeave}
                              onPointerCancel={handleTilePointerLeave}
                              onFocus={() => setSelected(idx())}
                              onMouseEnter={() => { if (hasQuery()) setSelected(idx()); }}
                              onContextMenu={e => { e.preventDefault(); setEditor(app); }}
                            >
                              <span class="tile-icon">
                                <AppIcon app={app} size={60} />
                                <Show when={launching() === app.id}><span class="launch-badge"><Spinner /></span></Show>
                                <Show when={app.pinned}><span class="pin-badge"><Pin size={9} fill="currentColor" /></span></Show>
                              </span>
                              <span class="app-name">{app.name}</span>
                            </button>
                          </div>
                        );
                      }}</For>
                    </div>
                  </Show>
                </div>
              </Show>

              <Show when={hasQuery() && props.mode !== "apps"}>
                <div class="spotlight-card-body">
                  <section class="spotlight-results-pane" aria-label={props.mode === "files" ? "文件搜索结果" : "搜索结果"}>
                    <div class="spotlight-results-header">
                      <span>{props.mode === "files" ? "文件" : "全部结果"}</span>
                      <span title={fileDetail() || undefined}>
                        {searching()
                          ? "搜索中…"
                          : `${fileProviderLabel() ? `${fileProviderLabel()} · ` : ""}${searchItems().length} 个结果`}
                      </span>
                    </div>
                    <Show when={searchItems().length} fallback={
                      <EmptyState
                        title={searching() ? "正在搜索…" : props.mode === "files" ? "未找到匹配文件" : "未找到匹配结果"}
                        detail={searching() ? undefined : `“${query()}”`}
                      />
                    }>
                      <div class="spotlight-list-scroll" ref={el => list = el} onScroll={e => setScroll(e.currentTarget.scrollTop)} role="listbox">
                        <div style={{ height: `${searchItems().length * 48}px`, position: "relative" }}>
                          <For each={searchVisible()}>{renderSearchRow}</For>
                        </div>
                      </div>
                    </Show>
                  </section>

                  <Show when={selectedApp()} fallback={
                    <Show when={selectedFile()}>
                      {file => (
                        <aside class="spotlight-inspector-pane file-inspector-pane" aria-label="文件详情">
                          <FileVisual file={file()} active={props.visible && !searching()} variant="inspector" />
                          <div class="file-inspector-details">
                            <h3 class="inspector-title" title={file().name}>{file().name}</h3>
                            <div class="inspector-meta">
                              <span>{fileTypeLabel(file())}</span>
                              <Show when={file().size !== null}><span>·</span><span>{formatFileSize(file().size)}</span></Show>
                            </div>
                            <div class="inspector-path" title={displayWindowsPath(file().path)}>{displayWindowsPath(file().path)}</div>
                          </div>
                          <div class="inspector-actions">
                            <button class="launcher-button primary" disabled={!!openingFile()} onClick={() => void openFile(file())}>
                              <Show when={openingFile() === file().id} fallback={<ArrowUpRight size={14} />}><Spinner /></Show>
                              打开
                            </button>
                            <button class="launcher-button secondary" onClick={() => void revealFile(file())}>
                              <FolderOpen size={13} /> 在资源管理器中显示
                            </button>
                          </div>
                        </aside>
                      )}
                    </Show>
                  }>
                    {app => (
                      <aside class="spotlight-inspector-pane">
                        <div class="inspector-icon"><AppIcon app={app()} size={64} /></div>
                        <h3 class="inspector-title">{app().name}</h3>
                        <div class="inspector-meta">
                          <span>{app().category}</span>
                          <span>·</span>
                          <span>{app().kind === "packaged" ? "Windows 应用" : app().kind === "shortcut" ? "快捷方式" : "桌面程序"}</span>
                        </div>
                        <div class="inspector-path" title={displayWindowsPath(app().target)}>{displayWindowsPath(app().target)}</div>
                        <div class="inspector-actions">
                          <button class="launcher-button primary" onClick={() => void run(app())}>
                            <ArrowUpRight size={14} /> 打开应用
                          </button>
                          <button class="launcher-button secondary" onClick={() => setEditor(app())}>
                            <SlidersHorizontal size={13} /> 整理设置
                          </button>
                        </div>
                      </aside>
                    )}
                  </Show>
                </div>

                <footer class="spotlight-card-footer">
                  <div class="spotlight-footer-left"><BrandMark size={16} /><span>WinSpot</span></div>
                  <div class="kbd-hints">
                    <span><kbd>↑↓</kbd>选择</span>
                    <span><kbd>↵</kbd>打开</span>
                    <span><kbd>Tab</kbd>应用库</span>
                    <span><kbd>Esc</kbd>关闭</span>
                  </div>
                </footer>
              </Show>
            </div>
          </div>

          {/* 最开始 文件 和应用库两个按钮是单独的两个圆，而不是一起在搜索框中 */}
          <Show when={!hasQuery() && props.mode === "home"}>
            <div
              class="spotlight-standalone-scopes"
              classList={{ "is-expanded": scopesHovered() }}
              onPointerEnter={() => {
                clearTimeout(hideScopesTimer);
                setScopesHovered(true);
              }}
            >
              <button
                type="button"
                class="scope-standalone-circle native-surface"
                data-material-surface="apps"
                aria-label="应用库"
                title="应用库"
                onClick={() => props.show("apps")}
              >
                <Win11Mark size={22} />
              </button>
              <button
                type="button"
                class="scope-standalone-circle native-surface"
                data-material-surface="files"
                aria-label="文件搜索"
                title="文件搜索"
                onClick={() => {
                  clearTimeout(hideScopesTimer);
                  setScopesHovered(false);
                  props.show("files");
                }}
              >
                <FolderOpen size={22} strokeWidth={1.8} />
              </button>
            </div>
          </Show>
        </div>
      </div>

      <Show when={editor()}>
        {app => <AppEditor app={app()} settings={props.settings} close={() => setEditor(undefined)} report={props.report} />}
      </Show>
    </main>
  );
}
