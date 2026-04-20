import type { Logger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';

import type { AztecAsyncArray } from '../interfaces/array.js';
import type { Key, StoreSize, Value } from '../interfaces/common.js';
import type { AztecAsyncCounter } from '../interfaces/counter.js';
import type { AztecAsyncMap } from '../interfaces/map.js';
import type { AztecAsyncMultiMap } from '../interfaces/multi_map.js';
import type { AztecAsyncSet } from '../interfaces/set.js';
import type { AztecAsyncSingleton } from '../interfaces/singleton.js';
import type { AztecAsyncKVStore } from '../interfaces/store.js';
import { SQLiteOPFSAztecArray } from './array.js';
import { SQLiteOPFSAztecMap } from './map.js';
import type { ResultRow, SqlValue, WorkerRequest, WorkerResponse } from './messages.js';
import { SQLiteOPFSAztecMultiMap } from './multi_map.js';
import { SQLiteOPFSAztecSet } from './set.js';
import { SQLiteOPFSAztecSingleton } from './singleton.js';

/**
 * Main-thread handle for a SQLite database persisted to OPFS via the `opfs-sahpool`
 * VFS. Owns a dedicated Web Worker (the SAH Pool VFS requires Worker context) and
 * routes every SQL op through it via typed postMessage RPC.
 *
 * Transaction ordering is guaranteed by a `SerialQueue` on the main thread combined
 * with an `#inTx` flag: outside a `transactionAsync` block, each op acquires the
 * queue for its own auto-commit; inside a block, the outer call holds the queue and
 * nested ops bypass it to avoid deadlock.
 */
export class AztecSQLiteOPFSStore implements AztecAsyncKVStore {
  readonly #worker: Worker;
  readonly #pending = new Map<number, { resolve: (r: WorkerResponse) => void; reject: (err: Error) => void }>();
  readonly #txQueue = new SerialQueue();
  readonly #name: string;
  readonly #log: Logger;
  #nextId = 0;
  #inTx = false;
  #closed = false;

  private constructor(
    worker: Worker,
    name: string,
    log: Logger,
    public readonly isEphemeral: boolean,
  ) {
    this.#worker = worker;
    this.#name = name;
    this.#log = log;
    this.#worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const { id } = ev.data;
      const handler = this.#pending.get(id);
      if (!handler) {
        this.#log.warn(`SQLite worker: no pending handler for id ${id}`);
        return;
      }
      this.#pending.delete(id);
      handler.resolve(ev.data);
    };
    this.#worker.onerror = ev => {
      this.#log.error(`SQLite worker crashed: ${ev.message}`);
      this.#rejectPending(`SQLite worker crashed: ${ev.message}`);
    };
    this.#txQueue.start();
  }

  /**
   * Opens (or creates) a SQLite database stored in the OPFS SAH Pool. When `ephemeral`
   * is true the database lives only in memory and is lost when the worker terminates.
   * Pass `poolDirectory` to place the SAH Pool in a non-default OPFS subdirectory —
   * required when multiple stores coexist in the same tab, because the SAH Pool holds
   * an exclusive lock on its directory.
   */
  static async open(
    log: Logger,
    name?: string,
    ephemeral: boolean = false,
    poolDirectory?: string,
  ): Promise<AztecSQLiteOPFSStore> {
    const dbName = name && !ephemeral ? name : `tmp-${globalThis.crypto.getRandomValues(new Uint8Array(8)).join('')}`;
    log.debug(`Opening SQLite-OPFS ${ephemeral ? 'ephemeral ' : ''}database ${dbName}`);
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    const store = new AztecSQLiteOPFSStore(worker, dbName, log, ephemeral);
    await store.#sendRequest({ type: 'init', id: store.#allocId(), dbName, ephemeral, poolDirectory });
    return store;
  }

  openMap<K extends Key, V extends Value>(name: string): AztecAsyncMap<K, V> {
    return new SQLiteOPFSAztecMap<K, V>(this, name);
  }

  openSet<K extends Key>(name: string): AztecAsyncSet<K> {
    return new SQLiteOPFSAztecSet<K>(this, name);
  }

  openMultiMap<K extends Key, V extends Value>(name: string): AztecAsyncMultiMap<K, V> {
    return new SQLiteOPFSAztecMultiMap<K, V>(this, name);
  }

  openCounter<K extends Key>(_name: string): AztecAsyncCounter<K> {
    throw new Error('Method not implemented.');
  }

  openArray<T extends Value>(name: string): AztecAsyncArray<T> {
    return new SQLiteOPFSAztecArray<T>(this, name);
  }

  openSingleton<T extends Value>(name: string): AztecAsyncSingleton<T> {
    return new SQLiteOPFSAztecSingleton<T>(this, name);
  }

  transactionAsync<T>(callback: () => Promise<T>): Promise<T> {
    // Nested calls join the outer transaction — SQLite does not support nested BEGIN,
    // and re-acquiring the SerialQueue while the outer call holds it would deadlock.
    // Errors in the nested callback propagate to the outer catch, which rolls back the
    // whole thing (the standard "nested tx = savepoint-free join" semantic).
    if (this.#inTx) {
      return callback();
    }
    return this.#txQueue.put(async () => {
      this.#inTx = true;
      await this.#sendRequest({ type: 'begin', id: this.#allocId() });
      try {
        const result = await callback();
        await this.#sendRequest({ type: 'commit', id: this.#allocId() });
        return result;
      } catch (err) {
        await this.#sendRequest({ type: 'rollback', id: this.#allocId() }).catch(rollbackErr =>
          this.#log.warn(`SQLite ROLLBACK failed: ${rollbackErr instanceof Error ? rollbackErr.message : rollbackErr}`),
        );
        throw err;
      } finally {
        this.#inTx = false;
      }
    });
  }

  async clear(): Promise<void> {
    await this.runAsync('DELETE FROM data');
  }

  async delete(): Promise<void> {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    await this.#txQueue.end();
    await this.#sendRequest({ type: 'deleteDb', id: this.#allocId(), dbName: this.#name }).catch(err =>
      this.#log.warn(`SQLite deleteDb failed: ${err instanceof Error ? err.message : err}`),
    );
    this.#worker.terminate();
    this.#rejectPending('SQLite store deleted');
  }

  /**
   * Placeholder — returns zeros to mirror the IndexedDB backend. SQLite exposes real
   * numbers cheaply via `PRAGMA page_count` / `page_size` / `freelist_count` and
   * `SELECT COUNT(*) FROM data`, which would populate `physicalFileSize`, `actualSize`,
   * and `numItems` meaningfully (`mappingSize` stays 0 — it's an LMDB mmap concept).
   * Upgrade when any caller actually consumes these values; all current consumers
   * tolerate zeros.
   */
  estimateSize(): Promise<StoreSize> {
    return Promise.resolve({ mappingSize: 0, physicalFileSize: 0, actualSize: 0, numItems: 0 });
  }

  async close(): Promise<void> {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    await this.#txQueue.end();
    await this.#sendRequest({ type: 'close', id: this.#allocId() }).catch(() => {});
    this.#worker.terminate();
    this.#rejectPending('SQLite store closed');
  }

  backupTo(_dstPath: string, _compact?: boolean): Promise<void> {
    throw new Error('Method not implemented.');
  }

  /**
   * Returns a raw SQLite image (bytes suitable for writing as a `.sqlite` file and
   * opening in any SQLite tool). Works only for non-ephemeral DBs because the OPFS
   * SAH Pool has to be initialized. Useful for inspection/debugging.
   */
  async exportDb(): Promise<Uint8Array> {
    const resp = await this.#sendRequest({ type: 'export', id: this.#allocId() });
    if (!('bytes' in resp) || !resp.bytes) {
      throw new Error('exportDb: worker returned no bytes');
    }
    return resp.bytes;
  }

  /**
   * Runs a write statement (INSERT/UPDATE/DELETE/DDL). If called inside a
   * `transactionAsync` block, bypasses the queue; otherwise acquires it so the
   * op runs in its own auto-commit.
   */
  runAsync(sql: string, bind?: SqlValue[]): Promise<{ changes: number }> {
    const send = () =>
      this.#sendRequest({ type: 'run', id: this.#allocId(), sql, bind }).then(r => ({
        changes: 'changes' in r ? (r.changes ?? 0) : 0,
      }));
    return this.#inTx ? send() : this.#txQueue.put(send);
  }

  /** Runs a SELECT statement and returns rows in array row-mode. */
  allAsync(sql: string, bind?: SqlValue[]): Promise<ResultRow[]> {
    const send = () =>
      this.#sendRequest({ type: 'all', id: this.#allocId(), sql, bind }).then(r => ('rows' in r ? (r.rows ?? []) : []));
    return this.#inTx ? send() : this.#txQueue.put(send);
  }

  #allocId(): number {
    return ++this.#nextId;
  }

  /**
   * Reject any in-flight requests with `reason`, so callers awaiting a response to a
   * request sent to a now-terminated worker don't hang forever. Called from
   * close()/delete() and from the worker.onerror handler.
   */
  #rejectPending(reason: string): void {
    if (this.#pending.size === 0) {
      return;
    }
    const err = new Error(reason);
    for (const { reject } of this.#pending.values()) {
      reject(err);
    }
    this.#pending.clear();
  }

  #sendRequest(req: WorkerRequest): Promise<WorkerResponse> {
    return new Promise<WorkerResponse>((resolve, reject) => {
      this.#pending.set(req.id, {
        resolve: resp => {
          if (resp.type === 'err') {
            reject(new Error(resp.message));
          } else {
            resolve(resp);
          }
        },
        reject,
      });
      this.#worker.postMessage(req);
    });
  }
}
