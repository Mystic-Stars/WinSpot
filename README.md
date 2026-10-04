# WinSpot

WinSpot 是一个运行在 Windows 上的本地应用启动器。它会整理电脑里的应用，用真实图标和清晰的分类展示，并提供快速搜索、文件搜索和快捷键唤起。

WinSpot 不需要账号，不上传数据，也不依赖云端服务。应用索引、设置和启动记录都保存在本机。

## 主要功能

- 自动发现开始菜单、桌面、Windows AppsFolder 和 App Paths 中的应用
- 添加自定义目录，或手动添加 `.exe` 和 `.lnk`
- 使用中文、英文、拼音、首字母、别名和模糊匹配搜索
- 按分类浏览应用，支持改名、别名、固定、隐藏、过滤和手动排序
- 搜索文件和文件夹，优先使用 Everything，不可用时自动使用本地目录扫描
- 显示真实应用图标，并为常见文件类型提供本地图标和图片预览
- 支持单独按 Win 键或使用普通快捷键唤起
- 支持浅色、深色、跟随系统主题，以及透明材质、色调、饱和度和圆角设置
- 支持系统托盘、开机启动、配置导入和导出

## 系统要求

- Windows 11 22H2 或更新版本
- x64 设备
- Microsoft Edge WebView2 Runtime

WinSpot 使用 Windows 原生能力显示应用图标、启动程序和管理窗口，因此不提供 Windows 10、ARM64 或其他操作系统版本的支持保证。

## 使用方法

首次启动后，WinSpot 会扫描常用应用位置。扫描完成后，可以直接在应用库中浏览，也可以使用搜索。

常用操作：

- 单独按下并释放 Win：显示或隐藏应用库
- `Alt+Space`：打开聚焦搜索
- 输入中文、英文、拼音或首字母：搜索应用和文件
- 方向键：移动选择
- `Enter`：打开当前选中的应用或文件
- `Esc`：关闭菜单、清空搜索，或关闭启动器
- `Ctrl+Esc`：打开 Windows 开始菜单

在应用上打开更多操作，可以修改名称、别名、分类、固定状态、可见性和排序。右上角菜单可进入设置、添加应用或重新扫描。

## 文件搜索

文件搜索可以使用设置中指定的 Everything `es.exe`，也可以自动发现本机可用的 Everything。Everything 不可用时，WinSpot 会根据设置扫描桌面、文档、下载、应用目录和其他补充目录。

WinSpot 不建立全盘持久化文件索引，也不会把文件内容上传到网络。搜索范围和速度取决于 Everything 是否可用以及设置中的目录。

## 安装与开发

仓库当前提供源码。要从源码运行，需要安装 Node.js、pnpm、Rust MSVC 工具链、Visual Studio 2022 C++ 桌面开发组件和 Windows SDK。

```powershell
pnpm install --frozen-lockfile
pnpm desktop
```

只查看前端布局：

```powershell
pnpm dev
```

发布安装包：

```powershell
pnpm package
```

生成的 NSIS 安装包位于 `src-tauri/target/release/bundle/nsis/`。安装包目前未配置代码签名，Windows 可能显示未知发布者提示。

## 隐私与本地数据

WinSpot 的数据目录为：

```text
%LOCALAPPDATA%\app.winspot.desktop\
  winspot.db
  winspot.db-wal
  winspot.db-shm
  icons\
```

本地数据库保存应用索引、设置、应用整理记录和启动统计。搜索内容和键盘输入不会被保存。Win 键接管只判断按键状态和组合关系，不记录输入文本。

配置导出包含设置和应用整理，不包含图标缓存与启动历史。导入配置时，会保留当前设备的开机启动和 Win 键接管设置。

## 当前限制

- Win 键接管可能与远程桌面、UAC 安全桌面、反作弊软件或其他键盘工具冲突；可以在托盘中临时暂停。
- 部分特殊 Shell 入口、权限受限应用或无法读取 AUMID 的打包应用可能无法发现。
- 文件和图片预览依赖本机权限、系统缩略图处理程序和文件状态；无法预览时仍可尝试打开或定位文件。
- 应用分类和辅助程序过滤使用本地规则，个别应用可能需要手动调整。
- 安装包未签名，也没有内置自动更新服务。

第三方图标许可见 [`docs/THIRD_PARTY_NOTICES.md`](docs/THIRD_PARTY_NOTICES.md)。
