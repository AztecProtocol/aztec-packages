/**
 * Recommended browser KV-store backend.
 *
 * Re-exports the SQLite-OPFS backend: durable, encryption-at-rest capable, backed by SQLite over the Origin
 * Private File System.
 */
export {
  AztecSQLiteOPFSStore,
  SqliteEncryptionError,
  createStore,
  openEncryptedStore,
  openTmpStore,
} from '../sqlite-opfs/index.js';
export type { SqliteEncryptionErrorCode } from '../sqlite-opfs/index.js';
