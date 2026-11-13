import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../../", import.meta.url));

export function sourceLoader(stubs = {}) {
  const cache = new Map();
  function load(relative) {
    const file = path.resolve(root, relative);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const source = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    new Function("require", "module", "exports", source)(
      (id) => {
        if (id in stubs) return stubs[id];
        if (id.startsWith("@/")) return load(`src/${id.slice(2)}.ts`);
        if (id.startsWith("."))
          return load(path.resolve(path.dirname(file), `${id}.ts`));
        return require(id);
      },
      module,
      module.exports,
    );
    return module.exports;
  }
  return load;
}
