# WinSpot Website

独立的中文静态官网，直接打开 `index.html` 即可。没有构建步骤、前端框架、远程字体、运行时 CDN、统计脚本或对桌面应用的 IPC 调用。

部署时将本目录作为静态站点根目录即可。`design/`、`design-manifest.json`、`style-explorer.html` 和 `scripts/` 是设计及维护资料，可在部署时排除。

## 文件

- `index.html`：官网内容、语义结构与默认展示。
- `styles.css`：布局、响应式适配、玻璃效果和动效。
- `script.js`：分类、搜索、键盘选择、外观预览与移动导航。
- `assets/`：本地标志、壁纸、应用图标和 Lucide 图标。
- `DESIGN.md`：设计依据、交付边界与静态检查记录。
- `style-explorer.html`：使用 oil-ui-pro 生成器生成的两种方向对比。

## 内容边界

获取入口指向项目源码和 GitHub 发布页，不假设已有可下载的签名安装包。安装状态以项目 README 和实际发布文件为准。

应用库与搜索结果使用固定展示数据。图标点击和 Enter 只改变选择，不会启动程序、读取文件或模拟成功启动。搜索展示不是 Rust 搜索引擎，透明效果也不是 Windows 原生 Composition 的浏览器等价实现。

## 维护

添加或更换正式安装包链接时，更新 `index.html` 的获取区域和相应 FAQ。不要将未来版本的承诺写成已经存在的功能。

Lucide 和部分文件图标从现有项目依赖中提取，更新图标可在项目依赖已安装时运行：

```powershell
node website/scripts/prepare-icons.mjs
```

这是素材维护脚本，不是官网运行或构建所需步骤。图标许可与图片来源见 `THIRD_PARTY_NOTICES.md`。

## 验收

遵循项目 AGENTS.md，本次没有启动开发服务、运行生产构建、使用浏览器/桌面自动化或进行 UI 验收。实际字体、玻璃背景、触屏、键盘交互和不同视口的显示效果需要用户打开页面检查。
