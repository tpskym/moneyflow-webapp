import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const [index, app, worker] = await Promise.all([
  readFile(join(root, "index.html"), "utf8"),
  readFile(join(root, "app.js"), "utf8"),
  readFile(join(root, "sw.js"), "utf8"),
]);

function requiredVersion(source, pattern, label) {
  const match = source.match(pattern);
  if (!match) throw new Error(`Не найдена версия: ${label}`);
  return match[1];
}

const versions = [
  requiredVersion(index, /class="app-version">v(\d+)</, "отображаемая версия"),
  requiredVersion(index, /app\.js\?v=(\d+)/, "app.js в index.html"),
  requiredVersion(app, /sw\.js\?v=(\d+)/, "service worker в app.js"),
  requiredVersion(worker, /moneyflow-v(\d+)/, "кэш service worker"),
  requiredVersion(worker, /styles\.css\?v=(\d+)/, "styles.css в service worker"),
  requiredVersion(index, /vendor\/jsqr\/jsQR\.js\?v=(\d+)/, "jsQR в index.html"),
  requiredVersion(worker, /vendor\/jsqr\/jsQR\.js\?v=(\d+)/, "jsQR в service worker"),
  requiredVersion(worker, /app\.js\?v=(\d+)/, "app.js в service worker"),
];

if (new Set(versions).size !== 1) {
  throw new Error(`Версии ресурсов не совпадают: ${versions.join(", ")}`);
}
