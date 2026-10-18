// Runs a bb wasi command (a module that imports its memory) under Node's WASI, with `dir` preopened at /data.
// Usage: node run_wasi_command.mjs <wasm> <dir> [args...]
import { readFileSync } from "node:fs";
import { WASI } from "node:wasi";

const [wasmPath, dir, ...args] = process.argv.slice(2);
const module = await WebAssembly.compile(readFileSync(wasmPath));
const wasi = new WASI({ version: "preview1", args: [wasmPath, ...args], preopens: { "/data": dir }, returnOnExit: true });
const importObject = wasi.getImportObject();
const memory = new WebAssembly.Memory({ initial: 512, maximum: 65536 });
for (const { module: from, name, kind } of WebAssembly.Module.imports(module)) {
  if (kind === "memory") (importObject[from] ??= {})[name] = memory;
}
const instance = await WebAssembly.instantiate(module, importObject);
process.exitCode = wasi.start({ exports: { ...instance.exports, memory } });
