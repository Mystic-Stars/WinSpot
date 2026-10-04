import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "../../node_modules/typescript/lib/typescript.js";

const website = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(website, "..");
const assets = path.join(website, "assets");
const iconNames = [
  "arrow-left", "arrow-right", "arrow-up-right", "arrow-down", "check", "chevron-right",
  "code-xml", "command", "download", "ellipsis", "folder-open", "github", "grid-2x2",
  "hard-drive", "menu", "moon", "pin", "plus", "search", "shield-check",
  "sliders-horizontal", "sun", "x",
];

function literal(node) {
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) {
    return Object.fromEntries(node.properties.map((property) => {
      if (!ts.isPropertyAssignment(property)) throw new Error("Unexpected icon property");
      return [property.name.text, literal(property.initializer)];
    }));
  }
  throw new Error("Unexpected icon data");
}

function escape(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

const icons = {};
for (const name of iconNames) {
  const filename = path.join(root, "node_modules/lucide-solid/dist/esm/icons", `${name}.js`);
  const source = ts.createSourceFile(filename, await fs.readFile(filename, "utf8"), ts.ScriptTarget.Latest);
  let data;
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText(source) === "iconNode") data = literal(declaration.initializer);
    }
  }
  if (!data) throw new Error(`Missing icon: ${name}`);
  const body = data.map(([tag, attributes]) => {
    const attrs = Object.entries(attributes).filter(([key]) => key !== "key")
      .map(([key, value]) => `${key}="${escape(value)}"`).join(" ");
    return `<${tag} ${attrs}/>`;
  }).join("");
  icons[name] = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

icons["win11"] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="8.2" height="8.2" rx="1.2" fill="currentColor"/><rect x="12.8" y="3" width="8.2" height="8.2" rx="1.2" fill="currentColor"/><rect x="3" y="12.8" width="8.2" height="8.2" rx="1.2" fill="currentColor"/><rect x="12.8" y="12.8" width="8.2" height="8.2" rx="1.2" fill="currentColor"/></svg>`;

await fs.writeFile(path.join(assets, "icons.js"),
  `/* Lucide v0.468.0, ISC license. See THIRD_PARTY_NOTICES.md. */\nwindow.WinSpotIcons = ${JSON.stringify(icons, null, 2)};\n`);

for (const [filename, iconName] of [
  ["word", "file-type-word"],
  ["excel", "file-type-excel"],
  ["folder", "default-folder"],
  ["powerpoint", "file-type-powerpoint"],
  ["onenote", "file-type-onenote"],
  ["terminal", "file-type-powershell2"],
]) {
  const group = iconName.startsWith("default") ? "d" : "f";
  const modulePath = path.join(root, "node_modules/@iconify-icons/vscode-icons/data", group, `${iconName}.js`);
  const { default: icon } = await import(pathToFileURL(modulePath).href);
  await fs.writeFile(path.join(assets, `${filename}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" width="${icon.width}" height="${icon.height}" viewBox="0 0 ${icon.width} ${icon.height}">${icon.body}</svg>\n`);
}
console.log("Prepared local Lucide and VS Code Icons assets.");
