/**
 * RPC protocol between the main thread and the SQLite worker.
 * All requests carry a unique `id`; responses echo the same id so the main thread
 * can resolve the right pending promise.
 */
import type { SqliteEncryptionErrorCode } from './errors.js';

/** Matches `@sqlite.org/sqlite-wasm`'s internal SqlValue type. Boolean is not a native SQLite type. */
export type SqlValue = string | number | bigint | null | Uint8Array;

/** A row returned in 'array' rowMode — one value per column, in select order. */
export type ResultRow = SqlValue[];

export type WorkerRequest =
  | { type: 'init'; id: number; dbName: string; ephemeral: boolean; poolDirectory?: string; encryptionKey?: Uint8Array }
  | { type: 'close'; id: number }
  | { type: 'deleteDb'; id: number; dbName: string }
  | { type: 'run'; id: number; sql: string; bind?: SqlValue[] }
  | { type: 'all'; id: number; sql: string; bind?: SqlValue[] }
  | { type: 'export'; id: number }
  | { type: 'begin'; id: number }
  | { type: 'commit'; id: number }
  | { type: 'rollback'; id: number };

export type WorkerResponse =
  | { type: 'ok'; id: number; rows?: ResultRow[]; changes?: number; bytes?: Uint8Array }
  | {
      type: 'err';
      id: number;
      message: string;
      /**
       * Set when the worker detected an encryption-shaped failure. The main thread
       * uses this to re-throw the error as a {@link SqliteEncryptionError} with the
       * matching code. Absent on non-encryption failures (untyped paths preserved).
       */
      encryptionCode?: SqliteEncryptionErrorCode;
    };

export type WorkerRequestType = WorkerRequest['type'];
