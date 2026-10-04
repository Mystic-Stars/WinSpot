# WinSpot Agent Guide

## 项目概览

WinSpot 是一个 Windows 本地应用启动器，使用 Tauri v2 将 SolidJS/TypeScript 前端与 Rust 原生后端打包为桌面应用。

核心功能：

- 扫描开始菜单、桌面、App Paths、Windows AppsFolder 和用户配置的目录。
- 以真实 Windows 应用图标、分类网格和聚焦搜索展示应用。
- 支持中文、英文、拼音、首字母、别名和模糊搜索。
- 通过全局快捷键、单独的 Win 键低级键盘钩子和系统托盘唤起窗口。
- 使用 SQLite 保存索引、设置、应用整理记录和本地启动统计。
- 不依赖 Node 服务，不上传数据，没有账号、遥测、远程索引或云同步。

当前目标平台是 Windows 11 22H2 及以上的 x64 环境。Windows 原生行为、WebView2、透明材质、多显示器和全局快捷键不能仅凭浏览器预览判断。

## 协作与验证边界

以下规则是本项目的默认代理行为：

1. 不主动执行 `pnpm dev`、`pnpm desktop`、`pnpm build`、`pnpm package` 或其他构建/启动命令。用户会自行打开 dev 端调试。
2. 不使用 Computer Use、Playwright、WebDriver、浏览器自动化、桌面自动化或其他自动化界面测试方式。
3. 不代替用户进行 UI、Windows 快捷键、安装器、性能或实机行为验收。用户负责具体运行验证。
4. 修改代码时只需保持代码没有明显的语法错误、类型错误和逻辑错误；静态阅读、局部检查和代码推理优先。
5. 不为了“验证”而生成、覆盖或修改 `dist/`、`src-tauri/target*/`、`src-tauri/gen/` 等构建产物。

用户验收范围以 `docs/ACCEPTANCE.md` 为准，已知限制以 `docs/LIMITATIONS.md` 为准。README 中的命令只作为用户和维护者参考，不表示代理应自动执行。

## 技术栈与命令参考

- 前端：SolidJS 1.9、TypeScript 5.9、Vite 7、`lucide-solid`。
- 桌面壳：Tauri v2、`@tauri-apps/api`、Tauri dialog/global-shortcut/single-instance 插件。
- 后端：Rust 2021，要求 Rust 1.94 stable MSVC 工具链。
- Windows API：`windows` crate，使用 Shell/COM、低级键盘钩子、窗口管理、DWM 和注册表。
- 存储：`rusqlite` bundled SQLite，WAL 模式。
- 扫描与搜索：`walkdir`、`notify`、`pinyin`、`fuzzy-matcher`、`sha2`。

`package.json` 中的脚本含义：

- `pnpm dev`：只启动 Vite 浏览器预览。
- `pnpm desktop`：启动 Tauri 桌面开发模式。
- `pnpm check`：TypeScript 类型检查。
- `pnpm build`：类型检查并构建 Vite 前端。
- `pnpm package`：生成 NSIS 安装包。

代理默认不运行上述脚本，除非用户明确要求执行某个命令；即使执行了静态检查，也不等同于用户的运行验收。

## 目录结构

```text
.
├─ src/                    # SolidJS 前端
│  ├─ index.tsx            # 前端入口
│  ├─ App.tsx              # 根状态、bootstrap 和事件订阅
│  ├─ Launcher.tsx         # 应用库、搜索、键盘导航和应用启动
│  ├─ Preferences.tsx      # 设置窗口及其各个设置分区
│  ├─ AppEditor.tsx        # 单个应用的整理编辑器
│  ├─ components.tsx       # 通用 UI 组件
│  ├─ api.ts               # Tauri 命令/事件适配层和浏览器 mock
│  ├─ types.ts             # 前后端共享形状对应的 TypeScript 类型
│  ├─ styles.css           # 全局主题、窗口和启动器样式
├─ src-tauri/
│  ├─ src/main.rs          # Rust 进程入口，调用 winspot_lib::run
│  ├─ src/lib.rs           # Tauri builder、插件、AppState 和启动生命周期
│  ├─ src/commands.rs      # 暴露给前端的类型化 Tauri commands
│  ├─ src/model.rs         # Rust 数据模型、默认值和设置校验
│  ├─ src/store.rs         # SQLite 打开、读写和覆盖配置合并
│  ├─ src/catalog.rs       # 应用发现、去重、分类、搜索和文件监听
│  ├─ src/native.rs        # Windows Shell/COM、图标、启动、窗口和自启
│  ├─ src/hotkeys.rs       # 全局快捷键和 Win 键低级钩子
│  ├─ src/windows.rs       # 窗口定位、显示/隐藏、材质、设置窗口和托盘
│  ├─ capabilities/        # Tauri 窗口与插件权限
│  ├─ tauri.conf.json      # Tauri 窗口、CSP、资源和安装器配置
│  └─ installer-hooks.nsh  # NSIS 系统版本检查和卸载清理
├─ docs/                   # 验收清单和已知限制
├─ scripts/                # 图标等维护脚本
├─ index.html              # Vite HTML 入口
├─ vite.config.ts          # Solid/Vite 和 dev server 配置
└─ README.md               # 用户和维护者说明
```

以下目录是依赖或生成物，不是业务源码：

- `node_modules/`
- `dist/`
- `src-tauri/target/`
- `src-tauri/target-verify/`
- `src-tauri/gen/`
- `.local/`

## 运行时架构

### 启动流程

1. `src/index.tsx` 渲染 `App`，并加载全局样式。
2. Tauri 进程由 `src-tauri/src/main.rs` 进入 `lib::run()`。
3. `lib.rs` 创建单实例、对话框、全局快捷键插件，注册所有前端可调用的 commands。
4. `setup` 中创建 `%LOCALAPPDATA%\app.winspot.desktop\` 及 `icons/`，打开 SQLite，读取设置和应用索引，创建共享 `AppState`，然后按配置显式创建主窗口并启用 `no_redirection_bitmap`。
5. 启用设置中的开机启动、全局快捷键、Win 键钩子、托盘、文件监听，并在后台延迟执行首次扫描。
6. 前端 `App` 调用 `api.bootstrap()` 取得设置、应用、扫描状态、显示器和启动错误，然后订阅后端事件。

### 前端层

- `App.tsx` 是应用级状态容器。它维护设置、应用列表、扫描进度、当前视图、窗口可见状态、材质设置和错误提示。
- `Launcher.tsx` 负责应用库和聚焦搜索：
  - 应用库按分类、固定状态和后端排序结果展示。
  - 网格和搜索列表只渲染可见窗口附近的内容。
  - 桌面模式下搜索通过后端执行；浏览器预览只做本地字符串过滤或显示 mock 状态。
  - 输入法组合期间不处理 Enter 启动，避免确认候选时误打开应用。
- `Preferences.tsx` 负责设置导航、设置搜索、应用管理、扫描目录、分类、导入导出和快捷键录制。
- `AppEditor.tsx` 将应用的用户整理写成 `AppOverride`。
- `components.tsx` 提供图标、弹窗、开关、下拉框、滑块、通知和通用按钮。
- 主界面使用 Windows Composition 的宿主背板，不直接套用 Mica、Mica Alt、Acrylic 或 Accent 预设，不截取桌面、不编码或传输背景图片。`material.rs` 在 UI 线程管理原生背景、色调、饱和度和几何裁剪；`nativeMaterial.ts` 只向后端同步三个面板的几何与淡入淡出状态，WebView 保留控件、文字、边缘高光和颗粒。
- `glass.ts` 将材质设置转换为一致的参数。桌面设置页的“预览”打开真实应用库，以临时材质参数渲染，不写入数据库；浏览器预览只作布局示意。
- `styles.css` 负责全局变量、浅色/深色主题、透明材质、布局和动效。不要把业务状态逻辑放入 CSS。

### 前后端通信

所有 Tauri IPC 应优先经过 `src/api.ts`：

- 桌面模式使用 `invoke` 和 `listen`。
- 浏览器预览使用 `desktop = isTauri()` 判断，并返回本地 mock 数据或空操作。
- `api.ts` 还封装图标资源 URL、文件选择和错误文本处理。
- 前端不应直接暴露通用 Shell 执行能力，也不应通过任意字符串让后端执行命令。

新增通信功能时，通常需要同时更新：

1. `src/types.ts` 中的前端数据形状。
2. `src/api.ts` 中的命令或事件封装。
3. `src-tauri/src/model.rs` 中的 Rust 模型和 serde 命名。
4. `src-tauri/src/commands.rs` 中的 command。
5. `src-tauri/src/lib.rs` 的 `generate_handler!` 注册。
6. 需要时更新对应的事件发送方和 `App.tsx` 订阅方。

Rust 模型使用 `#[serde(rename_all = "camelCase")]`，因此 JSON/IPC 字段在前端使用 camelCase。不要在单个组件内绕过现有适配层自行调用任意 command。

## 后端模块职责

### `AppState`

`lib.rs` 中的 `AppState` 是后端共享状态：

- `db: Mutex<Connection>`：SQLite 连接。
- `apps: RwLock<Vec<Application>>`：当前已提交的应用索引。
- `settings: RwLock<Settings>`：当前生效设置。
- `scan`、`cancel_scan`、`rescan_pending`：扫描状态和扫描控制。
- `capture_paused`、`hook_enabled`、`recording`：键盘接管与快捷键录制状态。
- `visible`、`transition`、`view`：窗口显示状态和动画竞态保护。
- `backdrop`：原生材质可用状态、系统透明状态及窗口过渡版本，不保存像素或桌面快照。合成对象只保存在 `material.rs` 的 UI 线程局部状态中，不能放入共享 `AppState`。
- `startup_errors`：启动阶段可展示给用户的非致命错误。
- `watcher`：文件系统监听器所有权。
- `icon_dir`：应用图标缓存目录。

访问共享状态时遵循已有锁顺序和短临界区模式。不要在持有数据库锁或写锁时执行长时间的目录遍历、COM 调用或窗口操作。

### `catalog.rs`

应用目录的主要来源：

- 当前用户和公共开始菜单/桌面。
- 用户配置的扫描目录。
- HKCU/HKLM 的 32 位和 64 位 App Paths。
- Windows AppsFolder 中可获取 AUMID 的打包应用。

普通 `.exe` 和 `.lnk` 通过 `make_app` 生成应用记录。快捷方式身份由目标、参数和工作目录决定：普通无参数快捷方式可以与其目标可执行文件共享身份；不同参数或工作目录应保持区分。相同 ID 的候选使用先发现的入口。

扫描特点：

- 默认目录和启用的自定义目录合并扫描。
- 目录排除是小写后的路径片段匹配，不是 glob 或正则。
- 不跟随符号链接，递归深度上限为 64。
- 扫描为单任务；扫描期间再次请求会设置 `rescan_pending`，当前任务结束后再执行一次。
- 取消扫描在提交索引前返回，因此应保留上一份已提交索引。
- 文件监听收到变化后会合并约 900ms，再触发扫描；不要为每个文件事件立即遍历整个索引。
- 图标按目标修改时间生成缓存文件，图标缓存只允许通过 Tauri asset scope 访问。

搜索流程：

1. `prepare_search` 为名称、原始名称和别名生成小写搜索文本、拼音全拼和首字母。
2. `search` 排除隐藏、过滤和 `excluded` 应用。
3. 精确名称/别名、前缀、首字母、包含匹配和 fuzzy match 按层级评分。
4. 固定状态、近期开启次数和最近启动时间会增加分数，最终再按手动排序和名称稳定排序。

### `store.rs`

SQLite 使用 WAL 和 `synchronous=NORMAL`。主要表：

- `meta`：序列化的设置。
- `applications`：发现结果的原始 JSON。
- `overrides`：用户对名称、别名、分类、固定、隐藏、过滤和排序的整理。
- `usage`：应用启动次数与最近启动时间。

读取应用时先读取原始记录，再合并 `overrides` 和 `usage`，最后重新准备搜索字段并排序。重新扫描不得丢失覆盖配置；应用暂时离线或来源被禁用时应保留历史记录，并通过 `available`/`excluded` 表示状态。

### `commands.rs`

commands 是前端边界，应保持窄且类型化：

- `bootstrap`：返回启动所需的完整快照。
- `search_apps`：校验查询长度后执行后端搜索。
- `launch_app`：只接受已登记应用 ID，后端重新查找目标并调用 `native::launch`，成功后记录使用统计。
- `start_scan`/`cancel_scan`：控制扫描。
- `save_settings`：校验设置、更新快捷键/自启、持久化并广播变化。
- `update_app`：写入应用覆盖并重新排序。
- `add_app`：只允许绝对路径、存在的 `.exe` 或 `.lnk`。
- `show_view`、`hide_launcher`、`open_settings`、`resize_search`：窗口控制。
- `export_config`/`import_config`/`reset_settings`：配置管理。
- `set_capture_paused`、`set_shortcut_recording`：快捷键相关状态切换。

修改设置时要保留现有的回滚语义：快捷键或开机启动更新失败时，原配置应继续生效。配置导入不会静默改变当前设备的开机启动和 Win 键接管开关。

### `native.rs`

所有 Windows 特有能力集中在这里：

- 初始化和释放 COM apartment。
- 解析快捷方式目标、参数和工作目录。
- 枚举已知目录及 AppsFolder。
- 从 Shell 提取 PNG 图标。
- 启动普通程序、快捷方式和 packaged app。
- 判断 WinSpot 是否仍拥有前台窗口。
- 设置焦点、检测系统透明效果、写入当前用户 Run 注册表项。

新增 Windows API 调用应放在此模块或与其明确相关的模块中，不要把 unsafe Shell/COM 代码散落到 UI command 或组件中。每次进入需要 COM 的操作都要保持已有 `Com::init()` 生命周期。

### `hotkeys.rs`

- 使用 Tauri global-shortcut 插件处理常规组合键。
- `Super` 是 WinSpot 对“单独 Win 键”的特殊配置值，不注册为普通 global shortcut。
- 只有 `capture_win && library_shortcut == "Super"` 时启用低级 Win 键钩子。
- `Ctrl+Esc` 保留给 Windows 开始菜单。
- 录制快捷键时暂时注销已注册组合键，结束录制后恢复。
- 钩子只处理按键状态和组合关系，不记录输入文本。

不要修改 Win 键状态机时顺便改变普通快捷键注册逻辑；不要吞掉 Win+E、Win+D、Win+L、Win+R、Win+Tab 等组合键行为。

### `windows.rs`

负责无边框透明窗口、显示器选择、DPI 位置和大小换算、窗口显示/隐藏过渡、搜索窗口高度、设置窗口和托盘。

主窗口默认隐藏、置顶、不在任务栏显示；库视图和搜索视图共享 `main` 窗口。设置窗口是通过 `index.html?window=settings` 创建的独立 Webview，前端根据 query 参数选择 `Preferences`。

窗口隐藏使用 `visible` 与 `transition` token 避免快速切换时旧动画把新窗口隐藏。改动 show/hide 流程时必须保留这类竞态保护。

### `material.rs`

- 仅在 Tauri UI 线程创建、更新和释放 DispatcherQueue、Compositor、DesktopWindowTarget 及其视觉对象，不跨线程传递 COM/WinRT 材质对象。
- 主窗口通过配置中的 `create: false` 延迟到 setup 创建，以设置 `no_redirection_bitmap(true)`；合成目标在 WebView 子窗口之下，保留原有鼠标、焦点与 IME 路径。
- 面板圆角由 Composition 几何决定，不依赖 DWM 的几档窗口圆角。窗口交互区域按面板与通知的联合区域设置；模态弹窗出现时恢复完整窗口范围。
- 几何 command 只接受 main 窗口的有限面板列表，校验有限数值、大小和当前 `transition` 版本。隐藏后停止显示背板，拒绝旧版本布局；退出时释放合成资源。
- `blur` 兼容既有 0–80 配置值，但表示宿主背板与真实透明背景的混合强度，不是可任意调整的高斯模糊像素半径。

## 数据与持久化约束

默认数据目录：

```text
%LOCALAPPDATA%\app.winspot.desktop\
  winspot.db
  winspot.db-wal
  winspot.db-shm
  icons\
```

持久化规则：

- 设置、应用索引、覆盖配置和启动历史全部在本机。
- 查询文本和按键内容不持久化。
- 毛玻璃不采集或保存桌面像素，不持久化布局或预览参数，也不扩大文件资产访问范围。
- 配置导出包含 `Settings` 和应用 `AppOverride`，不包含图标缓存与启动历史。
- 配置导入限制为 8 MB JSON，并保留当前设备的 `autostart` 与 `capture_win`。
- 恢复默认设置只重置设置，不删除应用索引和应用整理。
- 资产访问只允许 `icons/` 范围，不要扩大 Tauri asset scope 来绕过路径问题。

## UI 修改约定

- 保持 SolidJS 响应式模式：组件内用 `createSignal`/`createMemo`/`createEffect`，副作用在 `onMount` 并在 `onCleanup` 清理。
- 全局后端事件订阅集中在 `App.tsx`，组件级 DOM 事件要自行清理。
- 保持 `Launcher` 的查询请求序号和 debounce 逻辑，避免旧查询结果覆盖新查询。
- 保持 IME composition guard，不能在输入法确认候选时误启动应用。
- 应用启动只能提交应用 ID；前端不能把路径直接交给 Shell。
- 图标优先使用 `AppIcon`，按钮图标优先使用已有 `lucide-solid` 图标。
- 主题、透明度、图标大小和 reduced-motion 通过 `document.documentElement` 的 data 属性/CSS 变量同步。
- `localStorage` 只用于当前 WebView 的轻量 UI 偏好，例如强调色、窗口模式和极简模式展示选项；设备级设置必须走后端 SQLite。
- 新增设置项时同时考虑：`types.ts` 默认值、Rust `Settings` 默认值/校验/序列化、Preferences 控件、保存回读以及导入导出行为。

## 新增应用字段

1. 修改 `src/types.ts` 的 `Application` 或 `AppOverride`。
2. 修改 `src-tauri/src/model.rs` 对应模型及 serde 命名。
3. 更新 `catalog.rs` 创建记录时的默认值。
4. 如果字段需要持久化，确认 `store.rs` 的 JSON 读写和覆盖合并逻辑。
5. 更新 `api.ts`、组件显示和配置导入导出。

## 新增设置

1. 在 TypeScript 和 Rust 的 `Settings` 中保持相同字段语义。
2. 在两端默认值、校验范围和 camelCase 映射保持一致。
3. 在 `Preferences.tsx` 增加控件和保存策略。
4. 在需要时更新 `windows.rs`、`hotkeys.rs` 或 `commands.rs` 的运行时应用逻辑。
5. 确认 reset/import/export 的预期是否需要调整。

## 新增 Tauri command 或 event

1. 先定义输入/输出模型，避免裸字符串承载结构化数据。
2. 在 `commands.rs` 实现并做边界校验。
3. 在 `lib.rs` 注册 command。
4. 在 `api.ts` 封装 invoke/listen。
5. 在 `App.tsx` 或功能组件中接入事件生命周期。
6. 错误使用现有 `Result<_, String>`/`report`/`app-error` 展示路径，避免静默失败。

## 代码风格与安全边界

- 延续现有 TypeScript 双引号、分号和 SolidJS 写法；Rust 使用 rustfmt 风格。
- 优先使用已有模块和适配器，不为单个功能新建重复抽象。
- 不把业务逻辑塞进 `api.ts`、CSS 或 Web Component 的通用实现中。
- 不直接修改生成的 Tauri schema、构建目录或打包产物来解决源码问题。
- 所有外部路径都视为不可信输入：校验绝对路径、扩展名、文件存在性和长度。
- 后端 command 必须再次做权限和目标校验，不能依赖前端筛选结果。
- 不引入通用 Shell 执行接口、任意命令执行、远程数据源或遥测。
- 处理 Windows API 的 `unsafe` 时保持范围最小，并在边界处转换为可读错误。

## 交付前静态检查

在不启动 dev/build、不使用自动化测试的前提下，检查：

- 新增 import、类型、函数名和 Tauri command 注册是否对应。
- TypeScript 与 Rust 的字段名、可选性、默认值和 `camelCase` 是否一致。
- 所有 `onMount`、事件监听器、计时器、ResizeObserver 和 IPC listener 是否有对应清理。
- 扫描取消、重复扫描、窗口快速切换、旧搜索结果和快捷键录制是否保持竞态保护。
- 失败路径是否恢复旧设置、旧索引或旧快捷键，并通过已有错误提示显示。
- 改动是否只涉及源码和必要文档，没有误改生成物。

最终 UI、快捷键、扫描、安装和性能验证由用户在自己的 Windows 开发端或安装版中完成。
