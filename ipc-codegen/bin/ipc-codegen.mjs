#!/usr/bin/env node
// The generator is written in erasable TypeScript, so a checkout runs src/ directly under Node's type
// stripping. Node refuses to strip types under node_modules, so the published package carries dist/
// instead: the same modules with their types removed (scripts/build_dist.mjs, run on pack).
const entry = import.meta.url.includes("/node_modules/") ? "../dist/generate.js" : "../src/generate.ts";
await import(new URL(entry, import.meta.url).href);
