/**
 * Re-exports sqlite3mc's ES module default (sqlite3InitModule) and the TypeScript types expected by downstream
 * consumers. Mirrors the `@sqlite.org/sqlite-wasm` package default export — sqlite3mc is a strict API-compatible
 * superset, so upstream types apply unchanged.
<<<<<<< HEAD
 */
export { default } from '../vendor/jswasm/sqlite3.mjs';
=======
 *
 * BUNDLER COMPATIBILITY: SQLite3MultipleCiphers 2.3.5 stopped shipping the `-bundler-friendly` build variant, so
 * this entry re-exports the plain `sqlite3.mjs`. That loader always resolves `sqlite3.wasm` through its
 * `Module['locateFile']` hook, which computes `new URL(path, import.meta.url)` with a *dynamic* `path` — invisible
 * to bundlers, so bundled consumers request an unhashed `sqlite3.wasm` relative to the emitted chunk and 404 at
 * runtime (pre-2.3.5, the bundler-friendly variant carried a statically-analyzable reference instead). To stay
 * bundler-friendly we wrap the init and inject `emscriptenLocateFile` — the vendored loader's supported escape
 * hatch (`Module['locateFile']` defers to it when present on the init-module state) — resolving the wasm via a
 * static `new URL('…/sqlite3.wasm', import.meta.url)` that bundlers detect, emit, and rewrite. Unbundled usage is
 * unaffected: the static URL resolves to the real vendored path.
 */
import sqlite3InitModuleUnwrapped from '../vendor/jswasm/sqlite3.mjs';

/** Statically analyzable wasm reference: bundlers emit the asset and rewrite this URL to its final location. */
const SQLITE3_WASM_URL = new URL('../vendor/jswasm/sqlite3.wasm', import.meta.url);

type SqliteInitModuleState = {
  emscriptenLocateFile?: (path: string, prefix: string) => string;
  debugModule?: (...args: unknown[]) => void;
};

const sqlite3InitModule: typeof sqlite3InitModuleUnwrapped = (...args) => {
  // `sqlite3.mjs` creates `globalThis.sqlite3InitModuleState` at import time and the inner Emscripten factory
  // captures it (and deletes the global) on init, binding it as `this` of `Module['locateFile']`. Mutate the live
  // object; recreate it if a previous init already consumed it (`debugModule` must exist — the factory calls it).
  const g = globalThis as { sqlite3InitModuleState?: SqliteInitModuleState };
  const state = (g.sqlite3InitModuleState ??= Object.assign(Object.create(null), {
    debugModule: () => {},
  }));
  state.emscriptenLocateFile = (path: string, prefix: string) =>
    path === 'sqlite3.wasm' ? SQLITE3_WASM_URL.href : new URL(path, prefix || import.meta.url).href;
  return sqlite3InitModuleUnwrapped(...args);
};

export default sqlite3InitModule;
>>>>>>> origin/v5-next
export type { Database, SAHPoolUtil, Sqlite3Static } from '@sqlite.org/sqlite-wasm';
