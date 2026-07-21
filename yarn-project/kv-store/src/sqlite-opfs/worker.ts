/// <reference lib="webworker" />
import sqlite3InitModule, { type Database, type SAHPoolUtil, type Sqlite3Static } from '@aztec/sqlite3mc-wasm';

import { SqliteEncryptionError, type SqliteEncryptionErrorCode, isDecryptFailureMessage } from './errors.js';
import type { ResultRow, SqlValue, WorkerRequest, WorkerResponse } from './messages.js';
import { DEFAULT_SAH_POOL_DIRECTORY } from './pool_lock.js';

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS data (
    slot TEXT NOT NULL PRIMARY KEY,
    container TEXT NOT NULL,
    key BLOB NOT NULL,
    key_count INTEGER NOT NULL,
    hash TEXT NOT NULL,
    value BLOB
  ) WITHOUT ROWID;

  CREATE INDEX IF NOT EXISTS idx_container_key ON data(container, key);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_container_key_count ON data(container, key, key_count);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_container_key_hash ON data(container, key, hash);
`;

const SAH_POOL_VFS_NAME = 'aztec-kv-opfs';
const MC_SAH_POOL_VFS_NAME = `multipleciphers-${SAH_POOL_VFS_NAME}`;

let sqlite3: Sqlite3Static | undefined;
let pool: SAHPoolUtil | undefined;
let db: Database | undefined;
let dbPath: string | undefined;

async function ensurePool(directory: string): Promise<SAHPoolUtil> {
  const s = (sqlite3 ??= await sqlite3InitModule());
  if (!pool) {
    pool = await s.installOpfsSAHPoolVfs({
      name: SAH_POOL_VFS_NAME,
      directory,
      initialCapacity: 8,
    });
    // Register a sqlite3mc-wrapped VFS pointing at our SAH Pool VFS.
    // Encrypted DBs must be opened through this wrapper so sqlite3mc can
    // intercept file I/O; plain DBs continue using the SAH Pool VFS directly.
    // The wrapper name is `multipleciphers-<underlying>`.
    (s.capi as unknown as { sqlite3mc_vfs_create(name: string, makeDefault: number): number }).sqlite3mc_vfs_create(
      SAH_POOL_VFS_NAME,
      0,
    );
  }
  return pool!;
}

/**
 * Applies sqlite3mc's ChaCha20 page cipher using a pre-derived 32-byte key.
 * The PRAGMAs must run before any schema DDL so sqlite3mc can decrypt existing
 * pages and encrypt new ones. Zeroes the caller-held key array after the PRAGMA
 * completes to minimize residency of the raw key bytes outside sqlite3mc's heap.
 */
function applyEncryptionKey(conn: Database, key: Uint8Array): void {
  const hex = Array.from(key, b => b.toString(16).padStart(2, '0')).join('');
  conn.exec(`PRAGMA cipher = 'chacha20'`);
  conn.exec(`PRAGMA key = "x'${hex}'"`);
  key.fill(0);
}

async function handleInit(
  dbName: string,
  ephemeral: boolean,
  directory?: string,
  encryptionKey?: Uint8Array,
): Promise<void> {
  const s = (sqlite3 ??= await sqlite3InitModule());
  if (encryptionKey !== undefined && ephemeral) {
    throw new SqliteEncryptionError(
      'encryption_not_supported_for_ephemeral',
      'encryptionKey is not supported for ephemeral (:memory:) stores',
    );
  }
  if (ephemeral) {
    db = new s.oo1.DB(':memory:', 'c');
  } else {
    const activePool = await ensurePool(directory ?? DEFAULT_SAH_POOL_DIRECTORY);
    dbPath = normalizeDbPath(dbName);
    if (encryptionKey !== undefined) {
      const conn = new s.oo1.DB({ filename: dbPath, flags: 'c', vfs: MC_SAH_POOL_VFS_NAME });
      db = conn;
      applyEncryptionKey(conn, encryptionKey);
    } else {
      db = new activePool.OpfsSAHPoolDb(dbPath);
    }
  }
  runSql(SCHEMA_SQL);
}

function handleClose(): void {
  try {
    db?.close();
  } finally {
    db = undefined;
    dbPath = undefined;
    releasePool();
  }
}

/**
 * Releases the SAH pool's OPFS sync access handles before the terminal RPC is acked. Worker
 * termination releases them only asynchronously, so without this a caller that deletes or reopens
 * the store directory right after close()/delete() resolves races Chromium's cleanup
 * (NoModificationAllowedError from removeEntry, or a hang installing a new pool on the directory).
 * pauseVfs releases the handles without touching file contents; the worker is terminated right
 * after, so the pool is never resumed.
 */
function releasePool(): void {
  pool?.pauseVfs();
  pool = undefined;
}

async function handleExport(): Promise<Uint8Array> {
  if (!db || !dbPath) {
    throw new Error('SQLite worker: no database open to export');
  }
  if (!pool) {
    throw new Error('SQLite worker: no SAH Pool available (ephemeral DBs cannot be exported)');
  }
  return await pool.exportFile(dbPath);
}

function handleDeleteDb(dbName: string): void {
  const path = normalizeDbPath(dbName);
  if (db && dbPath === path) {
    db.close();
    db = undefined;
    dbPath = undefined;
  }
  // Ephemeral :memory: DBs never back a file — skip installing a pool just to unlink
  // nothing. installOpfsSAHPoolVfs acquires an exclusive lock on the OPFS SAH
  // directory, and under heavy test churn that can contend with workers from
  // previous tests whose OPFS handles Chromium hasn't yet released, hanging the RPC
  // and then the whole test run.
  if (!pool) {
    return;
  }
  try {
    pool.unlink(path);
  } catch {
    // File may not exist; ignore.
  }
  // Guarded because pauseVfs refuses (SQLITE_MISUSE) while any file is open through the VFS.
  if (!db) {
    releasePool();
  }
}

function requireDb(): Database {
  if (!db) {
    throw new Error('SQLite worker: no database open');
  }
  return db;
}

function runSql(sql: string, bind?: SqlValue[]): { changes: number } {
  const conn = requireDb();
  conn.exec({ sql, bind });
  return { changes: conn.changes() };
}

function selectAll(sql: string, bind?: SqlValue[]): ResultRow[] {
  const conn = requireDb();
  const rows: ResultRow[] = [];
  conn.exec({ sql, bind, rowMode: 'array', resultRows: rows });
  return rows;
}

function normalizeDbPath(dbName: string): string {
  return dbName.startsWith('/') ? dbName : `/${dbName}`;
}

function respond(msg: WorkerResponse): void {
  (self as DedicatedWorkerGlobalScope).postMessage(msg);
}

(self as DedicatedWorkerGlobalScope).onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  try {
    switch (req.type) {
      case 'init':
        await handleInit(req.dbName, req.ephemeral, req.poolDirectory, req.encryptionKey);
        return respond({ type: 'ok', id: req.id });
      case 'close':
        handleClose();
        return respond({ type: 'ok', id: req.id });
      case 'deleteDb':
        handleDeleteDb(req.dbName);
        return respond({ type: 'ok', id: req.id });
      case 'run': {
        const { changes } = runSql(req.sql, req.bind);
        return respond({ type: 'ok', id: req.id, changes });
      }
      case 'all': {
        const rows = selectAll(req.sql, req.bind);
        return respond({ type: 'ok', id: req.id, rows });
      }
      case 'export': {
        const bytes = await handleExport();
        return respond({ type: 'ok', id: req.id, bytes });
      }
      case 'begin':
        runSql('BEGIN');
        return respond({ type: 'ok', id: req.id });
      case 'commit':
        runSql('COMMIT');
        return respond({ type: 'ok', id: req.id });
      case 'rollback':
        runSql('ROLLBACK');
        return respond({ type: 'ok', id: req.id });
      default: {
        const _exhaustive: never = req;
        throw new Error(`Unknown request: ${JSON.stringify(_exhaustive)}`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
<<<<<<< HEAD
    respond({ type: 'err', id: req.id, message, encryptionCode: detectEncryptionCode(req, err, message) });
=======
    const encryptionCode = detectEncryptionCode(req, err, message);
    if (req.type === 'init') {
      try {
        handleClose();
      } catch {
        // The main thread terminates this worker after a failed init, which releases any remaining OPFS handles.
      }
    }
    respond({ type: 'err', id: req.id, message, encryptionCode });
>>>>>>> origin/v5-next
  }
};

/**
 * Maps a thrown error during request handling to a typed encryption code, so the
 * main thread can re-hydrate it as a {@link SqliteEncryptionError}. Returns
 * `undefined` for non-encryption errors (preserves the existing untyped path).
 *
 * Two sources:
 *   - The error was already a `SqliteEncryptionError` (pre-flight throws inside
 *     this worker — e.g. ephemeral + encryptionKey). Forward its code as-is.
 *   - The error came from SQLite/sqlite3mc with a known decrypt-failure message
 *     during an `init` request. Both "wrong key supplied" and "no key supplied
 *     to an encrypted DB" surface as SQLITE_NOTADB ("file is not a database") —
 *     we don't constrain on `req.encryptionKey` because the no-key-on-encrypted-DB
 *     case is exactly when the caller most needs the typed signal.
 */
function detectEncryptionCode(
  req: WorkerRequest,
  err: unknown,
  message: string,
): SqliteEncryptionErrorCode | undefined {
  if (err instanceof SqliteEncryptionError) {
    return err.code;
  }
  if (req.type === 'init' && isDecryptFailureMessage(message)) {
    return 'decrypt_failed';
  }
  return undefined;
}
