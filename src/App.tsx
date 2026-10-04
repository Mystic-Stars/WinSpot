import { batch, createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { api, desktop, errorText, subscribe } from "./api";
import { defaults, emptyScan, type Application, type BackdropState, type Bootstrap, type MaterialAppearance, type Mode, type ScanStatus, type Settings } from "./types";
import Launcher from "./Launcher";
import Preferences from "./Preferences";
import { Notification } from "./components";
import { glassStyle, materialAppearance } from "./glass";
import { useNativeMaterial } from "./nativeMaterial";

export default function App() {
  const settingsWindow = new URLSearchParams(location.search).get("window") === "settings";
  const [settings, setSettings] = createSignal<Settings>(structuredClone(defaults));
  const [apps, setApps] = createSignal<Application[]>([]);
  const [scan, setScan] = createSignal<ScanStatus>({ ...emptyScan });
  const [scanSources, setScanSources] = createSignal<Bootstrap["scanSources"]>([]);
  const [monitors, setMonitors] = createSignal<Bootstrap["monitors"]>([]);
  const [paused, setPaused] = createSignal(false);
  const [mode, setMode] = createSignal<Mode>("apps");
  const [visible, setVisible] = createSignal(true);
  const [closing, setClosing] = createSignal(false);
  const [openVersion, setOpenVersion] = createSignal(0);
  const [backdropState, setBackdropState] = createSignal<BackdropState>({ available: false, transparencyEnabled: true, revision: 0 });
  const [previewAppearance, setPreviewAppearance] = createSignal<MaterialAppearance>();
  const [ready, setReady] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [systemDark, setSystemDark] = createSignal(matchMedia("(prefers-color-scheme: dark)").matches);
  const [systemReduced, setSystemReduced] = createSignal(matchMedia("(prefers-reduced-motion: reduce)").matches);
  const cleanups: (() => void)[] = [];
  let messageTimer: ReturnType<typeof setTimeout>;
  let disposed = false;
  const report = (error: unknown) => {
    setMessage(errorText(error));
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => setMessage(""), 7500);
  };
  const updateBackdrop = (next: BackdropState) => {
    if (settingsWindow || disposed) return;
    if (next.revision < backdropState().revision) return;
    setBackdropState(next);
  };
  const appearance = createMemo(() => previewAppearance() || materialAppearance(settings(), systemDark()));
  const launcherSettings = createMemo(() => previewAppearance()
    ? { ...settings(), panelRadius: previewAppearance()!.radius }
    : settings());
  const refresh = async () => {
    try {
      const data = await api.bootstrap();
      if (disposed || !data) return data;
      batch(() => {
        setApps(data.apps || []);
        if (data.settings) {
          setSettings(old => JSON.stringify(old) === JSON.stringify(data.settings) ? old : data.settings);
        }
        setScan(data.scan || emptyScan);
        setScanSources(data.scanSources || []);
        setMonitors(data.monitors || []);
        setPaused(!!data.capturePaused);
      });
      updateBackdrop(data.backdrop);
      return data;
    } catch (e) {
      report(e);
      return undefined;
    }
  };
  const show = (next: Mode) => {
    const changed = mode() !== next;
    setMode(next);
    if (desktop) void api.show(next).catch(report);
    else if (!changed) setOpenVersion(v => v + 1);
  };
  createEffect(() => {
    document.documentElement.dataset.theme = appearance().dark ? "dark" : "light";
    document.documentElement.dataset.motion = settings().reducedMotion || systemReduced() ? "reduced" : "full";
    document.documentElement.dataset.view = settingsWindow ? "settings" : mode();
    document.documentElement.dataset.backdrop = settingsWindow || !desktop ? "preview"
      : backdropState().available && backdropState().transparencyEnabled ? "native" : "solid";
    for (const [key, value] of Object.entries(glassStyle(appearance()))) {
      document.documentElement.style.setProperty(key, String(value));
    }
    document.documentElement.style.setProperty("--icon-size", `${settings().iconSize}px`);
    document.body.classList.toggle("preferences-body", settingsWindow);
    document.body.classList.toggle("browser-preview", !desktop);
    document.body.classList.toggle("window-hidden", !visible());
    document.body.classList.toggle("window-closing", closing());
  });
  useNativeMaterial(() => {
    mode(); openVersion(); closing(); message(); backdropState().available;
    return { visible: visible(), revision: backdropState().revision, appearance: appearance() };
  }, !settingsWindow, report);
  onMount(async () => {
    const listen = async <T,>(event: string, callback: (value: T) => void) => {
      const off = await subscribe<T>(event, callback);
      if (disposed) off(); else cleanups.push(off);
    };
    await listen<Mode>("launcher-show", value => batch(() => {
      const changed = mode() !== value;
      setMode(value);
      setVisible(true);
      setClosing(false);
      setPreviewAppearance(undefined);
      if (!changed) setOpenVersion(v => v + 1);
    }));
    await listen<void>("launcher-hiding", () => setClosing(true));
    await listen<void>("launcher-hidden", () => batch(() => {
      setVisible(false);
      setPreviewAppearance(undefined);
    }));
    await listen<BackdropState>("backdrop-changed", updateBackdrop);
    await listen<MaterialAppearance>("material-preview", setPreviewAppearance);
    await listen<Settings>("settings-changed", value => batch(() => {
      setSettings(value);
      setPreviewAppearance(undefined);
    }));
    await listen<ScanStatus>("scan-progress", setScan);
    await listen<void>("catalog-changed", () => { void refresh(); });
    await listen<boolean>("capture-paused", setPaused);
    await listen<string>("app-error", report);
    const dark = matchMedia("(prefers-color-scheme: dark)");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const onDark = () => setSystemDark(dark.matches);
    const onReduce = () => setSystemReduced(reduce.matches);
    dark.addEventListener("change", onDark); reduce.addEventListener("change", onReduce);
    cleanups.push(() => { dark.removeEventListener("change", onDark); reduce.removeEventListener("change", onReduce); });
    const data = await refresh();
    setReady(true);
    if (data?.startHidden && !settingsWindow) setVisible(false);
    if (data?.startupErrors?.length) report(data.startupErrors.join("；"));
    if (desktop && !settingsWindow && !data?.startHidden) await api.show("apps").catch(report);
  });
  onCleanup(() => {
    disposed = true;
    cleanups.forEach(fn => fn());
    clearTimeout(messageTimer);
  });
  return <>
    <Show when={settingsWindow} fallback={
      <Launcher apps={apps()} settings={launcherSettings()} scan={scan()} mode={mode()} openVersion={openVersion()}
        visible={visible()} ready={ready()} show={show} report={report} />
    }>
      <Preferences apps={apps()} settings={settings()} scan={scan()} scanSources={scanSources()} monitors={monitors()}
        paused={paused()} systemDark={systemDark()} onUpdateSettings={setSettings} refresh={refresh} report={report} />
    </Show>
    <Show when={message()}>
      <Notification
        title="WinSpot 提示"
        text={message()}
        onClose={() => setMessage("")}
      />
    </Show>
  </>;
}
