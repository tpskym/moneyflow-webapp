import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const appLimit = 3691;
const moduleLimit = 400;

async function collectJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScriptFiles(file);
    return entry.isFile() && entry.name.endsWith(".js") ? [file] : [];
  }));
  return nested.flat();
}

async function lineCount(file) {
  return (await readFile(file, "utf8")).split(/\r?\n/).length - 1;
}

const failures = [];
const appLines = await lineCount(join(root, "app.js"));
if (appLines > appLimit) failures.push(`app.js: ${appLines} строк, максимум ${appLimit}`);

const moduleFiles = await collectJavaScriptFiles(join(root, "modules"));
for (const file of moduleFiles) {
  const lines = await lineCount(file);
  if (lines > moduleLimit) failures.push(`${relative(root, file)}: ${lines} строк, максимум ${moduleLimit}`);
}

if (failures.length) {
  console.error("Превышен лимит размера файлов:\n" + failures.join("\n"));
  process.exit(1);
}
