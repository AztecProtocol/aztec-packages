/**
 * Re-exports sqlite3mc's ES module default (sqlite3InitModule) and the TypeScript types expected by downstream
 * consumers. Mirrors the `@sqlite.org/sqlite-wasm` package default export — sqlite3mc is a strict API-compatible
 * superset, so upstream types apply unchanged.
 */
export { default } from '../vendor/jswasm/sqlite3.mjs';
export type { Database, SAHPoolUtil, Sqlite3Static } from '@sqlite.org/sqlite-wasm';
