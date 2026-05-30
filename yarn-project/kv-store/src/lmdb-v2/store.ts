import { AsyncApi as KvdbApi, KvdbBackend } from '@aztec/bb.js/aztec-kvdb';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { Semaphore, SerialQueue } from '@aztec/foundation/queue';

import { AsyncLocalStorage } from 'async_hooks';
import { mkdir, rm } from 'fs/promises';

import type { AztecAsyncArray } from '../interfaces/array.js';
import type { Key, StoreSize, Value } from '../interfaces/common.js';
import type { AztecAsyncCounter } from '../interfaces/counter.js';
import type { AztecAsyncMap } from '../interfaces/map.js';
import type { AztecAsyncMultiMap } from '../interfaces/multi_map.js';
import type { AztecAsyncSet } from '../interfaces/set.js';
import type { AztecAsyncSingleton } from '../interfaces/singleton.js';
import type { AztecAsyncKVStore } from '../interfaces/store.js';
import { LMDBArray } from './array.js';
import { LMDBMap } from './map.js';
import {
  Database,
  type LMDBMessageChannel,
  LMDBMessageType,
  type LMDBRequestBody,
  type LMDBResponseBody,
} from './message.js';
import { LMDBMultiMap } from './multi_map.js';
import { ReadTransaction } from './read_transaction.js';
import { LMDBSet } from './set.js';
import { LMDBSingleValue } from './singleton.js';
import { WriteTransaction } from './write_transaction.js';

export { execInReadTx, execInWriteTx } from './tx-helpers.js';

export class AztecLMDBStoreV2 implements AztecAsyncKVStore, LMDBMessageChannel {
  private open = false;
  private api: KvdbApi;
  private writerCtx = new AsyncLocalStorage<WriteTransaction>();
  private writerQueue = new SerialQueue();
  private availableCursors: Semaphore;

  private constructor(
    private dataDir: string,
    private kvdbBackend: KvdbBackend,
    maxReaders: number,
    private log: Logger,
    private cleanup?: () => Promise<void>,
  ) {
    this.log.info(`Starting data store with maxReaders ${maxReaders}`);
    this.api = new KvdbApi(kvdbBackend);
    // leave one reader to always be available for regular, atomic, reads
    this.availableCursors = new Semaphore(maxReaders - 1);
  }

  public get dataDirectory(): string {
    return this.dataDir;
  }

  private async start() {
    this.writerQueue.start();

    await this.kvdbBackend.waitUntilReady();

    await this.api.kvdbOpenDatabase({
      db: Database.DATA,
      uniqueKeys: true,
    });

    await this.api.kvdbOpenDatabase({
      db: Database.INDEX,
      uniqueKeys: false,
    });

    this.open = true;
  }

  public static async new(
    dataDir: string,
    dbMapSizeKb: number = 10 * 1024 * 1024,
    maxReaders: number = 16,
    cleanup?: () => Promise<void>,
    bindings?: LoggerBindings,
  ) {
    const log = createLogger('kv-store:lmdb-v2', bindings);
    // Map size validation: keep the synchronous behavior the old NAPI wrapper
    // had so tests / callers see the same error before a subprocess is spawned.
    if (!Number.isFinite(dbMapSizeKb) || dbMapSizeKb <= 0) {
      throw new TypeError('Map size must be a positive number');
    }
    const { findKvdbBinary } = await import('@aztec/bb.js/platform');
    const binaryPath = findKvdbBinary();
    if (!binaryPath) {
      throw new Error('aztec-kvdb binary not found; rebuild bb.js with copy_native.sh');
    }
    await mkdir(dataDir, { recursive: true });
    // dbMapSizeKb is the legacy parameter name from the NAPI LMDBStore; it is
    // actually a byte count (see callers and the lmdb-v2 NAPI tests).
    const mapSizeBytes = dbMapSizeKb;
    const kvdbBackend = new KvdbBackend({
      binaryPath,
      dataDir,
      mapSizeBytes,
      maxReaders,
      // SHM is the production transport; UDS is the dev/test fallback. Override
      // via KVDB_USE_UDS=1 for repro-friendly tests.
      useShm: process.env.KVDB_USE_UDS !== '1',
      logger: msg => log.verbose(msg),
    });
    const db = new AztecLMDBStoreV2(dataDir, kvdbBackend, maxReaders, log, cleanup);
    await db.start();
    return db;
  }

  public async backupTo(dstPath: string, compact = true) {
    await mkdir(dstPath, { recursive: true });
    await this.api.kvdbCopyStore({ dstPath, compact });
  }

  public getReadTx(): ReadTransaction {
    if (!this.open) {
      throw new Error('Store is closed');
    }
    return new ReadTransaction(this);
  }

  public getCurrentWriteTx(): WriteTransaction | undefined {
    if (!this.open) {
      throw new Error('Store is closed');
    }
    const currentWrite = this.writerCtx.getStore();
    return currentWrite;
  }

  openMap<K extends Key, V extends Value>(name: string): AztecAsyncMap<K, V> {
    return new LMDBMap(this, name);
  }

  openMultiMap<K extends Key, V extends Value>(name: string): AztecAsyncMultiMap<K, V> {
    return new LMDBMultiMap(this, name);
  }

  openSingleton<T extends Value>(name: string): AztecAsyncSingleton<T> {
    return new LMDBSingleValue(this, name);
  }

  openArray<T extends Value>(name: string): AztecAsyncArray<T> {
    return new LMDBArray(this, name);
  }

  openSet<K extends Key>(name: string): AztecAsyncSet<K> {
    return new LMDBSet(this, name);
  }

  openCounter<K extends Key>(_name: string): AztecAsyncCounter<K> {
    throw new Error('Not implemented');
  }

  async transactionAsync<T extends Exclude<any, Promise<any>>>(
    callback: (tx: WriteTransaction) => Promise<T>,
  ): Promise<T> {
    if (!this.open) {
      throw new Error('Store is closed');
    }

    // transactionAsync might be called recursively
    // send any writes to the parent tx, but don't close it
    // if the callback throws then the parent tx will rollback automatically
    const currentTx = this.getCurrentWriteTx();
    if (currentTx) {
      return await callback(currentTx);
    }

    return this.writerQueue.put(async () => {
      const tx = new WriteTransaction(this);
      try {
        const res = await this.writerCtx.run(tx, callback, tx);
        await tx.commit();
        return res;
      } catch (err) {
        this.log.error(`Failed to commit transaction`, err);
        throw err;
      } finally {
        tx.close();
      }
    });
  }

  clear(): Promise<void> {
    return Promise.resolve();
  }

  async delete(): Promise<void> {
    await this.close();
    await rm(this.dataDir, { recursive: true, force: true, maxRetries: 3 });
    this.log.verbose(`Deleted database files at ${this.dataDir}`);
    await this.cleanup?.();
  }

  async close() {
    if (!this.open) {
      // already closed
      return;
    }
    this.open = false;
    await this.writerQueue.cancel();
    // Tell the server to flush + close cursors before the process exits.
    try {
      await this.api.kvdbClose({});
    } catch {
      // Suppress: the child may have already exited.
    }
    await this.kvdbBackend.destroy();
  }

  public async sendMessage<T extends LMDBMessageType>(
    msgType: T,
    body: LMDBRequestBody[T],
  ): Promise<LMDBResponseBody[T]> {
    if (!this.open) {
      throw new Error('Store is closed');
    }

    if (msgType === LMDBMessageType.START_CURSOR) {
      await this.availableCursors.acquire();
    }

    let response: LMDBResponseBody[T] | undefined = undefined;
    try {
      response = (await this.sendGeneratedMessage(msgType, body)) as LMDBResponseBody[T];
      return response;
    } finally {
      if (
        (msgType === LMDBMessageType.START_CURSOR && response === undefined) ||
        msgType === LMDBMessageType.CLOSE_CURSOR ||
        // it's possible for a START_CURSOR command to not return a cursor (e.g. db is empty)
        (msgType === LMDBMessageType.START_CURSOR &&
          typeof (response as LMDBResponseBody[LMDBMessageType.START_CURSOR]).cursor !== 'number')
      ) {
        this.availableCursors.release();
      }
    }
  }

  public async estimateSize(): Promise<StoreSize> {
    const resp = await this.sendMessage(LMDBMessageType.STATS, undefined);
    return {
      mappingSize: Number(resp.dbMapSizeBytes),
      physicalFileSize: Number(resp.dbPhysicalFileSizeBytes),
      actualSize: resp.stats.reduce((s, db) => Number(db.totalUsedSize) + s, 0),
      numItems: resp.stats.reduce((s, db) => Number(db.numDataItems) + s, 0),
    };
  }

  private async sendGeneratedMessage<T extends LMDBMessageType>(
    msgType: T,
    body: LMDBRequestBody[T],
  ): Promise<LMDBResponseBody[T]> {
    switch (msgType) {
      case LMDBMessageType.OPEN_DATABASE:
        return this.api.kvdbOpenDatabase(
          this.toGeneratedOpenDatabase(body as LMDBRequestBody[LMDBMessageType.OPEN_DATABASE]),
        ) as Promise<LMDBResponseBody[T]>;
      case LMDBMessageType.GET:
        return this.api.kvdbGet(body as LMDBRequestBody[LMDBMessageType.GET]) as Promise<LMDBResponseBody[T]>;
      case LMDBMessageType.HAS:
        return this.api.kvdbHas(this.toGeneratedHas(body as LMDBRequestBody[LMDBMessageType.HAS])) as Promise<
          LMDBResponseBody[T]
        >;
      case LMDBMessageType.START_CURSOR:
        return this.api
          .kvdbStartCursor(this.toGeneratedStartCursor(body as LMDBRequestBody[LMDBMessageType.START_CURSOR]))
          .then(response => ({
            ...response,
            entries: response.entries.map(({ key, values }) => [key, values]),
          })) as Promise<LMDBResponseBody[T]>;
      case LMDBMessageType.ADVANCE_CURSOR:
        return this.api.kvdbAdvanceCursor(body as LMDBRequestBody[LMDBMessageType.ADVANCE_CURSOR]).then(response => ({
          ...response,
          entries: response.entries.map(({ key, values }) => [key, values]),
        })) as Promise<LMDBResponseBody[T]>;
      case LMDBMessageType.ADVANCE_CURSOR_COUNT:
        return this.api.kvdbAdvanceCursorCount(
          body as LMDBRequestBody[LMDBMessageType.ADVANCE_CURSOR_COUNT],
        ) as Promise<LMDBResponseBody[T]>;
      case LMDBMessageType.CLOSE_CURSOR:
        return this.api.kvdbCloseCursor(body as LMDBRequestBody[LMDBMessageType.CLOSE_CURSOR]) as Promise<
          LMDBResponseBody[T]
        >;
      case LMDBMessageType.BATCH:
        return this.api.kvdbBatch(this.toGeneratedBatch(body as LMDBRequestBody[LMDBMessageType.BATCH])) as Promise<
          LMDBResponseBody[T]
        >;
      case LMDBMessageType.STATS:
        return this.api.kvdbStats({}) as Promise<LMDBResponseBody[T]>;
      case LMDBMessageType.CLOSE:
        return this.api.kvdbClose({}) as Promise<LMDBResponseBody[T]>;
      case LMDBMessageType.COPY_STORE:
        return this.api.kvdbCopyStore(
          this.toGeneratedCopyStore(body as LMDBRequestBody[LMDBMessageType.COPY_STORE]),
        ) as Promise<LMDBResponseBody[T]>;
    }
  }

  private toGeneratedStartCursor(body: LMDBRequestBody[LMDBMessageType.START_CURSOR]) {
    return {
      ...body,
      reverse: body.reverse ?? null,
      count: body.count ?? null,
      onePage: body.onePage ?? null,
    };
  }

  private toGeneratedOpenDatabase(body: LMDBRequestBody[LMDBMessageType.OPEN_DATABASE]) {
    return {
      ...body,
      uniqueKeys: body.uniqueKeys ?? null,
    };
  }

  private toGeneratedHas(body: LMDBRequestBody[LMDBMessageType.HAS]) {
    return {
      ...body,
      entries: body.entries.map(([key, values]) => ({ key, values })),
    };
  }

  private toGeneratedBatch(body: LMDBRequestBody[LMDBMessageType.BATCH]) {
    return {
      batches: [...body.batches.entries()].map(([db, batch]) => ({
        db,
        addEntries: batch.addEntries.map(([key, values]) => ({ key, values })),
        removeEntries: batch.removeEntries.map(([key, values]) => ({ key, values })),
      })),
    };
  }

  private toGeneratedCopyStore(body: LMDBRequestBody[LMDBMessageType.COPY_STORE]) {
    return {
      ...body,
      compact: body.compact ?? null,
    };
  }
}
