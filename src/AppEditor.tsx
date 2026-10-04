import { createSignal, Show } from "solid-js";
import { Check } from "lucide-solid";
import { api } from "./api";
import { AppIcon, Spinner } from "./components";
import { RaycastModal, RaycastSelect, RaycastSwitch } from "./Preferences";
import { toOverride, type Application, type Settings } from "./types";

export default function AppEditor(props: {
  app: Application;
  settings: Settings;
  close: () => void;
  report: (e: unknown) => void;
}) {
  const [name, setName] = createSignal(props.app.name);
  const [alias, setAlias] = createSignal(props.app.alias);
  const [category, setCategory] = createSignal(props.app.category);
  const [pinned, setPinned] = createSignal(props.app.pinned);
  const [hidden, setHidden] = createSignal(props.app.hidden);
  const [filtered, setFiltered] = createSignal(props.app.filtered);
  const [order, setOrder] = createSignal(props.app.order);
  const [busy, setBusy] = createSignal(false);

  const save = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.updateApp(toOverride(props.app, {
        name: name().trim() || props.app.originalName,
        alias: alias(),
        category: category(),
        pinned: pinned(),
        hidden: hidden(),
        filtered: filtered(),
        order: order(),
      }));
      props.close();
    } catch (e) {
      props.report(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <RaycastModal title="编辑应用程序信息" onClose={props.close} width="500px">
      <form onSubmit={save} style={{ display: "flex", "flex-direction": "column", gap: "14px" }}>
        {/* App Info Header */}
        <div style={{
          display: "flex",
          "align-items": "center",
          gap: "14px",
          "padding-bottom": "12px",
          "border-bottom": "1px solid var(--rc-divider)"
        }}>
          <AppIcon app={props.app} size={48} />
          <div style={{ "min-width": "0", flex: 1 }}>
            <h3 style={{
              "font-size": "15px",
              "font-weight": "600",
              margin: 0,
              "white-space": "nowrap",
              overflow: "hidden",
              "text-overflow": "ellipsis",
              color: "var(--rc-text-primary)"
            }}>
              {props.app.originalName}
            </h3>
            <p style={{ "font-size": "12px", color: "var(--rc-text-secondary)", margin: "3px 0 0 0" }}>
              {props.app.kind === "packaged" ? "Windows 打包应用" : props.app.kind === "shortcut" ? "桌面快捷方式" : "可执行程序"}
            </p>
          </div>
        </div>

        {/* Display Name Input */}
        <div style={{ display: "flex", "flex-direction": "column", gap: "5px" }}>
          <label style={{ "font-size": "12px", "font-weight": "500", color: "var(--rc-text-secondary)" }}>
            显示名称
          </label>
          <input
            type="text"
            class="rc-input"
            value={name()}
            onInput={e => setName(e.currentTarget.value)}
          />
        </div>

        {/* Search Alias / Pinyin Input */}
        <div style={{ display: "flex", "flex-direction": "column", gap: "5px" }}>
          <label style={{ "font-size": "12px", "font-weight": "500", color: "var(--rc-text-secondary)" }}>
            搜索拼音 / 别名（可选）
          </label>
          <input
            type="text"
            class="rc-input"
            value={alias()}
            placeholder="如：wx, 常用工作, 播放器"
            onInput={e => setAlias(e.currentTarget.value)}
          />
        </div>

        {/* Category & Order Weight */}
        <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "12px" }}>
          <div style={{ display: "flex", "flex-direction": "column", gap: "5px" }}>
            <label style={{ "font-size": "12px", "font-weight": "500", color: "var(--rc-text-secondary)" }}>
              所属分类
            </label>
            <RaycastSelect
              value={category()}
              options={[...new Set([...props.settings.categories, props.app.category, "其他"])].map(c => ({ value: c, label: c }))}
              onChange={setCategory}
              width="100%"
            />
          </div>
          <div style={{ display: "flex", "flex-direction": "column", gap: "5px" }}>
            <label style={{ "font-size": "12px", "font-weight": "500", color: "var(--rc-text-secondary)" }}>
              排序权重
            </label>
            <input
              type="number"
              class="rc-input"
              value={order()}
              onInput={e => setOrder(Number(e.currentTarget.value) || 0)}
            />
          </div>
        </div>

        {/* Toggles Inset Card */}
        <div class="rc-modal-card">
          <div class="rc-modal-row">
            <span class="rc-modal-row-label">固定到启动器前列</span>
            <RaycastSwitch checked={pinned()} onChange={setPinned} label="固定应用" />
          </div>
          <div class="rc-modal-row">
            <span class="rc-modal-row-label">在启动器中隐藏</span>
            <RaycastSwitch checked={hidden()} onChange={setHidden} label="隐藏应用" />
          </div>
          <div class="rc-modal-row">
            <span class="rc-modal-row-label">过滤此应用</span>
            <RaycastSwitch checked={filtered()} onChange={setFiltered} label="过滤应用" />
          </div>
        </div>

        {/* Keep the launch entry separate from a shortcut's resolved target. */}
        <div style={{
          display: "flex",
          "flex-direction": "column",
          gap: "6px",
          "font-size": "11px",
          color: "var(--rc-text-tertiary)",
          padding: "8px 10px",
          background: "var(--rc-input-bg)",
          border: "1px solid var(--rc-control-border)",
          "border-radius": "6px",
          "user-select": "text",
          "font-family": "monospace"
        }}>
          <div>
            <span style={{ "font-family": "inherit", "margin-right": "6px" }}>启动入口</span>
            <span style={{ "word-break": "break-all" }}>{props.app.target}</span>
          </div>
          <Show when={props.app.resolvedTarget}>
            {target => (
              <div>
                <span style={{ "font-family": "inherit", "margin-right": "6px" }}>实际目标</span>
                <span style={{ "word-break": "break-all" }}>{target()}</span>
              </div>
            )}
          </Show>
          <Show when={props.app.launchArguments}>
            {args => (
              <div>
                <span style={{ "font-family": "inherit", "margin-right": "6px" }}>启动参数</span>
                <span style={{ "word-break": "break-all" }}>{args()}</span>
              </div>
            )}
          </Show>
          <Show when={props.app.workingDirectory}>
            {directory => (
              <div>
                <span style={{ "font-family": "inherit", "margin-right": "6px" }}>工作目录</span>
                <span style={{ "word-break": "break-all" }}>{directory()}</span>
              </div>
            )}
          </Show>
        </div>

        {/* Footer Actions */}
        <div class="rc-modal-footer">
          <button type="button" class="raycast-btn" onClick={props.close}>
            取消
          </button>
          <button type="submit" class="raycast-btn primary" disabled={busy()}>
            {busy() ? <Spinner /> : <Check size={13} />} 保存设置
          </button>
        </div>
      </form>
    </RaycastModal>
  );
}
