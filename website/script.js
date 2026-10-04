(() => {
  "use strict";

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  const icons = window.WinSpotIcons || {};

  function paintIcon(element, name) {
    if (!element) return;
    element.dataset.icon = name;
    element.innerHTML = icons[name] || "";
  }

  $$("[data-icon]").forEach((element) => paintIcon(element, element.dataset.icon));

  const menuToggle = $(".menu-toggle");
  const mobileNav = $("#mobile-nav");
  menuToggle.hidden = false;
  function closeMenu() {
    mobileNav.hidden = true;
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "打开导航菜单");
    paintIcon($("[data-icon]", menuToggle), "menu");
  }
  menuToggle.addEventListener("click", () => {
    const open = mobileNav.hidden;
    mobileNav.hidden = !open;
    menuToggle.setAttribute("aria-expanded", String(open));
    menuToggle.setAttribute("aria-label", open ? "关闭导航菜单" : "打开导航菜单");
    paintIcon($("[data-icon]", menuToggle), open ? "x" : "menu");
  });
  $$("a", mobileNav).forEach((link) => link.addEventListener("click", closeMenu));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !mobileNav.hidden) {
      closeMenu();
      menuToggle.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!mobileNav.hidden && !event.target.closest(".site-header")) closeMenu();
  });
  const desktopMedia = window.matchMedia("(min-width: 761px)");
  desktopMedia.addEventListener("change", (event) => { if (event.matches) closeMenu(); });

  function normalize(value) {
    return value.trim().toLocaleLowerCase().replace(/\s+/g, "");
  }

  function matches(text, query) {
    if (!query) return true;
    const normalized = normalize(text);
    if (normalized.includes(query)) return true;
    // The showcase accepts small omissions without pretending to run the native engine.
    let position = 0;
    for (const character of normalized) {
      if (character === query[position]) position++;
      if (position === query.length) return true;
    }
    return false;
  }

  const APPS = [
    {
      id: "vscode",
      name: "VS Code",
      category: "dev",
      categoryLabel: "开发者工具",
      kind: "桌面程序",
      target: "C:\\Users\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe",
      icon: "./assets/vscode.svg",
      pinned: true,
      search: "visual studio code vscode code 代码 编辑器 daima dm vs",
    },
    {
      id: "wechat",
      name: "微信",
      category: "social",
      categoryLabel: "社交",
      kind: "Windows 应用",
      target: "C:\\Program Files\\Tencent\\WeChat\\WeChat.exe",
      icon: "./assets/wechat.svg",
      pinned: true,
      search: "微信 weixin wx wechat 聊天 liaotian lt",
    },
    {
      id: "figma",
      name: "Figma",
      category: "creative",
      categoryLabel: "创意",
      kind: "桌面程序",
      target: "C:\\Users\\AppData\\Local\\Figma\\Figma.exe",
      icon: "./assets/figma.svg",
      pinned: false,
      search: "figma 设计 sheji sj 界面设计 ui ux",
    },
    {
      id: "chrome",
      name: "Chrome",
      category: "tools",
      categoryLabel: "工具",
      kind: "桌面程序",
      target: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      icon: "./assets/chrome.svg",
      pinned: false,
      search: "google chrome gc 谷歌 浏览器 guge gg",
    },
    {
      id: "notion",
      name: "Notion",
      category: "work",
      categoryLabel: "效率与财务",
      kind: "桌面程序",
      target: "C:\\Users\\AppData\\Local\\Programs\\Notion\\Notion.exe",
      icon: "./assets/notion.svg",
      pinned: false,
      search: "notion 笔记 biji bj 知识库 文档",
    },
    {
      id: "spotify",
      name: "Spotify",
      category: "fun",
      categoryLabel: "娱乐",
      kind: "Windows 应用",
      target: "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify",
      icon: "./assets/spotify.svg",
      pinned: false,
      search: "spotify 音乐 yinyue yy 播放器 bofangqi",
    },
    {
      id: "blender",
      name: "Blender",
      category: "creative",
      categoryLabel: "创意",
      kind: "桌面程序",
      target: "C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe",
      icon: "./assets/blender.svg",
      pinned: false,
      search: "blender 3d 建模 jianmo jm 渲染",
    },
    {
      id: "word",
      name: "Word",
      category: "work",
      categoryLabel: "效率与财务",
      kind: "桌面程序",
      target: "C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE",
      icon: "./assets/word.svg",
      pinned: false,
      search: "word microsoft 微软 文档 wendang wd 文字处理",
    },
    {
      id: "edge",
      name: "Edge",
      category: "tools",
      categoryLabel: "工具",
      kind: "Windows 应用",
      target: "Microsoft.MicrosoftEdge_8wekyb3d8bbwe!MicrosoftEdge",
      icon: "./assets/edge.svg",
      pinned: false,
      search: "microsoft edge 微软 浏览器 liulanqi llq 网页",
    },
    {
      id: "photoshop",
      name: "Photoshop",
      category: "creative",
      categoryLabel: "创意",
      kind: "桌面程序",
      target: "C:\\Program Files\\Adobe\\Adobe Photoshop 2025\\Photoshop.exe",
      icon: "./assets/photoshop.svg",
      pinned: false,
      search: "adobe photoshop ps 图像 tuxiang tx 修图",
    },
    {
      id: "github",
      name: "GitHub Desktop",
      category: "dev",
      categoryLabel: "开发者工具",
      kind: "桌面程序",
      target: "C:\\Users\\AppData\\Local\\GitHubDesktop\\GitHubDesktop.exe",
      icon: "./assets/github.svg",
      pinned: false,
      search: "github desktop git 代码 仓库 cāngkù ck",
    },
    {
      id: "excel",
      name: "Excel",
      category: "work",
      categoryLabel: "效率与财务",
      kind: "桌面程序",
      target: "C:\\Program Files\\Microsoft Office\\root\\Office16\\EXCEL.EXE",
      icon: "./assets/excel.svg",
      pinned: false,
      search: "excel microsoft 表格 biaoge bg 数据 表单",
    },
    {
      id: "slack",
      name: "Slack",
      category: "social",
      categoryLabel: "社交",
      kind: "桌面程序",
      target: "C:\\Users\\AppData\\Local\\slack\\slack.exe",
      icon: "./assets/slack.svg",
      pinned: false,
      search: "slack 团队 沟通 goutong gt 工作群",
    },
    {
      id: "steam",
      name: "Steam",
      category: "fun",
      categoryLabel: "娱乐",
      kind: "桌面程序",
      target: "C:\\Program Files (x86)\\Steam\\steam.exe",
      icon: "./assets/steam.svg",
      pinned: false,
      search: "steam 游戏 youxi yx 游戏库",
    },
    {
      id: "firefox",
      name: "Firefox",
      category: "tools",
      categoryLabel: "工具",
      kind: "桌面程序",
      target: "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
      icon: "./assets/firefox.svg",
      pinned: false,
      search: "firefox 火狐 huohu hh 浏览器 liulanqi",
    },
    {
      id: "terminal",
      name: "Windows Terminal",
      category: "dev",
      categoryLabel: "开发者工具",
      kind: "Windows 应用",
      target: "Microsoft.WindowsTerminal_8wekyb3d8bbwe!App",
      icon: "./assets/terminal.svg",
      pinned: false,
      search: "windows terminal wt 终端 powershell cmd 命令行",
    },
    {
      id: "qq",
      name: "QQ",
      category: "social",
      categoryLabel: "社交",
      kind: "桌面程序",
      target: "C:\\Program Files\\Tencent\\QQNT\\QQ.exe",
      icon: "./assets/qq.svg",
      pinned: false,
      search: "qq 腾讯 聊天 liaotian lt im",
    },
    {
      id: "telegram",
      name: "Telegram",
      category: "social",
      categoryLabel: "社交",
      kind: "桌面程序",
      target: "C:\\Users\\AppData\\Roaming\\Telegram Desktop\\Telegram.exe",
      icon: "./assets/telegram.svg",
      pinned: false,
      search: "telegram tg 电报 即时通讯 liaotian",
    },
    {
      id: "bilibili",
      name: "哔哩哔哩",
      category: "fun",
      categoryLabel: "娱乐",
      kind: "Windows 应用",
      target: "36697ZB.Bilibili-UWP_8wekyb3d8bbwe!App",
      icon: "./assets/bilibili.svg",
      pinned: false,
      search: "bilibili 哔哩哔哩 b站 blbl 视频 动画 bz",
    },
    {
      id: "netease",
      name: "网易云音乐",
      category: "fun",
      categoryLabel: "娱乐",
      kind: "桌面程序",
      target: "C:\\Program Files (x86)\\Netease\\CloudMusic\\cloudmusic.exe",
      icon: "./assets/netease.svg",
      pinned: false,
      search: "网易云音乐 netease music 听歌 播放器 yinyue wyy",
    },
    {
      id: "powerpoint",
      name: "PowerPoint",
      category: "work",
      categoryLabel: "效率与财务",
      kind: "桌面程序",
      target: "C:\\Program Files\\Microsoft Office\\root\\Office16\\POWERPNT.EXE",
      icon: "./assets/powerpoint.svg",
      pinned: false,
      search: "powerpoint ppt 微软 幻灯片 演示 huandengpian",
    },
    {
      id: "onenote",
      name: "OneNote",
      category: "work",
      categoryLabel: "效率与财务",
      kind: "桌面程序",
      target: "C:\\Program Files\\Microsoft Office\\root\\Office16\\ONENOTE.EXE",
      icon: "./assets/onenote.svg",
      pinned: false,
      search: "onenote 微软 笔记 biji 便签 记事本",
    },
    {
      id: "typora",
      name: "Typora",
      category: "work",
      categoryLabel: "效率与财务",
      kind: "桌面程序",
      target: "C:\\Program Files\\Typora\\Typora.exe",
      icon: "./assets/typora.svg",
      pinned: false,
      search: "typora markdown md 编辑器 笔记 写作",
    },
    {
      id: "docker",
      name: "Docker Desktop",
      category: "dev",
      categoryLabel: "开发者工具",
      kind: "桌面程序",
      target: "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe",
      icon: "./assets/docker.svg",
      pinned: false,
      search: "docker desktop 容器 镜像 虚拟化 rongqi",
    },
    {
      id: "intellij",
      name: "IntelliJ IDEA",
      category: "dev",
      categoryLabel: "开发者工具",
      kind: "桌面程序",
      target: "C:\\Program Files\\JetBrains\\IntelliJ IDEA\\bin\\idea64.exe",
      icon: "./assets/intellij.svg",
      pinned: false,
      search: "intellij idea jetbrains ide java 开发者工具 kaifa",
    },
    {
      id: "obsidian",
      name: "Obsidian",
      category: "work",
      categoryLabel: "效率与财务",
      kind: "桌面程序",
      target: "C:\\Users\\AppData\\Local\\Obsidian\\Obsidian.exe",
      icon: "./assets/obsidian.svg",
      pinned: false,
      search: "obsidian 知识库 双链 笔记 markdown md",
    },
    {
      id: "calculator",
      name: "计算器",
      category: "tools",
      categoryLabel: "工具",
      kind: "Windows 应用",
      target: "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App",
      icon: "./assets/calculator.svg",
      pinned: false,
      search: "计算器 calculator jisuanqi jsq calc 计算",
    },
    {
      id: "settings",
      name: "Windows 设置",
      category: "tools",
      categoryLabel: "工具",
      kind: "Windows 应用",
      target: "windows.immersivecontrolpanel_cw5n1h2txyewy!microsoft.windows.immersivecontrolpanel",
      icon: "./assets/settings.svg",
      pinned: false,
      search: "设置 settings shezhi sz 系统设置 控制面板",
    },
    {
      id: "premiere",
      name: "Premiere Pro",
      category: "creative",
      categoryLabel: "创意",
      kind: "桌面程序",
      target: "C:\\Program Files\\Adobe\\Adobe Premiere Pro 2025\\Adobe Premiere Pro.exe",
      icon: "./assets/premiere.svg",
      pinned: false,
      search: "adobe premiere pro pr 剪辑 视频剪辑 shipin jianji",
    },
  ];

  const launcher = $("#launcher-demo");
  const morphCard = $("#winspot-morph-card");
  const libraryHeader = $("#library-header");
  const spotlightHeader = $("#spotlight-header");
  const librarySearchArea = $("#library-search-area");
  const libraryInput = $("#library-search-input");
  const measureSpan = $("#library-search-measure");
  const spotlightInput = $("#spotlight-search-input");
  const spotlightClearBtn = $("#spotlight-clear-btn");
  const spotlightHeaderScopes = $("#spotlight-header-scopes");
  const spotlightHoverTrigger = $("#spotlight-hover-trigger");
  const standaloneScopes = $("#spotlight-standalone-scopes");
  const libraryContentView = $("#library-content-view");
  const libraryRecRow = $("#library-recommended-row");
  const libraryMainGrid = $("#library-main-grid");
  const libraryEmpty = $("#library-empty");
  const libraryScrollBody = $("#library-scroll-body");
  const libraryMatchPill = $("#library-match-pill");
  const matchedIconImg = $("#matched-icon-img");
  const libraryMatchedIcon = $("#library-matched-icon");
  const spotlightCardBody = $("#spotlight-card-body");
  const spotlightCardFooter = $("#spotlight-card-footer");
  const spotlightListScroll = $("#spotlight-list-scroll");
  const spotlightEmptyState = $("#spotlight-empty-state");
  const spotlightCountLabel = $("#spotlight-count-label");
  const inspectorIconImg = $("#inspector-icon-img");
  const inspectorTitle = $("#inspector-title");
  const inspectorMetaCat = $("#inspector-meta-cat");
  const inspectorMetaType = $("#inspector-meta-type");
  const inspectorPath = $("#inspector-path");
  const inspectorLaunchBtn = $("#inspector-launch-btn");
  const libraryBackBtn = $("#library-back-btn");
  const scopeBtnApps = $("#scope-btn-apps");
  const hintTabLibrary = $("#hint-tab-library");
  const categoryTabs = $$(".library-tab-pill");
  const viewButtons = $$(".view-switch button");
  const viewSwitch = $(".view-switch");

  const RECOMMENDED_IDS = ["vscode", "wechat", "figma", "chrome", "notion", "spotify", "blender"];

  let currentCategory = "all";
  let librarySelectedApp = APPS[0];
  let spotlightSelectedApp = APPS[0];
  let isComposing = false;
  let hideScopesTimeout;

  function measureTextWidth(text) {
    if (!text) return 0;
    if (measureSpan) {
      measureSpan.textContent = text;
      const rect = measureSpan.getBoundingClientRect();
      if (rect.width > 0) return Math.ceil(rect.width) + 2;
    }
    let estimated = 0;
    for (const ch of text) {
      estimated += ch.charCodeAt(0) > 255 ? 15 : 9;
    }
    return Math.ceil(estimated) + 2;
  }

  function launchFeedback(name) {
    const toast = document.createElement("div");
    toast.className = "demo-launch-toast";
    toast.textContent = `已打开应用：${name}`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 260);
    }, 1600);
  }

  function updateLibraryPrediction() {
    if (!libraryInput || !libraryMatchPill) return;
    const rawVal = libraryInput.value;
    const trimmed = rawVal.trim();
    const query = normalize(trimmed);

    if (!trimmed) {
      if (librarySelectedApp) {
        libraryInput.style.width = "0px";
        libraryInput.placeholder = "";
        libraryMatchPill.textContent = `${librarySelectedApp.name} - 打开`;
        libraryMatchPill.hidden = false;
      } else {
        libraryInput.style.width = "140px";
        libraryInput.placeholder = "应用程序";
        libraryMatchPill.hidden = true;
      }
      return;
    }

    const w = measureTextWidth(rawVal);
    libraryInput.style.width = `${Math.max(12, w)}px`;
    libraryInput.placeholder = "";

    const match = APPS.find((a) => a.name.toLowerCase().startsWith(trimmed.toLowerCase()))
      || APPS.find((a) => a.name.toLowerCase().includes(trimmed.toLowerCase()))
      || APPS.find((a) => matches(a.search, query));

    if (match) {
      librarySelectedApp = match;
      if (matchedIconImg) matchedIconImg.src = match.icon;
      if (libraryMainGrid) {
        $$(".app-tile", libraryMainGrid).forEach((tile) => {
          tile.classList.toggle("selected", tile.dataset.app === match.id);
        });
      }
      if (libraryRecRow) {
        $$(".app-tile", libraryRecRow).forEach((tile) => {
          tile.classList.toggle("selected", tile.dataset.app === match.id);
        });
      }

      const name = match.name;
      if (name.toLowerCase().startsWith(trimmed.toLowerCase())) {
        libraryMatchPill.textContent = `${name.slice(trimmed.length)} - 打开`;
      } else {
        libraryMatchPill.textContent = `- ${name}`;
      }
      libraryMatchPill.hidden = false;
    } else {
      libraryMatchPill.hidden = true;
    }
  }

  function renderLibraryGrid() {
    const query = normalize(libraryInput ? libraryInput.value : "");
    const showRecommended = !query && currentCategory === "all";

    if (libraryRecRow) libraryRecRow.hidden = !showRecommended;
    const libraryDivider = $(".library-divider", libraryContentView);
    if (libraryDivider) libraryDivider.hidden = !showRecommended;

    const recIds = new Set(RECOMMENDED_IDS);
    const filtered = APPS.filter((app) => {
      const matchCat = currentCategory === "all" || app.category === currentCategory;
      const matchQ = !query || matches(app.search, query) || matches(app.name, query);
      if (!matchCat || !matchQ) return false;
      if (showRecommended && recIds.has(app.id)) return false;
      return true;
    });

    if (libraryMainGrid) {
      libraryMainGrid.innerHTML = filtered.map((app) => {
        const isSel = librarySelectedApp && librarySelectedApp.id === app.id;
        const pinHtml = app.pinned ? `<span class="pin-badge" title="已固定"><span data-icon="pin" aria-hidden="true"></span></span>` : "";
        return `
          <div class="app-cell" role="listitem">
            <button class="app-tile ${isSel ? "selected" : ""}" type="button" data-app="${app.id}" title="${app.name}">
              <span class="tile-icon">
                <span class="app-icon-wrapper"><img src="${app.icon}" width="56" height="56" alt="" loading="lazy"></span>
                ${pinHtml}
              </span>
              <span class="app-name">${app.name}</span>
            </button>
          </div>
        `;
      }).join("");

      $$(".app-tile", libraryMainGrid).forEach((btn) => {
        btn.addEventListener("click", () => {
          const app = APPS.find((a) => a.id === btn.dataset.app);
          if (app) selectLibraryApp(app);
        });
      });
      $$("[data-icon]", libraryMainGrid).forEach((el) => paintIcon(el, el.dataset.icon));
    }

    if (libraryEmpty) libraryEmpty.hidden = filtered.length > 0;
    if (libraryMainGrid) libraryMainGrid.hidden = filtered.length === 0;

    updateLibraryPrediction();
  }

  function selectLibraryApp(app, updateGrid = true) {
    librarySelectedApp = app;
    if (matchedIconImg) matchedIconImg.src = app.icon;
    if (updateGrid) {
      if (libraryMainGrid) {
        $$(".app-tile", libraryMainGrid).forEach((tile) => {
          tile.classList.toggle("selected", tile.dataset.app === app.id);
        });
      }
      if (libraryRecRow) {
        $$(".app-tile", libraryRecRow).forEach((tile) => {
          tile.classList.toggle("selected", tile.dataset.app === app.id);
        });
      }
    }
    updateLibraryPrediction();
  }

  function renderSpotlightResults() {
    const query = normalize(spotlightInput ? spotlightInput.value : "");
    const filtered = APPS.filter((app) => !query || matches(app.search, query) || matches(app.name, query));

    if (spotlightListScroll) {
      spotlightListScroll.innerHTML = filtered.map((app, idx) => {
        const isSel = (spotlightSelectedApp && spotlightSelectedApp.id === app.id) || (!spotlightSelectedApp && idx === 0);
        return `
          <button class="spotlight-item-row ${isSel ? "selected" : ""}" type="button" data-app="${app.id}">
            <span class="file-result-visual"><img src="${app.icon}" width="32" height="32" alt="" loading="lazy"></span>
            <span class="spotlight-item-info">
              <span class="spotlight-item-name">${app.name}</span>
              <span class="spotlight-item-category">${app.categoryLabel} · ${app.kind}</span>
            </span>
            <span class="spotlight-item-enter" aria-hidden="true">↵</span>
          </button>
        `;
      }).join("");

      $$(".spotlight-item-row", spotlightListScroll).forEach((row) => {
        row.addEventListener("click", () => {
          const app = APPS.find((a) => a.id === row.dataset.app);
          if (app) selectSpotlightApp(app);
        });
      });
    }

    if (spotlightEmptyState) spotlightEmptyState.hidden = filtered.length > 0;
    if (spotlightCountLabel) spotlightCountLabel.textContent = `${filtered.length} 个结果`;

    if (filtered.length > 0) {
      const currentInList = filtered.find((a) => spotlightSelectedApp && a.id === spotlightSelectedApp.id);
      selectSpotlightApp(currentInList || filtered[0], false);
    }
  }

  function selectSpotlightApp(app, scroll = false) {
    spotlightSelectedApp = app;
    if (inspectorIconImg) inspectorIconImg.src = app.icon;
    if (inspectorTitle) inspectorTitle.textContent = app.name;
    if (inspectorMetaCat) inspectorMetaCat.textContent = app.categoryLabel;
    if (inspectorMetaType) inspectorMetaType.textContent = app.kind;
    if (inspectorPath) inspectorPath.textContent = app.target;

    if (spotlightListScroll) {
      $$(".spotlight-item-row", spotlightListScroll).forEach((row) => {
        const isSel = row.dataset.app === app.id;
        row.classList.toggle("selected", isSel);
        if (isSel && scroll) row.scrollIntoView({ block: "nearest" });
      });
    }
  }

  function setMode(mode) {
    launcher.dataset.mode = mode;
    viewSwitch.dataset.active = mode;
    viewButtons.forEach((btn) => {
      const active = btn.dataset.mode === mode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    });

    clearTimeout(hideScopesTimeout);

    if (mode === "library") {
      morphCard.className = "winspot-morph-card native-surface is-library";
      libraryHeader.hidden = false;
      libraryContentView.hidden = false;
      spotlightHeader.hidden = true;
      spotlightCardBody.hidden = true;
      spotlightCardFooter.hidden = true;
      if (standaloneScopes) {
        standaloneScopes.classList.remove("is-expanded");
        standaloneScopes.hidden = true;
      }
      if (libraryScrollBody) libraryScrollBody.scrollTop = 0;
      renderLibraryGrid();
      if (libraryInput) {
        requestAnimationFrame(() => libraryInput.focus({ preventScroll: true }));
      }
    } else {
      // Spotlight mode
      libraryHeader.hidden = true;
      libraryContentView.hidden = true;
      spotlightHeader.hidden = false;
      if (standaloneScopes) {
        standaloneScopes.hidden = false;
      }
      updateSpotlightMode();
      if (spotlightInput) {
        requestAnimationFrame(() => spotlightInput.focus({ preventScroll: true }));
      }
    }
  }

  function updateSpotlightMode() {
    const q = spotlightInput ? spotlightInput.value.trim() : "";
    if (!q) {
      // Capsule state
      morphCard.className = "winspot-morph-card native-surface is-capsule";
      spotlightHeader.className = "spotlight-capsule-header";
      spotlightCardBody.hidden = true;
      spotlightCardFooter.hidden = true;
      spotlightHeaderScopes.hidden = true;
      spotlightClearBtn.hidden = true;
      spotlightHoverTrigger.hidden = false;
      if (standaloneScopes) standaloneScopes.hidden = false;
    } else {
      // Expanded state
      morphCard.className = "winspot-morph-card native-surface is-search-expanded";
      spotlightHeader.className = "spotlight-card-header";
      spotlightCardBody.hidden = false;
      spotlightCardFooter.hidden = false;
      spotlightHeaderScopes.hidden = false;
      spotlightClearBtn.hidden = false;
      spotlightHoverTrigger.hidden = true;
      if (standaloneScopes) {
        standaloneScopes.classList.remove("is-expanded");
        standaloneScopes.hidden = true;
      }
      renderSpotlightResults();
    }
  }

  // Bind library search
  if (libraryInput) {
    libraryInput.addEventListener("compositionstart", () => { isComposing = true; });
    libraryInput.addEventListener("compositionend", () => {
      isComposing = false;
      renderLibraryGrid();
    });
    libraryInput.addEventListener("input", (e) => {
      if (!isComposing && !e.isComposing) renderLibraryGrid();
    });
    libraryInput.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !libraryInput.value) {
        if (librarySelectedApp) {
          librarySelectedApp = null;
          updateLibraryPrediction();
          $$(".app-tile", libraryMainGrid).forEach((t) => t.classList.remove("selected"));
          $$(".app-tile", libraryRecRow).forEach((t) => t.classList.remove("selected"));
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (librarySelectedApp) launchFeedback(librarySelectedApp.name);
      }
    });
  }

  if (librarySearchArea) {
    librarySearchArea.addEventListener("click", () => {
      if (libraryInput) libraryInput.focus();
    });
  }

  if (libraryMatchedIcon) {
    libraryMatchedIcon.addEventListener("click", () => {
      if (librarySelectedApp) launchFeedback(librarySelectedApp.name);
    });
  }

  // Bind spotlight search
  if (spotlightInput) {
    spotlightInput.addEventListener("compositionstart", () => { isComposing = true; });
    spotlightInput.addEventListener("compositionend", () => { isComposing = false; updateSpotlightMode(); });
    spotlightInput.addEventListener("input", (e) => {
      if (!isComposing && !e.isComposing) updateSpotlightMode();
    });
    if (spotlightClearBtn) {
      spotlightClearBtn.addEventListener("click", () => {
        spotlightInput.value = "";
        updateSpotlightMode();
        spotlightInput.focus({ preventScroll: true });
      });
    }
  }

  // Category pills in library
  categoryTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      categoryTabs.forEach((t) => {
        const active = t === tab;
        t.classList.toggle("active", active);
        t.setAttribute("aria-selected", String(active));
      });
      currentCategory = tab.dataset.category;
      renderLibraryGrid();
    });
  });

  // Recommended row click selection
  if (libraryRecRow) {
    $$(".app-tile", libraryRecRow).forEach((tile) => {
      tile.addEventListener("click", () => {
        const app = APPS.find((a) => a.id === tile.dataset.app);
        if (app) selectLibraryApp(app);
      });
    });
  }

  // View switch buttons
  viewButtons.forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  // Library back button to Spotlight
  if (libraryBackBtn) {
    libraryBackBtn.addEventListener("click", () => setMode("search"));
  }

  // Standalone scopes button to Library
  if (scopeBtnApps) {
    scopeBtnApps.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setMode("library");
    });
  }

  // Spotlight header scope button to Library
  $$('.scope-circle[data-scope="library"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setMode("library");
    });
  });

  // Clickable Tab hint in spotlight footer
  if (hintTabLibrary) {
    hintTabLibrary.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setMode("library");
    });
  }

  if (inspectorLaunchBtn) {
    inspectorLaunchBtn.addEventListener("click", () => {
      if (spotlightSelectedApp) launchFeedback(spotlightSelectedApp.name);
    });
  }

  // Hover triggers for standalone scopes in capsule mode
  if (spotlightHoverTrigger && standaloneScopes) {
    spotlightHoverTrigger.addEventListener("mouseenter", () => {
      if (launcher.dataset.mode !== "search" || (spotlightInput && spotlightInput.value.trim())) return;
      clearTimeout(hideScopesTimeout);
      standaloneScopes.classList.add("is-expanded");
    });
    spotlightHoverTrigger.addEventListener("mouseleave", () => {
      hideScopesTimeout = setTimeout(() => {
        if (!standaloneScopes.matches(":hover")) standaloneScopes.classList.remove("is-expanded");
      }, 300);
    });
    standaloneScopes.addEventListener("mouseenter", () => {
      if (launcher.dataset.mode !== "search" || (spotlightInput && spotlightInput.value.trim())) return;
      clearTimeout(hideScopesTimeout);
    });
    standaloneScopes.addEventListener("mouseleave", () => {
      standaloneScopes.classList.remove("is-expanded");
    });
  }

  // Reset in library empty
  $(".reset-demo")?.addEventListener("click", () => {
    if (libraryInput) libraryInput.value = "";
    renderLibraryGrid();
  });

  // Keyboard navigation
  launcher.addEventListener("keydown", (e) => {
    if (isComposing || e.isComposing || e.keyCode === 229 || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "Tab") {
      e.preventDefault();
      setMode(launcher.dataset.mode === "library" ? "search" : "library");
      return;
    }
    if (e.key === "Escape") {
      if (launcher.dataset.mode === "library" && libraryInput && libraryInput.value) {
        e.preventDefault();
        libraryInput.value = "";
        renderLibraryGrid();
        return;
      }
      if (launcher.dataset.mode === "search" && spotlightInput && spotlightInput.value) {
        e.preventDefault();
        spotlightInput.value = "";
        updateSpotlightMode();
        return;
      }
    }

    if (launcher.dataset.mode === "search" && spotlightCardBody && !spotlightCardBody.hidden) {
      const rows = $$(".spotlight-item-row", spotlightListScroll);
      if (!rows.length) return;
      const curIdx = Math.max(0, rows.findIndex((r) => r.dataset.app === spotlightSelectedApp?.id));
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(rows.length - 1, curIdx + 1);
        const app = APPS.find((a) => a.id === rows[next].dataset.app);
        if (app) selectSpotlightApp(app, true);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = Math.max(0, curIdx - 1);
        const app = APPS.find((a) => a.id === rows[prev].dataset.app);
        if (app) selectSpotlightApp(app, true);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (spotlightSelectedApp) launchFeedback(spotlightSelectedApp.name);
      }
    } else if (launcher.dataset.mode === "library") {
      const tiles = $$(".app-tile", libraryMainGrid);
      if (!tiles.length) return;
      const curIdx = Math.max(0, tiles.findIndex((t) => t.dataset.app === librarySelectedApp?.id));
      const cols = window.innerWidth <= 760 ? 4 : 7;
      let target;
      if (e.key === "ArrowRight") target = Math.min(tiles.length - 1, curIdx + 1);
      else if (e.key === "ArrowLeft") target = Math.max(0, curIdx - 1);
      else if (e.key === "ArrowDown") target = Math.min(tiles.length - 1, curIdx + cols);
      else if (e.key === "ArrowUp") target = Math.max(0, curIdx - cols);
      if (target !== undefined && tiles[target]) {
        e.preventDefault();
        const app = APPS.find((a) => a.id === tiles[target].dataset.app);
        if (app) selectLibraryApp(app);
      }
    }
  });

  // Initial render
  renderLibraryGrid();
  renderSpotlightResults();


  const spotlight = $(".spotlight-demo");
  const spotlightQuery = $("#spotlight-query");
  const resultContainer = $("#spotlight-results");
  const resultRows = $$(".result-row", resultContainer);
  const languageButtons = $$(".search-language-switch button");
  let spotlightComposing = false;
  let resultSelection = resultRows[0];
  let animationTimer;

  function selectResult(row) {
    resultSelection = row || null;
    resultRows.forEach((item) => {
      const selected = item === resultSelection;
      item.classList.toggle("is-selected", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    $(".spotlight-match").textContent = resultSelection?.dataset.resultName || "";
    $(".spotlight-match").hidden = !resultSelection;
  }
  function filterResults(animate = false) {
    const query = normalize(spotlightQuery.value);
    resultRows.forEach((row) => { row.hidden = !matches(row.dataset.search, query); });
    const visible = resultRows.filter((row) => !row.hidden);
    resultContainer.hidden = !visible.length;
    $(".spotlight-empty").hidden = !!visible.length;
    $(".spotlight-count").textContent = `${visible.length} 个结果`;
    selectResult(visible[0]);
    languageButtons.forEach((button) => {
      const selected = normalize(button.dataset.example) === query;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    if (animate) {
      spotlight.classList.remove("is-changing");
      void spotlight.offsetWidth;
      spotlight.classList.add("is-changing");
      clearTimeout(animationTimer);
      animationTimer = setTimeout(() => spotlight.classList.remove("is-changing"), 320);
    }
  }
  spotlightQuery.addEventListener("compositionstart", () => { spotlightComposing = true; });
  spotlightQuery.addEventListener("compositionend", () => { spotlightComposing = false; filterResults(); });
  spotlightQuery.addEventListener("input", (event) => {
    if (!spotlightComposing && !event.isComposing) filterResults();
  });
  languageButtons.forEach((button) => button.addEventListener("click", () => {
    spotlightQuery.value = button.dataset.example;
    filterResults(true);
  }));
  resultRows.forEach((row) => row.addEventListener("click", () => selectResult(row)));
  spotlight.addEventListener("keydown", (event) => {
    if (spotlightComposing || event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target !== spotlightQuery && !event.target.classList.contains("result-row")) return;
    const visible = resultRows.filter((row) => !row.hidden);
    if (event.key === "Escape") {
      event.preventDefault();
      spotlightQuery.value = "";
      filterResults();
      spotlightQuery.focus({ preventScroll: true });
      return;
    }
    const index = Math.max(0, visible.indexOf(resultSelection));
    let next;
    if (event.key === "ArrowDown") next = Math.min(visible.length - 1, index + 1);
    if (event.key === "ArrowUp") next = Math.max(0, index - 1);
    if (next !== undefined && visible[next]) {
      event.preventDefault();
      selectResult(visible[next]);
      if (event.target !== spotlightQuery) visible[next].focus({ preventScroll: true });
    }
    if (event.target === spotlightQuery && event.key === "Enter" && resultSelection) {
      event.preventDefault();
      resultSelection.focus({ preventScroll: true });
    }
  });

  const materialDemo = $(".material-demo");
  const materialRange = $("#material-opacity");
  const themeButtons = $$(".theme-switch button");
  themeButtons.forEach((button) => button.addEventListener("click", () => {
    materialDemo.dataset.demoTheme = button.dataset.theme;
    themeButtons.forEach((item) => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
  }));
  materialRange.addEventListener("input", () => {
    const value = Number(materialRange.value);
    materialDemo.style.setProperty("--panel-alpha", String(1 - value / 100));
    $("#opacity-value").value = `${value}%`;
  });
  const wallpaperButtons = $$(".wallpaper-swatch");
  const appearanceImage = $(".appearance-wallpaper");
  wallpaperButtons.forEach((button) => button.addEventListener("click", () => {
    const wallpaper = button.dataset.wallpaper;
    appearanceImage.src = `./assets/${wallpaper}.jpg`;
    $(".appearance-stage").dataset.wallpaper = wallpaper;
    wallpaperButtons.forEach((item) => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
  }));

  window.addEventListener("pagehide", () => clearTimeout(animationTimer));
})();
