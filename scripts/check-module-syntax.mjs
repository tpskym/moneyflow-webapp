import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import vm from "node:vm";

const root = process.cwd();
const modules = new Map();

async function collectModules(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectModules(path);
    return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
  }));
  return nested.flat();
}

async function getModule(file) {
  const identifier = resolve(file);
  if (modules.has(identifier)) return modules.get(identifier);
  const module = new vm.SourceTextModule(await readFile(identifier, "utf8"), { identifier });
  modules.set(identifier, module);
  return module;
}

const files = [join(root, "app.js"), ...await collectModules(join(root, "modules"))];
await Promise.all(files.map(getModule));

const appModule = await getModule(join(root, "app.js"));
await appModule.link(async (specifier, parent) => {
  if (!specifier.startsWith(".")) {
    throw new Error(`Unsupported module import: ${specifier}`);
  }
  return getModule(resolve(dirname(parent.identifier), specifier));
});
