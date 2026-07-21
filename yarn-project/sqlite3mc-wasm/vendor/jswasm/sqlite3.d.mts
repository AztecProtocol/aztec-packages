// Type declaration for the sqlite3mc ES module.
// sqlite3mc is API-compatible with @sqlite.org/sqlite-wasm, so we reuse its
// Sqlite3Static type directly.
import type { Sqlite3Static } from '@sqlite.org/sqlite-wasm';

declare function sqlite3InitModule(opts?: Record<string, unknown>): Promise<Sqlite3Static>;
export default sqlite3InitModule;
