import { createEffect, createSignal, on, onCleanup, Show } from "solid-js";
import { api, errorText, iconUrl } from "./api";
import { Spinner } from "./components";
import { fileAppearance, fileTypeLabel } from "./fileIcons";
import type { FilePreview, FileResult } from "./types";

interface PreviewEntry {
  file: FileResult;
  users: number;
  priority: number;
  started: boolean;
  value?: FilePreview;
  promise: Promise<FilePreview>;
  resolve: (value: FilePreview) => void;
}

const previews = new Map<string, PreviewEntry>();
const pending: PreviewEntry[] = [];
const PREVIEW_CACHE_LIMIT = 256;
const PREVIEW_CONCURRENCY = 2;
let running = 0;
let scheduled = false;

function trimCache() {
  for (const [key, entry] of previews) {
    if (previews.size <= PREVIEW_CACHE_LIMIT) break;
    if (!entry.users && entry.value) previews.delete(key);
  }
}

function schedulePreviews() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    pending.sort((a, b) => b.priority - a.priority);
    while (running < PREVIEW_CONCURRENCY && pending.length) {
      const entry = pending.shift()!;
      entry.started = true;
      running++;
      void api.filePreview(entry.file.id, entry.file.previewKey!)
        .catch((error: unknown): FilePreview => ({ thumbnail: null, detail: errorText(error) }))
        .then(value => {
          entry.value = value;
          entry.resolve(value);
          const key = entry.file.previewKey!;
          if (!value.thumbnail && previews.get(key) === entry) previews.delete(key);
          trimCache();
        })
        .finally(() => {
          running--;
          schedulePreviews();
        });
    }
  });
}

function retainPreview(file: FileResult, priority: number) {
  const key = file.previewKey!;
  let entry = previews.get(key);
  if (!entry) {
    let resolve!: PreviewEntry["resolve"];
    const promise = new Promise<FilePreview>(done => { resolve = done; });
    entry = { file, users: 0, priority, started: false, promise, resolve };
    previews.set(key, entry);
    pending.push(entry);
  } else {
    previews.delete(key);
    previews.set(key, entry);
  }
  const retained = entry;
  retained.users++;
  retained.priority = Math.max(retained.priority, priority);
  schedulePreviews();
  return {
    promise: retained.promise,
    release: () => {
      retained.users--;
      if (!retained.users && !retained.started) {
        const index = pending.indexOf(retained);
        if (index >= 0) pending.splice(index, 1);
        if (previews.get(key) === retained) previews.delete(key);
        retained.resolve({ thumbnail: null, detail: null });
      } else if (!retained.users && retained.value && !retained.value.thumbnail) {
        if (previews.get(key) === retained) previews.delete(key);
      }
      trimCache();
    },
  };
}

function FileIcon(props: { file: FileResult; size: number }) {
  const appearance = () => fileAppearance(props.file);
  return (
    <span
      class="file-type-icon"
      style={{ width: `${props.size}px`, height: `${props.size}px` }}
      title={fileTypeLabel(props.file)}
      aria-hidden="true"
    >
      <img
        classList={{ "file-type-icon-light": !!appearance().darkSrc }}
        src={appearance().src}
        alt=""
        draggable={false}
      />
      <Show when={appearance().darkSrc}>
        {src => <img class="file-type-icon-dark" src={src()} alt="" draggable={false} />}
      </Show>
    </span>
  );
}

export default function FileVisual(props: {
  file: FileResult;
  active: boolean;
  variant: "result" | "inspector";
}) {
  const [preview, setPreview] = createSignal<FilePreview>();
  const [loaded, setLoaded] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  createEffect(on(() => [props.file, props.active] as const, ([file, active]) => {
    setPreview(undefined);
    setLoaded(false);
    setFailed(false);
    if (!active || !file.previewKey) return;
    let alive = true;
    const retained = retainPreview(file, props.variant === "inspector" ? 1 : 0);
    void retained.promise.then(value => {
      if (alive) setPreview(value);
    });
    onCleanup(() => {
      alive = false;
      retained.release();
    });
  }));

  const source = () => !failed() && preview()?.thumbnail ? iconUrl(preview()!.thumbnail!) : undefined;
  const loading = () => props.active && (!preview() || (!!source() && !loaded()));
  const detail = () => failed() ? "图片预览读取失败" : preview()?.detail ?? "暂时无法预览";
  const imageFailed = () => {
    const key = props.file.previewKey;
    if (key && previews.get(key)?.value?.thumbnail === preview()?.thumbnail) previews.delete(key);
    setFailed(true);
    setLoaded(false);
  };
  const image = () => (
    <Show when={source()}>
      {src => (
        <img
          class="file-thumbnail"
          classList={{ loaded: loaded() }}
          src={src()}
          alt={props.variant === "inspector" ? props.file.name : ""}
          draggable={false}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={imageFailed}
        />
      )}
    </Show>
  );

  return (
    <Show when={props.variant === "inspector"} fallback={
      <span class="file-result-visual" classList={{ "has-thumbnail": loaded() }}>
        <Show when={!loaded()}><FileIcon file={props.file} size={32} /></Show>
        {image()}
      </span>
    }>
      <Show when={props.file.previewKey} fallback={
        <div class="file-inspector-icon"><FileIcon file={props.file} size={72} /></div>
      }>
        <figure class="file-preview">
          <div class="file-preview-stage" aria-busy={loading()}>
            <Show when={!loaded()}><FileIcon file={props.file} size={56} /></Show>
            {image()}
          </div>
          <Show when={!loaded()}>
            <figcaption class="file-preview-status" title={loading() ? undefined : detail()} role="status">
              <Show when={loading()}><Spinner /></Show>
              <span>{loading() ? "正在生成预览…" : detail()}</span>
            </figcaption>
          </Show>
        </figure>
      </Show>
    </Show>
  );
}
