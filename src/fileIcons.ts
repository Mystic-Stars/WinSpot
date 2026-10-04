import defaultFile from "@iconify-icons/vscode-icons/default-file";
import defaultFolder from "@iconify-icons/vscode-icons/default-folder";
import audio from "@iconify-icons/vscode-icons/file-type-audio";
import archive from "@iconify-icons/vscode-icons/file-type-zip";
import binary from "@iconify-icons/vscode-icons/file-type-binary";
import blender from "@iconify-icons/vscode-icons/file-type-blender";
import c from "@iconify-icons/vscode-icons/file-type-c";
import certificate from "@iconify-icons/vscode-icons/file-type-cert";
import config from "@iconify-icons/vscode-icons/file-type-config";
import configDark from "@iconify-icons/vscode-icons/file-type-light-config";
import cpp from "@iconify-icons/vscode-icons/file-type-cpp";
import csharp from "@iconify-icons/vscode-icons/file-type-csharp";
import css from "@iconify-icons/vscode-icons/file-type-css";
import csv from "@iconify-icons/vscode-icons/file-type-csv";
import database from "@iconify-icons/vscode-icons/file-type-db";
import docker from "@iconify-icons/vscode-icons/file-type-docker";
import ebook from "@iconify-icons/vscode-icons/file-type-epub";
import excel from "@iconify-icons/vscode-icons/file-type-excel";
import font from "@iconify-icons/vscode-icons/file-type-font";
import fontDark from "@iconify-icons/vscode-icons/file-type-light-font";
import git from "@iconify-icons/vscode-icons/file-type-git";
import go from "@iconify-icons/vscode-icons/file-type-go";
import html from "@iconify-icons/vscode-icons/file-type-html";
import illustrator from "@iconify-icons/vscode-icons/file-type-ai";
import image from "@iconify-icons/vscode-icons/file-type-image";
import java from "@iconify-icons/vscode-icons/file-type-java";
import javascript from "@iconify-icons/vscode-icons/file-type-js-official";
import json from "@iconify-icons/vscode-icons/file-type-json";
import kotlin from "@iconify-icons/vscode-icons/file-type-kotlin";
import license from "@iconify-icons/vscode-icons/file-type-license";
import log from "@iconify-icons/vscode-icons/file-type-log";
import lua from "@iconify-icons/vscode-icons/file-type-lua";
import markdown from "@iconify-icons/vscode-icons/file-type-markdown";
import npm from "@iconify-icons/vscode-icons/file-type-npm";
import outlook from "@iconify-icons/vscode-icons/file-type-outlook";
import pdf from "@iconify-icons/vscode-icons/file-type-pdf2";
import photoshop from "@iconify-icons/vscode-icons/file-type-photoshop";
import php from "@iconify-icons/vscode-icons/file-type-php";
import powerpoint from "@iconify-icons/vscode-icons/file-type-powerpoint";
import powershell from "@iconify-icons/vscode-icons/file-type-powershell";
import python from "@iconify-icons/vscode-icons/file-type-python";
import react from "@iconify-icons/vscode-icons/file-type-reactjs";
import ruby from "@iconify-icons/vscode-icons/file-type-ruby";
import rust from "@iconify-icons/vscode-icons/file-type-rust";
import rustDark from "@iconify-icons/vscode-icons/file-type-light-rust";
import sass from "@iconify-icons/vscode-icons/file-type-sass";
import shell from "@iconify-icons/vscode-icons/file-type-shell";
import shortcut from "@iconify-icons/vscode-icons/file-type-lnk";
import sketch from "@iconify-icons/vscode-icons/file-type-sketch";
import sql from "@iconify-icons/vscode-icons/file-type-sql";
import svelte from "@iconify-icons/vscode-icons/file-type-svelte";
import svg from "@iconify-icons/vscode-icons/file-type-svg";
import swift from "@iconify-icons/vscode-icons/file-type-swift";
import text from "@iconify-icons/vscode-icons/file-type-text";
import typescript from "@iconify-icons/vscode-icons/file-type-typescript-official";
import video from "@iconify-icons/vscode-icons/file-type-video";
import vue from "@iconify-icons/vscode-icons/file-type-vue";
import word from "@iconify-icons/vscode-icons/file-type-word";
import xml from "@iconify-icons/vscode-icons/file-type-xml";
import yaml from "@iconify-icons/vscode-icons/file-type-yaml";
import type { FileResult } from "./types";

type IconData = typeof defaultFile;

interface FileAppearance {
  src: string;
  darkSrc?: string;
  label: string;
}

function iconSource(icon: IconData): string {
  const width = icon.width ?? 32;
  const height = icon.height ?? 32;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${icon.body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function appearance(icon: IconData, label: string, darkIcon?: IconData): FileAppearance {
  return { src: iconSource(icon), label, darkSrc: darkIcon ? iconSource(darkIcon) : undefined };
}

const fileTypes = new Map<string, FileAppearance>();

function register(icon: IconData, label: string, extensions: string[], darkIcon?: IconData) {
  const type = appearance(icon, label, darkIcon);
  for (const extension of extensions) fileTypes.set(extension, type);
  return type;
}

const folderType = appearance(defaultFolder, "文件夹");
const unknownType = appearance(defaultFile, "文件");
const configType = register(config, "配置文件", ["ini", "cfg", "conf", "config", "toml", "env", "properties", "editorconfig"], configDark);
const markdownType = register(markdown, "Markdown 文档", ["md", "markdown", "mdx"]);
const npmType = appearance(npm, "Node.js 配置");
const gitType = appearance(git, "Git 配置");
const dockerType = appearance(docker, "Docker 配置");
const licenseType = appearance(license, "许可文件");

register(pdf, "PDF 文档", ["pdf"]);
register(word, "Word 文档", ["doc", "docx", "docm", "dot", "dotx", "dotm", "odt", "rtf"]);
register(excel, "电子表格", ["xls", "xlsx", "xlsm", "xlsb", "xlt", "xltx", "ods", "numbers"]);
register(csv, "数据表格", ["csv", "tsv"]);
register(powerpoint, "演示文稿", ["ppt", "pptx", "pptm", "pps", "ppsx", "pot", "potx", "odp", "key"]);
register(ebook, "电子书", ["epub", "mobi", "azw", "azw3", "fb2"]);
register(text, "文本文件", ["txt", "text", "nfo", "srt", "ass", "vtt", "tex"]);
register(log, "日志文件", ["log"]);
register(image, "图片", ["png", "jpg", "jpeg", "jpe", "jfif", "gif", "bmp", "dib", "tif", "tiff", "webp", "avif", "heic", "heif", "ico", "apng", "raw", "dng", "cr2", "cr3", "nef", "arw"]);
register(svg, "矢量图片", ["svg", "svgz"]);
register(photoshop, "Photoshop 文档", ["psd", "psb"]);
register(illustrator, "Illustrator 文档", ["ai", "eps"]);
register(sketch, "设计文档", ["sketch", "fig", "xd", "afdesign", "afphoto", "afpub"]);
register(blender, "三维模型", ["blend", "fbx", "obj", "stl", "gltf", "glb", "3ds"]);
register(audio, "音频", ["mp3", "wav", "flac", "aac", "m4a", "ogg", "opus", "wma", "aiff", "aif", "mid", "midi"]);
register(video, "视频", ["mp4", "mkv", "mov", "avi", "wmv", "webm", "m4v", "mpg", "mpeg", "flv", "3gp", "mts", "m2ts"]);
register(archive, "压缩包", ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz", "zst", "cab", "iso", "img"]);
register(binary, "程序文件", ["exe", "msi", "msix", "msixbundle", "appx", "appxbundle", "dll", "sys", "bin", "dat", "wasm"]);
register(shortcut, "快捷方式", ["lnk", "url"]);
register(font, "字体", ["ttf", "otf", "ttc", "woff", "woff2", "eot"], fontDark);
register(database, "数据库", ["db", "sqlite", "sqlite3", "mdb", "accdb", "db3"]);
register(sql, "SQL 脚本", ["sql"]);
register(json, "JSON 数据", ["json", "jsonc", "json5", "jsonl", "ndjson", "ipynb"]);
register(yaml, "YAML 配置", ["yaml", "yml"]);
register(xml, "XML 文档", ["xml", "xaml", "xsd", "xsl", "plist", "manifest"]);
register(html, "网页", ["html", "htm", "xhtml"]);
register(css, "样式表", ["css"]);
register(sass, "样式表", ["sass", "scss", "less"]);
register(javascript, "JavaScript 代码", ["js", "mjs", "cjs"]);
register(typescript, "TypeScript 代码", ["ts", "mts", "cts"]);
register(react, "React 组件", ["jsx", "tsx"]);
register(vue, "Vue 组件", ["vue"]);
register(svelte, "Svelte 组件", ["svelte"]);
register(python, "Python 代码", ["py", "pyw", "pyi", "pyc"]);
register(rust, "Rust 代码", ["rs"], rustDark);
register(c, "C 代码", ["c", "h"]);
register(cpp, "C++ 代码", ["cpp", "cc", "cxx", "hpp", "hxx", "hh"]);
register(csharp, "C# 代码", ["cs", "csx"]);
register(java, "Java 代码", ["java", "class", "jar"]);
register(kotlin, "Kotlin 代码", ["kt", "kts"]);
register(go, "Go 代码", ["go"]);
register(php, "PHP 代码", ["php", "phtml"]);
register(ruby, "Ruby 代码", ["rb", "erb"]);
register(swift, "Swift 代码", ["swift"]);
register(lua, "Lua 代码", ["lua"]);
register(powershell, "PowerShell 脚本", ["ps1", "psm1", "psd1"]);
register(shell, "命令脚本", ["sh", "bash", "zsh", "fish", "bat", "cmd"]);
register(outlook, "邮件", ["eml", "msg", "pst", "ost"]);
register(certificate, "证书", ["crt", "cer", "pem", "pfx", "p12", "der"]);

const namedTypes = new Map<string, FileAppearance>([
  ["package.json", npmType],
  ["package-lock.json", npmType],
  ["pnpm-lock.yaml", npmType],
  ["yarn.lock", npmType],
  [".gitignore", gitType],
  [".gitattributes", gitType],
  [".gitmodules", gitType],
  ["dockerfile", dockerType],
  ["docker-compose.yml", dockerType],
  ["docker-compose.yaml", dockerType],
  ["compose.yml", dockerType],
  ["compose.yaml", dockerType],
  ["license", licenseType],
  ["license.txt", licenseType],
  ["license.md", licenseType],
  ["copying", licenseType],
  ["readme", markdownType],
  [".env", configType],
  [".editorconfig", configType],
]);

export function fileAppearance(file: FileResult): FileAppearance {
  if (file.kind === "directory") return folderType;
  const name = file.name.toLowerCase();
  const namedType = namedTypes.get(name);
  if (namedType) return namedType;
  if (name.startsWith(".env.")) return configType;
  return fileTypes.get(file.extension?.toLowerCase() ?? "") ?? unknownType;
}

export function fileTypeLabel(file: FileResult): string {
  const type = fileAppearance(file);
  if (file.kind === "directory" || !file.extension) return type.label;
  return `${file.extension.toUpperCase()} · ${type.label}`;
}
