/// <reference lib="webworker" />
import sqlite3InitModule, { type Database, type SAHPoolUtil, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';

import type { ResultRow, SqlValue, WorkerRequest, WorkerResponse } from './messages.js';

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

const DEFAULT_SAH_POOL_DIRECTORY = '.aztec-kv';
const SAH_POOL_VFS_NAME = 'aztec-kv-opfs';

let sqlite3: Sqlite3Static | undefined;
let pool: SAHPoolUtil | undefined;
let poolDirectory: string | undefined;
let db: Database | undefined;
let dbPath: string | undefined;

async function ensurePool(directory: string): Promise<SAHPoolUtil> {
  sqlite3 ??= await sqlite3InitModule();
  if (!pool) {
    poolDirectory = directory;
    pool = await sqlite3.installOpfsSAHPoolVfs({
      name: SAH_POOL_VFS_NAME,
      directory,
      initialCapacity: 8,
    });
  }
  return pool;
}

async function handleInit(dbName: string, ephemeral: boolean, directory?: string): Promise<void> {
  sqlite3 ??= await sqlite3InitModule();
  if (ephemeral) {
    db = new sqlite3.oo1.DB(':memory:', 'c');
  } else {
    const p = await ensurePool(directory ?? DEFAULT_SAH_POOL_DIRECTORY);
    dbPath = normalizeDbPath(dbName);
    db = new p.OpfsSAHPoolDb(dbPath);
  }
  runSql(SCHEMA_SQL);
}

function handleClose(): void {
  db?.close();
  db = undefined;
  dbPath = undefined;
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

async function handleDeleteDb(dbName: string): Promise<void> {
  const path = normalizeDbPath(dbName);
  if (db && dbPath === path) {
    db.close();
    db = undefined;
    dbPath = undefined;
  }
  const p = await ensurePool(poolDirectory ?? DEFAULT_SAH_POOL_DIRECTORY);
  try {
    p.unlink(path);
  } catch {
    // File may not exist; ignore.
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
        await handleInit(req.dbName, req.ephemeral, req.poolDirectory);
        return respond({ type: 'ok', id: req.id });
      case 'close':
        handleClose();
        return respond({ type: 'ok', id: req.id });
      case 'deleteDb':
        await handleDeleteDb(req.dbName);
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
    respond({ type: 'err', id: req.id, message });
  }
};
