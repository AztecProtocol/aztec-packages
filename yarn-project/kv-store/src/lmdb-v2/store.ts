import { Logger, createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
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
  private transactionCtx = new AsyncLocalStorage<WriteTransaction>();
  private writePromise: Promise<void> = Promise.resolve();

  private constructor(
    private dataDir: string,
    mapSize?: number,
    maxReaders?: number,
    private log: Logger = createLogger('store'),
    private cleanup?: () => Promise<void>,
  ) {
    this.channel = new MsgpackChannel(new NativeLMDBStore(dataDir, mapSize, maxReaders));
  }

  private async init() {
    await this.channel.sendMessage(LMDBMessageType.OPEN_DATABASE, {
      db: Database.DATA,
      uniqueKeys: true,
    });

    await this.channel.sendMessage(LMDBMessageType.OPEN_DATABASE, {
      db: Database.INDEX,
      uniqueKeys: false,
    });
  }

  public static async new(dataDir: string, dbMapSizeKb: number = 10 * 1024 * 1024, maxReaders: number = 16) {
    const db = new AztecLMDBStoreV2(dataDir, dbMapSizeKb, maxReaders);
    await db.init();
    return db;
  }

  public static async tmp(
    prefix: string = 'data',
    cleanupTmpDir = true,
    dbMapSizeKb: number = 10 * 1024 * 1024,
    maxReaders: number = 16,
  ) {
    const log = createLogger('world-state:database');
    const dataDir = await mkdtemp(join(tmpdir(), prefix + '-'));
    log.debug(`Created temporary data store at: ${dataDir} with size: ${dbMapSizeKb}`);

    // pass a cleanup callback because process.on('beforeExit', cleanup) does not work under Jest
    const cleanup = async () => {
      if (cleanupTmpDir) {
        await rm(dataDir, { recursive: true, force: true });
        log.debug(`Deleted temporary data store: ${dataDir}`);
      } else {
        log.debug(`Leaving temporary data store: ${dataDir}`);
      }
    };

    const db = new AztecLMDBStoreV2(dataDir, dbMapSizeKb, maxReaders, log, cleanup);
    await db.init();
    return db;
  }

  public getReadTx(): ReadTransaction {
    const writeTx = this.transactionCtx.getStore();
    return writeTx ? writeTx : new ReadTransaction(this.channel);
  }

  public getWriteTx(): WriteTransaction | undefined {
    const currentWrite = this.transactionCtx.getStore();
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
    const currentTx = this.getWriteTx();
    if (currentTx) {
      return await callback(currentTx);
    }

    const deferred = promiseWithResolvers<void>();
    const current = this.writePromise;

    // block future write txs from starting until we finish
    this.writePromise = deferred.promise;

    // wait for any write txs to flush
    await current;

    const tx = new WriteTransaction(this.channel);
    try {
      const res = await this.transactionCtx.run(tx, callback, tx);
      await tx.commit();
      return res;
    } finally {
      tx.close();
      deferred.resolve();
    }
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
    await this.channel.sendMessage(LMDBMessageType.CLOSE, undefined);
  }
}
