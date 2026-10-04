import { createEffect, createSignal, Show, type JSX } from "solid-js";
import { AppWindow, Check, Grid2X2, LoaderCircle, Minus, Search, X } from "lucide-solid";
import brandLogo from "./assets/logo.png";
import { iconUrl } from "./api";
import type { Application } from "./types";

export function RaycastCheckbox(props: {
  checked: boolean | "indeterminate";
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
}) {
  const isChecked = () => props.checked === true;
  const isIndeterminate = () => props.checked === "indeterminate";

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isIndeterminate() ? "mixed" : isChecked()}
      aria-label={props.ariaLabel}
      title={props.title}
      disabled={props.disabled}
      class={`raycast-checkbox ${isChecked() ? "checked" : isIndeterminate() ? "indeterminate" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        if (props.onChange && !props.disabled) {
          props.onChange(!isChecked());
        }
      }}
    >
      <Show when={isChecked()}>
        <Check size={11} strokeWidth={2.8} />
      </Show>
      <Show when={isIndeterminate()}>
        <Minus size={11} strokeWidth={2.8} />
      </Show>
    </button>
  );
}

export function AppIcon(props: { app: Application; size?: number }) {
  const [failed, setFailed] = createSignal(false);
  createEffect(() => {
    props.app.icon;
    setFailed(false);
  });

  const size = () => props.size ?? 64;
  return (
    <span class="app-icon-wrapper" style={{ width: `${size()}px`, height: `${size()}px` }}>
      <Show
        when={props.app.icon && !failed()}
        fallback={
          <span class="fallback-icon">
            <AppWindow strokeWidth={1.5} size={Math.round(size() * 0.55)} />
          </span>
        }
      >
        <img
          src={iconUrl(props.app.icon!)}
          alt=""
          draggable={false}
          decoding="async"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </Show>
    </span>
  );
}

export function BrandMark(props: { size?: number; class?: string }) {
  const size = () => props.size ?? 32;
  return (
    <img
      src={brandLogo}
      alt="WinSpot"
      class={props.class ? `brand-mark ${props.class}` : "brand-mark"}
      style={{
        width: `${size()}px`,
        height: `${size()}px`,
        "object-fit": "contain",
        "flex-shrink": "0",
        "user-select": "none",
        "-webkit-user-drag": "none",
      }}
      draggable={false}
    />
  );
}

export function Win11Mark(props: { size?: number; class?: string }) {
  const s = () => props.size ?? 20;
  return (
    <svg
      width={s()}
      height={s()}
      viewBox="0 0 24 24"
      fill="none"
      class={props.class}
      aria-hidden="true"
    >
      <rect x="3" y="3" width="8.2" height="8.2" rx="1.2" fill="currentColor" />
      <rect x="12.8" y="3" width="8.2" height="8.2" rx="1.2" fill="currentColor" />
      <rect x="3" y="12.8" width="8.2" height="8.2" rx="1.2" fill="currentColor" />
      <rect x="12.8" y="12.8" width="8.2" height="8.2" rx="1.2" fill="currentColor" />
    </svg>
  );
}

export const AppStoreMark = Win11Mark;

export function EmptyState(props: {
  title: string;
  detail?: string;
  icon?: JSX.Element;
  children?: JSX.Element;
}) {
  return (
    <div class="empty-state">
      <span class="empty-state-icon">{props.icon ?? <Search size={28} strokeWidth={1.5} />}</span>
      <h3>{props.title}</h3>
      <Show when={props.detail}>
        <p>{props.detail}</p>
      </Show>
      {props.children}
    </div>
  );
}

export function Spinner() {
  return <LoaderCircle class="spin" size={15} strokeWidth={1.8} />;
}

export function Notification(props: { title?: string; text: string; onClose: () => void }) {
  return (
    <div class="notification" role="status">
      <div class="notification-copy">
        <strong>{props.title ?? "WinSpot"}</strong>
        <span>{props.text}</span>
      </div>
      <button type="button" class="icon-button" aria-label="关闭提示" title="关闭提示" onClick={props.onClose}>
        <X size={14} />
      </button>
    </div>
  );
}
