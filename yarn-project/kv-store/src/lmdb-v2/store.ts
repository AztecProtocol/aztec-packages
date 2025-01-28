import { Logger, createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import { MsgpackChannel, NativeLMDBStore } from '@aztec/native';

import { AsyncLocalStorage } from 'async_hooks';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { AztecAsyncArray } from '../interfaces/array.js';
import { Key } from '../interfaces/common.js';
import { AztecAsyncCounter } from '../interfaces/counter.js';
import { AztecAsyncMap, AztecAsyncMultiMap } from '../interfaces/map.js';
import { AztecAsyncSet } from '../interfaces/set.js';
import { AztecAsyncSingleton } from '../interfaces/singleton.js';
import { AztecAsyncKVStore } from '../interfaces/store.js';
import { LMDBMap, LMDBMultiMap } from './map.js';
import { Database, LMDBMessageType, TypeSafeMessageChannel } from './message.js';
import { ReadTransaction } from './read_transaction.js';
import { LMDBSingleValue } from './singleton.js';
import { WriteTransaction } from './write_transaction.js';

export class AztecLMDBStoreV2 implements AztecAsyncKVStore {
  private channel: TypeSafeMessageChannel;
  private writerCtx = new AsyncLocalStorage<WriteTransaction>();
  private writerQueue = new SerialQueue();

  private constructor(
    private dataDir: string,
    mapSize: number,
    maxReaders: number,
    private log: Logger,
    private cleanup?: () => Promise<void>,
  ) {
    this.channel = new MsgpackChannel(new NativeLMDBStore(dataDir, mapSize, maxReaders));
  }

  private async start() {
    await this.channel.sendMessage(LMDBMessageType.OPEN_DATABASE, {
      db: Database.DATA,
      uniqueKeys: true,
    });

    await this.channel.sendMessage(LMDBMessageType.OPEN_DATABASE, {
      db: Database.INDEX,
      uniqueKeys: false,
    });

    this.writerQueue.start();
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
    return new ReadTransaction(this.channel);
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
      const tx = new WriteTransaction(this.channel);
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

  estimateSize(): { mappingSize: number; actualSize: number; numItems: number } {
    return { numItems: 0, actualSize: 0, mappingSize: 0 };
  }

  async close() {
    await this.writerQueue.cancel();
    await this.channel.sendMessage(LMDBMessageType.CLOSE, undefined);
  }
}
