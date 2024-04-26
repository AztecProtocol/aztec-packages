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
  #memoryDatastore: Map<Uint8Array, MemoryItem>;
  #dbDatastore: AztecMap<string, Uint8Array>;

  #batchOps: BatchOp[] = [];

  // private dirtyItems = new Set<string>();
  // private threshold: number;
  private maxMemoryItems: number;

  constructor(db: AztecKVStore, { maxMemoryItems = 50 /*, threshold = 5 */ }) {
    this.#memoryDatastore = new Map();
    this.#dbDatastore = db.openMap('p2p_datastore');

    this.maxMemoryItems = maxMemoryItems;
    // this.threshold = threshold;
  }

  has(key: Key): boolean {
    return this.#memoryDatastore.has(key.uint8Array()) || this.#dbDatastore.has(key.toString());
  }

  get(key: Key): Uint8Array {
    const keyStr = key.uint8Array();
    const memoryItem = this.#memoryDatastore.get(keyStr);
    if (memoryItem) {
      memoryItem.lastAccessedMs = Date.now();
      return memoryItem.data;
    }
    const dbItem = this.#dbDatastore.get(key.toString());

    if (!dbItem) {
      throw new Error(`Key not found: ${keyStr}`);
    }
    return dbItem;
  }

  async put(key: Key, val: Uint8Array): Promise<Key> {
    while (this.#memoryDatastore.size >= this.maxMemoryItems) {
      // it's likely this is called only 1 time
      await this.pruneMemoryDatastore();
    }

    const keyStr = key.uint8Array();
    const memoryItem = this.#memoryDatastore.get(keyStr);
    if (memoryItem) {
      // update existing
      memoryItem.lastAccessedMs = Date.now();
      memoryItem.data = val;
    } else {
      // new
      this.#memoryDatastore.set(keyStr, { data: val, lastAccessedMs: Date.now() });
    }

    return key;
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
        value: this.get(key),
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
    this.#memoryDatastore.delete(key.uint8Array());
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
        // Assuming the underlying storage has a way to handle these as a transaction
        for (const op of this.#batchOps) {
          if (op.type === 'put' && op.value) {
            await this.#dbDatastore.set(op.key.toString(), new Uint8Array(op.value)); // Type conversion as needed
          } else if (op.type === 'del') {
            await this.#dbDatastore.delete(op.key.toString());
          }
        }
        this.#batchOps = []; // Clear operations after commit
      },
    };
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

  query(q: Query): AwaitIterable<Pair> {
    let it = this.all(); //

    if (q.prefix != null) {
      const prefix = q.prefix;
      it = filter(it, e => e.key.toString().startsWith(prefix));
    }

    if (Array.isArray(q.filters)) {
      it = q.filters.reduce((it, f) => filter(it, f), it);
    }

    if (Array.isArray(q.orders)) {
      it = q.orders.reduce((it, f) => sort(it, f), it);
    }

    if (q.offset != null) {
      let i = 0;
      const offset = q.offset;
      it = filter(it, () => i++ >= offset);
    }

    if (q.limit != null) {
      it = take(it, q.limit);
    }

    return it;
  }

  queryKeys(q: KeyQuery): AsyncIterable<Key> {
    let it = map(this.all(), ({ key }) => key);

    if (q.prefix != null) {
      const prefix = q.prefix;
      it = filter(it, e => e.toString().startsWith(prefix));
    }

    if (Array.isArray(q.filters)) {
      it = q.filters.reduce((it, f) => filter(it, f), it);
    }

    if (Array.isArray(q.orders)) {
      it = q.orders.reduce((it, f) => sort(it, f), it);
    }

    const { offset, limit } = q;
    if (offset != null) {
      let i = 0;
      it = filter(it, () => i++ >= offset);
    }

    if (limit != null) {
      it = take(it, limit);
    }

    return it;
  }

  /**
   * Prune from memory and move to db
   */
  private async pruneMemoryDatastore(): Promise<void> {
    let oldestAccessedMs = Date.now() + 1000;
    let oldestKey: Uint8Array | undefined = undefined;
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
