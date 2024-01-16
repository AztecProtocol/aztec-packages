import { Key as BaseKey, Database } from 'lmdb';

import { Key, Range } from '../interfaces/common.js';
import { AztecCounter } from '../interfaces/counter.js';

/** The slot where a key-value entry would be stored */
type CountMapKey<K> = ['count_map', string, 'slot', K];

/**
 * A counter implementation backed by LMDB
 */
export class LMDBCounter<K extends Key> implements AztecCounter<K> {
  #db: Database<[K, number], CountMapKey<K>>;
  #name: string;

  #startSentinel: CountMapKey<Buffer>;
  #endSentinel: CountMapKey<Buffer>;

  constructor(db: Database<unknown, BaseKey>, name: string) {
    this.#name = name;
    this.#db = db as Database<[K, number], CountMapKey<K>>;

    this.#startSentinel = ['count_map', this.#name, 'slot', Buffer.from([])];
    this.#endSentinel = ['count_map', this.#name, 'slot', Buffer.from([255])];
  }

  set(key: K, value: number): Promise<boolean> {
    return this.#db.put(this.#slot(key), [key, value]);
  }

  update(key: K, delta = 1): Promise<boolean> {
    return this.#db.childTransaction(() => {
      const slot = this.#slot(key);
      const [_, current] = this.#db.get(slot) ?? [key, 0];
      const next = current + delta;
      if (next === 0) {
        void this.#db.remove(slot);
      } else {
        void this.#db.put(slot, [key, next]);
      }

      return true;
    });
  }

  get(key: K): number {
    return (this.#db.get(this.#slot(key)) ?? [key, 0])[1];
  }

  *entries(range: Range<K> = {}): IterableIterator<[K, number]> {
    const { start, end, reverse, limit } = range;
    const cursor = this.#db.getRange({
      start: start ? this.#slot(start) : reverse ? this.#endSentinel : this.#startSentinel,
      end: end ? this.#slot(end) : reverse ? this.#startSentinel : this.#endSentinel,
      reverse,
      limit,
    });

    for (const {
      value: [key, value],
    } of cursor) {
      yield [key, value];
    }
  }

  *keys(range: Range<K> = {}): IterableIterator<K> {
    for (const [key] of this.entries(range)) {
      yield key;
    }
  }

  #slot(key: K): CountMapKey<K> {
    return ['count_map', this.#name, 'slot', key];
  }
}
