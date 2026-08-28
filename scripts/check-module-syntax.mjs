import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import vm from "node:vm";

const root = process.cwd();

async function collectModules(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectModules(path);
    return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
  }));
  return nested.flat();
}

for (const file of [join(root, "app.js"), ...await collectModules(join(root, "modules"))]) {
  new vm.SourceTextModule(await readFile(file, "utf8"), { identifier: file });
}
