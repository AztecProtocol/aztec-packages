import { type Logger, createLogger } from '@aztec/foundation/log';
import { Semaphore, SerialQueue } from '@aztec/foundation/queue';
import { MsgpackChannel, NativeLMDBStore } from '@aztec/native';

import { AsyncLocalStorage } from 'async_hooks';
import { rm } from 'fs/promises';

import type { AztecAsyncArray } from '../interfaces/array.js';
import type { Key, StoreSize } from '../interfaces/common.js';
import type { AztecAsyncCounter } from '../interfaces/counter.js';
import type { AztecAsyncMap, AztecAsyncMultiMap } from '../interfaces/map.js';
import type { AztecAsyncSet } from '../interfaces/set.js';
import type { AztecAsyncSingleton } from '../interfaces/singleton.js';
import type { AztecAsyncKVStore } from '../interfaces/store.js';
import { LMDBMap, LMDBMultiMap } from './map.js';
import {
  Database,
  type LMDBMessageChannel,
  LMDBMessageType,
  type LMDBRequestBody,
  type LMDBResponseBody,
} from './message.js';
import { ReadTransaction } from './read_transaction.js';
import { LMDBSingleValue } from './singleton.js';
import { WriteTransaction } from './write_transaction.js';

export class AztecLMDBStoreV2 implements AztecAsyncKVStore, LMDBMessageChannel {
  private channel: MsgpackChannel<LMDBMessageType, LMDBRequestBody, LMDBResponseBody>;
  private writerCtx = new AsyncLocalStorage<WriteTransaction>();
  private writerQueue = new SerialQueue();
  private availableCursors: Semaphore;

  private constructor(
    private dataDir: string,
    mapSize: number,
    maxReaders: number,
    private log: Logger,
    private cleanup?: () => Promise<void>,
  ) {
    this.log.info(`Starting data store with maxReaders ${maxReaders}`);
    this.channel = new MsgpackChannel(new NativeLMDBStore(dataDir, mapSize, maxReaders));
    // leave one reader to always be available for regular, atomic, reads
    this.availableCursors = new Semaphore(maxReaders - 1);
  }

  private async start() {
    this.writerQueue.start();

    await this.sendMessage(LMDBMessageType.OPEN_DATABASE, {
      db: Database.DATA,
      uniqueKeys: true,
    });

    await this.sendMessage(LMDBMessageType.OPEN_DATABASE, {
      db: Database.INDEX,
      uniqueKeys: false,
    });
  }

  public static async new(
    dataDir: string,
    dbMapSizeKb: number = 10 * 1024 * 1024,
    maxReaders: number = 16,
    cleanup?: () => Promise<void>,
    log = createLogger('kv-store:lmdb-v2'),
  ) {
    const db = new AztecLMDBStoreV2(dataDir, dbMapSizeKb, maxReaders, log, cleanup);
    await db.start();
    return db;
  }

  public getReadTx(): ReadTransaction {
    return new ReadTransaction(this);
  }

  public getCurrentWriteTx(): WriteTransaction | undefined {
    const currentWrite = this.writerCtx.getStore();
    return currentWrite;
  }

  openMap<K extends Key, V>(name: string): AztecAsyncMap<K, V> {
    return new LMDBMap(this, name);
  }

  openMultiMap<K extends Key, V>(name: string): AztecAsyncMultiMap<K, V> {
    return new LMDBMultiMap(this, name);
  }

  openSingleton<T>(name: string): AztecAsyncSingleton<T> {
    return new LMDBSingleValue(this, name);
  }

  openArray<T>(_name: string): AztecAsyncArray<T> {
    throw new Error('Not implemented');
  }

  openSet<K extends Key>(_name: string): AztecAsyncSet<K> {
    throw new Error('Not implemented');
  }

  openCounter<K extends Key>(_name: string): AztecAsyncCounter<K> {
    throw new Error('Not implemented');
  }

  async transactionAsync<T extends Exclude<any, Promise<any>>>(
    callback: (tx: WriteTransaction) => Promise<T>,
  ): Promise<T> {
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

  fork(): Promise<AztecAsyncKVStore> {
    throw new Error('Not implemented');
  }

  async delete(): Promise<void> {
    await this.close();
    await rm(this.dataDir, { recursive: true, force: true });
    this.log.verbose(`Deleted database files at ${this.dataDir}`);
    await this.cleanup?.();
  }

  async close() {
    await this.writerQueue.cancel();
    await this.sendMessage(LMDBMessageType.CLOSE, undefined);
  }

  public async sendMessage<T extends LMDBMessageType>(
    msgType: T,
    body: LMDBRequestBody[T],
  ): Promise<LMDBResponseBody[T]> {
    if (msgType === LMDBMessageType.START_CURSOR) {
      await this.availableCursors.acquire();
    }

    let response: LMDBResponseBody[T] | undefined = undefined;
    try {
      ({ response } = await this.channel.sendMessage(msgType, body));
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
      actualSize: resp.stats.reduce((s, db) => Number(db.totalUsedSize) + s, 0),
      numItems: resp.stats.reduce((s, db) => Number(db.numDataItems) + s, 0),
    };
  }
}

export function execInWriteTx<T>(store: AztecLMDBStoreV2, fn: (tx: WriteTransaction) => Promise<T>): Promise<T> {
  const currentWrite = store.getCurrentWriteTx();
  if (currentWrite) {
    return fn(currentWrite);
  } else {
    return store.transactionAsync(fn);
  }
}

export async function execInReadTx<T>(
  store: AztecLMDBStoreV2,
  fn: (tx: ReadTransaction) => T | Promise<T>,
): Promise<T> {
  const currentWrite = store.getCurrentWriteTx();
  if (currentWrite) {
    return await fn(currentWrite);
  } else {
    const tx = store.getReadTx();
    try {
      return await fn(tx);
    } finally {
      tx.close();
    }
  }
}
