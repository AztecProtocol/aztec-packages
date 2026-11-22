#!/usr/bin/env node
// Writes dist/: src/*.ts with their types removed by Node's own stripTypeScriptTypes and their relative
// imports pointed at the .js files, so the published package runs from node_modules, where Node will
// not strip types itself. No dependencies and no transform beyond erasing types.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

const src = new URL("../src/", import.meta.url);
const dist = new URL("../dist/", import.meta.url);
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
for (const name of readdirSync(src)) {
  if (!name.endsWith(".ts")) continue;
  const code = stripTypeScriptTypes(readFileSync(new URL(name, src), "utf-8"), { mode: "strip" });
  const js = code.replace(/(from\s+["']\.\.?\/[^"']+)\.ts(["'])/g, "$1.js$2");
  writeFileSync(new URL(name.replace(/\.ts$/, ".js"), dist), js);
}
