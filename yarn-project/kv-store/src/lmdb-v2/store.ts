import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { Semaphore, SerialQueue } from '@aztec/foundation/queue';
import { MsgpackChannel, NativeLMDBStore } from '@aztec/native';

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
  private channel: MsgpackChannel<LMDBMessageType, LMDBRequestBody, LMDBResponseBody>;
  private writerCtx = new AsyncLocalStorage<WriteTransaction>();
  private readerCtx = new AsyncLocalStorage<ReadTransaction>();
  private writerQueue = new SerialQueue();
  private availableCursors: Semaphore;
  // Cursors that took a reader slot of their own; cursors opened against a read-only transaction reuse its slot
  private cursorsHoldingReaderSlot = new Set<number>();

  private constructor(
    private dataDir: string,
    mapSize: number,
    maxReaders: number,
    private log: Logger,
    private cleanup?: () => Promise<void>,
    ephemeral: boolean = false,
  ) {
    this.log.info(`Starting data store with maxReaders ${maxReaders}`);
    this.channel = new MsgpackChannel(new NativeLMDBStore(dataDir, mapSize, maxReaders, ephemeral));
    // leave one reader to always be available for regular, atomic, reads
    this.availableCursors = new Semaphore(maxReaders - 1);
  }

  public get dataDirectory(): string {
    return this.dataDir;
  }

  private async start() {
    this.writerQueue.start();

    await this.channel.sendMessage(LMDBMessageType.OPEN_DATABASE, {
      db: Database.DATA,
      uniqueKeys: true,
    });

    await this.channel.sendMessage(LMDBMessageType.OPEN_DATABASE, {
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
    ephemeral: boolean = false,
  ) {
    const log = createLogger('kv-store:lmdb-v2', bindings);
    const db = new AztecLMDBStoreV2(dataDir, dbMapSizeKb, maxReaders, log, cleanup, ephemeral);
    await db.start();
    return db;
  }

  public async backupTo(dstPath: string, compact = true) {
    await mkdir(dstPath, { recursive: true });
    await this.channel.sendMessage(LMDBMessageType.COPY_STORE, { dstPath, compact });
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

  /** Returns the read-only transaction of the enclosing {@link readOnlyTransaction} call, if there is one. */
  public getCurrentReadTx(): ReadTransaction | undefined {
    if (!this.open) {
      throw new Error('Store is closed');
    }
    return this.readerCtx.getStore();
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

  /**
   * Runs the callback against a real LMDB read transaction, so every read inside it — whether through the supplied
   * transaction or through a container such as a map, which picks it up ambiently — observes the same snapshot of the
   * store. Readers never block the writer and are not serialized against it, so a write may well commit while the
   * callback runs; the callback simply does not see it.
   *
   * Keep the callback short. An open snapshot prevents LMDB from reusing the pages it references, so the data file
   * grows for as long as it is held.
   *
   * Nested calls reuse the enclosing transaction: inside a write transaction the callback sees that transaction's
   * uncommitted writes, and inside another read-only transaction it shares its snapshot.
   */
  async readOnlyTransaction<T extends Exclude<any, Promise<any>>>(
    callback: (tx: ReadTransaction) => Promise<T>,
  ): Promise<T> {
    if (!this.open) {
      throw new Error('Store is closed');
    }

    const currentWrite = this.getCurrentWriteTx();
    if (currentWrite) {
      return await callback(currentWrite);
    }

    const currentRead = this.getCurrentReadTx();
    if (currentRead) {
      return await callback(currentRead);
    }

    // An open snapshot holds an LMDB reader slot for its whole lifetime, so it competes with cursors for them
    await this.availableCursors.acquire();
    let txId: number | undefined;
    try {
      ({ tx: txId } = await this.sendMessage(LMDBMessageType.START_READ_TX, undefined));
      const tx = new ReadTransaction(this, txId);
      try {
        return await this.readerCtx.run(tx, callback, tx);
      } finally {
        tx.close();
      }
    } finally {
      if (typeof txId === 'number') {
        // The store may have been closed underneath us, in which case the native side has already dropped every
        // read transaction it was holding open.
        await this.sendMessage(LMDBMessageType.CLOSE_READ_TX, { tx: txId }).catch(err =>
          this.log.warn(`Failed to close read-only transaction`, { err, txId }),
        );
      }
      this.availableCursors.release();
    }
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
    await this.channel.sendMessage(LMDBMessageType.CLOSE, undefined);
  }

  public async sendMessage<T extends LMDBMessageType>(
    msgType: T,
    body: LMDBRequestBody[T],
  ): Promise<LMDBResponseBody[T]> {
    if (!this.open) {
      throw new Error('Store is closed');
    }

    // A cursor bound to a read-only transaction iterates over a snapshot that already holds a reader slot, so it
    // must not take one of its own.
    const takesReaderSlot =
      msgType === LMDBMessageType.START_CURSOR &&
      typeof (body as LMDBRequestBody[LMDBMessageType.START_CURSOR]).txId !== 'number';

    if (takesReaderSlot) {
      await this.availableCursors.acquire();
    }

    let response: LMDBResponseBody[T] | undefined = undefined;
    try {
      ({ response } = await this.channel.sendMessage(msgType, body));
      return response;
    } finally {
      if (takesReaderSlot) {
        // the response is undefined if the message failed, and a START_CURSOR may legitimately return no cursor at
        // all (e.g. the db is empty), in which case there is nothing left to release the slot later on
        const cursor = (response as LMDBResponseBody[LMDBMessageType.START_CURSOR] | undefined)?.cursor;
        if (typeof cursor === 'number') {
          this.cursorsHoldingReaderSlot.add(cursor);
        } else {
          this.availableCursors.release();
        }
      } else if (msgType === LMDBMessageType.CLOSE_CURSOR) {
        const { cursor } = body as LMDBRequestBody[LMDBMessageType.CLOSE_CURSOR];
        if (this.cursorsHoldingReaderSlot.delete(cursor)) {
          this.availableCursors.release();
        }
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
}
