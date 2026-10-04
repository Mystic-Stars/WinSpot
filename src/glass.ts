import type { JSX } from "solid-js";
import type { MaterialAppearance, Settings } from "./types";

export function materialAppearance(settings: Settings, systemDark: boolean): MaterialAppearance {
  return {
    blur: settings.blur,
    opacity: settings.opacity,
    tint: settings.glassTint,
    saturation: settings.glassSaturation,
    dark: settings.theme === "system" ? systemDark : settings.theme === "dark",
    radius: settings.panelRadius,
  };
}

export function glassStyle(appearance: MaterialAppearance): JSX.CSSProperties {
  const blur = Math.min(80, Math.max(0, appearance.blur));
  const opacity = Math.min(100, Math.max(20, appearance.opacity));
  const diffusion = Math.min(1, blur / 60);
  const custom = /^#[0-9a-f]{6}$/i.test(appearance.tint);
  const value = custom ? parseInt(appearance.tint.slice(1), 16) : 0;
  const start = custom
    ? [value >> 16 & 255, value >> 8 & 255, value & 255]
    : appearance.dark ? [30, 32, 40] : [255, 255, 255];
  const end = custom
    ? start.map(channel => Math.round(channel * 0.94))
    : appearance.dark ? [16, 17, 22] : [240, 243, 248];
  return {
    "--surface-alpha": (opacity / 100).toFixed(3),
    "--glass-blur": `${blur}px`,
    "--glass-diffusion": diffusion.toFixed(3),
    "--glass-veil-alpha": (blur === 0 ? 0 : diffusion * 0.42).toFixed(3),
    "--glass-grain-alpha": (blur === 0 ? 0 : 0.012 + diffusion * 0.028).toFixed(3),
    "--glass-specular-spread": `${Math.round(12 + diffusion * 36)}px`,
    "--glass-saturate": `${appearance.saturation}%`,
    "--glass-start-rgb": start.join(", "),
    "--glass-end-rgb": end.join(", "),
  };
}
