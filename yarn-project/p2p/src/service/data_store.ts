import type { AztecKVStore, AztecMap } from '@aztec/kv-store';

import { type Batch, type Datastore, Key, type KeyQuery, type Pair, type Query } from 'interface-datastore';
import type { AwaitIterable } from 'interface-store';
import filter from 'it-filter';
import map from 'it-map';
import sort from 'it-sort';
import take from 'it-take';

type MemoryItem = {
  lastAccessedMs: number;
  data: Uint8Array;
};

type BatchOp = {
  type: 'put' | 'del';
  key: Key;
  value?: Uint8Array;
};

export class AztecDatastore implements Datastore {
  #memoryDatastore: Map<string, MemoryItem>;
  #dbDatastore: AztecMap<string, Uint8Array>;
  #dirtyItems = new Set<string>();

  #batchOps: BatchOp[] = [];

  // private dirtyItems = new Set<string>();
  private threshold: number;
  private maxMemoryItems: number;

  constructor(db: AztecKVStore, { maxMemoryItems, threshold } = { maxMemoryItems: 50, threshold: 5 }) {
    this.#memoryDatastore = new Map();
    this.#dbDatastore = db.openMap('p2p_datastore');

    this.maxMemoryItems = maxMemoryItems;
    this.threshold = threshold;
  }

  has(key: Key): boolean {
    return this.#memoryDatastore.has(key.toString()) || this.#dbDatastore.has(key.toString());
  }

  async get(key: Key): Promise<Uint8Array> {
    // console.log('getting data', key);
    const keyStr = key.toString();
    const memoryItem = this.#memoryDatastore.get(keyStr);
    // console.log('res', memoryItem);
    if (memoryItem) {
      memoryItem.lastAccessedMs = Date.now();
      return memoryItem.data;
    }
    const dbItem = this.#dbDatastore.get(key.toString());

    if (!dbItem) {
      throw new Error(`Key not found: ${key.toString()}`);
    }

    // don't call this._memoryDatastore.set directly
    // we want to get through prune() logic with fromDb as true
    await this._put(key, dbItem, true);

    return dbItem;
  }

  private async _put(key: Key, val: Uint8Array, fromDb = false): Promise<Key> {
    while (this.#memoryDatastore.size >= this.maxMemoryItems) {
      await this.pruneMemoryDatastore();
    }
    const keyStr = key.toString();
    const memoryItem = this.#memoryDatastore.get(keyStr);
    if (memoryItem) {
      // update existing
      memoryItem.lastAccessedMs = Date.now();
      memoryItem.data = val;
    } else {
      // new entry
      this.#memoryDatastore.set(keyStr, { data: val, lastAccessedMs: Date.now() });
    }

    if (!fromDb) {
      await this.addDirtyItem(keyStr);
    }

    return key;
  }

  put(key: Key, val: Uint8Array): Promise<Key> {
    return this._put(key, val, false);
  }

  async *putMany(source: AwaitIterable<Pair>): AwaitIterable<Key> {
    for await (const { key, value } of source) {
      await this.put(key, value);
      yield key;
    }
  }

  async *getMany(source: AwaitIterable<Key>): AwaitIterable<Pair> {
    for await (const key of source) {
      yield {
        key,
        value: await this.get(key),
      };
    }
  }

  async *deleteMany(source: AwaitIterable<Key>): AwaitIterable<Key> {
    for await (const key of source) {
      await this.delete(key);
      yield key;
    }
  }

  async delete(key: Key): Promise<void> {
    this.#memoryDatastore.delete(key.toString());
    await this.#dbDatastore.delete(key.toString());
  }

  batch(): Batch {
    return {
      put: (key, value) => {
        this.#batchOps.push({
          type: 'put',
          key,
          value,
        });
      },
      delete: key => {
        this.#batchOps.push({
          type: 'del',
          key,
        });
      },
      commit: async () => {
        for (const op of this.#batchOps) {
          if (op.type === 'put' && op.value) {
            await this.put(op.key, op.value);
          } else if (op.type === 'del') {
            await this.delete(op.key);
          }
        }
        this.#batchOps = []; // Clear operations after commit
      },
    };
  }

  query(q: Query): AwaitIterable<Pair> {
    let it = this.all(); //
    const { prefix, filters, orders, offset, limit } = q;

    if (prefix != null) {
      it = filter(it, e => e.key.toString().startsWith(`/${prefix}`));
    }

    if (Array.isArray(filters)) {
      it = filters.reduce((it, f) => filter(it, f), it);
    }

    if (Array.isArray(orders)) {
      it = orders.reduce((it, f) => sort(it, f), it);
    }

    if (offset != null) {
      let i = 0;
      it = filter(it, () => i++ >= offset);
    }

    if (limit != null) {
      it = take(it, limit);
    }

    return it;
  }

  queryKeys(q: KeyQuery): AsyncIterable<Key> {
    let it = map(this.all(), ({ key }) => key);
    const { prefix, filters, orders, offset, limit } = q;
    if (prefix != null) {
      it = filter(it, e => e.toString().startsWith(`/${prefix}`));
    }

    if (Array.isArray(filters)) {
      it = filters.reduce((it, f) => filter(it, f), it);
    }

    if (Array.isArray(orders)) {
      it = orders.reduce((it, f) => sort(it, f), it);
    }

    if (offset != null) {
      let i = 0;
      it = filter(it, () => i++ >= offset);
    }

    if (limit != null) {
      it = take(it, limit);
    }

    return it;
  }

  private async *all(): AsyncIterable<Pair> {
    for (const [key, value] of this.#memoryDatastore.entries()) {
      yield {
        key: new Key(key),
        value: value.data,
      };
    }

    for (const [key, value] of this.#dbDatastore.entries()) {
      yield {
        key: new Key(key),
        value,
      };
    }
  }

  private async addDirtyItem(key: string): Promise<void> {
    this.#dirtyItems.add(key);

    if (this.#dirtyItems.size >= this.threshold) {
      await this.commitDirtyItems();
    }
  }

  private async commitDirtyItems(): Promise<void> {
    for (const key of this.#dirtyItems) {
      const memoryItem = this.#memoryDatastore.get(key);
      if (memoryItem) {
        await this.#dbDatastore.set(key, memoryItem.data);
      }
    }

    this.#dirtyItems.clear();
  }

  /**
   * Prune from memory and move to db
   */
  private async pruneMemoryDatastore(): Promise<void> {
    let oldestAccessedMs = Date.now() + 1000;
    let oldestKey: string | undefined = undefined;
    let oldestValue: Uint8Array | undefined = undefined;

    for (const [key, value] of this.#memoryDatastore) {
      if (value.lastAccessedMs < oldestAccessedMs) {
        oldestAccessedMs = value.lastAccessedMs;
        oldestKey = key;
        oldestValue = value.data;
      }
    }

    if (oldestKey && oldestValue) {
      await this.#dbDatastore.set(new Key(oldestKey).toString(), oldestValue);
      this.#memoryDatastore.delete(oldestKey);
    }
  }
}
