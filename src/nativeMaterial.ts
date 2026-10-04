import { createEffect, onCleanup, onMount, type Accessor } from "solid-js";
import { api, desktop } from "./api";
import type { MaterialAppearance, MaterialScene, MaterialSurface } from "./types";

interface MaterialContext {
  visible: boolean;
  revision: number;
  appearance: MaterialAppearance;
}

export function useNativeMaterial(
  context: Accessor<MaterialContext>,
  enabled: boolean,
  report: (error: unknown) => void,
) {
  if (!desktop || !enabled) return;
  let disposed = false;
  let frame: number | undefined;
  let trackUntil = 0;
  let mutation: MutationObserver | undefined;
  let resize: ResizeObserver | undefined;
  const observed = new Set<Element>();
  let pending: MaterialScene | undefined;
  let sending = false;
  let lastScene = "";
  let lastFailureRevision = -1;
  const rounded = (value: number) => Math.round(value * 1000) / 1000;

  const send = async () => {
    if (sending || disposed) return;
    sending = true;
    try {
      while (pending && !disposed) {
        const scene = pending;
        pending = undefined;
        try {
          await api.updateMaterial(scene);
        } catch (error) {
          lastScene = "";
          if (!disposed && lastFailureRevision !== scene.revision) {
            lastFailureRevision = scene.revision;
            report(error);
          }
        }
      }
    } finally {
      sending = false;
    }
  };

  const surface = (host: HTMLElement): MaterialSurface | undefined => {
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return undefined;
    const style = getComputedStyle(host);
    if (style.pointerEvents === "none" || style.visibility !== "visible") return undefined;
    let opacity = 1;
    for (let ancestor: HTMLElement | null = host; ancestor; ancestor = ancestor.parentElement) {
      const appearance = getComputedStyle(ancestor);
      if (appearance.display === "none" || appearance.visibility !== "visible") return undefined;
      opacity *= Number(appearance.opacity);
    }
    if (opacity < 0.001) return undefined;
    const scale = host.offsetWidth ? rect.width / host.offsetWidth : 1;
    const corner = style.borderTopLeftRadius.split(" ")[0];
    const radius = corner.endsWith("%")
      ? Math.min(rect.width, rect.height) * parseFloat(corner) / 100
      : parseFloat(corner) * scale;
    return {
      x: rounded(rect.left),
      y: rounded(rect.top),
      width: rounded(rect.width),
      height: rounded(rect.height),
      radius: rounded(Math.min(radius || 0, rect.width / 2, rect.height / 2)),
      opacity: rounded(Math.min(1, opacity)),
    };
  };

  const measure = () => {
    const current = context();
    if (!current.visible) {
      pending = undefined;
      lastScene = "";
      return;
    }
    const hosts = Array.from(document.querySelectorAll<HTMLElement>("[data-material-surface]"));
    for (const previous of observed) {
      if (!hosts.includes(previous as HTMLElement)) {
        resize?.unobserve(previous);
        observed.delete(previous);
      }
    }
    for (const host of hosts) {
      if (!observed.has(host)) {
        observed.add(host);
        resize?.observe(host);
      }
    }
    const scene: MaterialScene = {
      revision: current.revision,
      surfaces: hosts.flatMap(host => {
        const measured = surface(host);
        return measured ? [measured] : [];
      }).slice(0, 3),
      interactions: Array.from(document.querySelectorAll<HTMLElement>(".notification")).flatMap(host => {
        const measured = surface(host);
        return measured ? [measured] : [];
      }).slice(0, 4),
      overlay: !!document.querySelector(".modal-scrim, .rc-modal-backdrop, .mac-modal-backdrop"),
      appearance: current.appearance,
    };
    const signature = JSON.stringify(scene);
    if (signature === lastScene) return;
    lastScene = signature;
    pending = scene;
    void send();
  };
  const tick = () => {
    frame = undefined;
    if (disposed) return;
    measure();
    if (context().visible && performance.now() < trackUntil) frame = requestAnimationFrame(tick);
  };
  const track = () => {
    if (disposed) return;
    trackUntil = performance.now() + 400;
    if (frame === undefined) frame = requestAnimationFrame(tick);
  };

  createEffect(() => { context(); track(); });
  onMount(() => {
    resize = new ResizeObserver(track);
    mutation = new MutationObserver(track);
    mutation.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden"],
    });
    document.addEventListener("transitionrun", track, true);
    document.addEventListener("animationstart", track, true);
    window.addEventListener("resize", track);
    track();
  });
  onCleanup(() => {
    disposed = true;
    pending = undefined;
    mutation?.disconnect();
    resize?.disconnect();
    if (frame !== undefined) cancelAnimationFrame(frame);
    document.removeEventListener("transitionrun", track, true);
    document.removeEventListener("animationstart", track, true);
    window.removeEventListener("resize", track);
  });
}
