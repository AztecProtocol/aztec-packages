/**
 * Recommended browser KV-store backend.
 *
 * Re-exports the SQLite-OPFS backend: durable, encryption-at-rest capable, backed by SQLite over the Origin
 * Private File System. Import from here when you want "the browser backend" without picking one explicitly.
 * The legacy IndexedDB backend lives at `@aztec/kv-store/deprecated/indexeddb` and must not be used in new code.
 */
export {
  AztecSQLiteOPFSStore,
  SqliteEncryptionError,
  createStore,
  openEncryptedStore,
  openTmpStore,
} from '../sqlite-opfs/index.js';
export type { SqliteEncryptionErrorCode } from '../sqlite-opfs/index.js';
