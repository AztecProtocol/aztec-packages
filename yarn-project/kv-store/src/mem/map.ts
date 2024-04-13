import type { Key, Range } from '../interfaces/common.js';
import type { AztecMultiMap } from '../interfaces/map.js';
import type { MemDb } from './mem_db.js';

// Comparator function for keys already parsed from JSON
function compareKeys(a: Key, b: Key) {
  // Handle array (tuple) comparison
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] < b[i]) {
        return -1;
      }
      if (a[i] > b[i]) {
        return 1;
      }
    }
    return a.length - b.length;
  }

  // Fallback to normal comparison for non-array keys
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

/**
 * A map backed by mem.
 */
export class MemAztecMap<V> implements AztecMultiMap<Key, V> {
  constructor(private name: string, private db: MemDb, private allowDups = true) {}

  close(): Promise<void> {
    return Promise.resolve();
  }

  get(key: Key): V | undefined {
    const r = this.db.get(this.slot(key));
    return r ? r[0] : undefined;
  }

  getValues(key: Key): IterableIterator<V> {
    const r = this.db.get(this.slot(key));
    return r ? r.values() : new Array<V>().values();
  }

  has(key: Key): boolean {
    const r = this.db.get(this.slot(key));
    return r ? r.length > 0 : false;
  }

  set(key: Key, val: V): Promise<void> {
    const r = this.db.get(this.slot(key));
    if (r && this.allowDups) {
      this.db.set(this.slot(key), [...r, val]);
    } else {
      this.db.set(this.slot(key), [val]);
    }
    return Promise.resolve();
  }

  swap(key: Key, fn: (val: V | undefined) => V): Promise<void> {
    const entry = this.get(key);
    const newValue = fn(entry);
    this.db.set(this.slot(key), [newValue]);
    return Promise.resolve();
  }

  async setIfNotExists(key: Key, val: V): Promise<boolean> {
    const r = this.get(key);
    if (!r) {
      await this.set(key, val);
      return true;
    }
    return false;
  }

  delete(key: Key): Promise<void> {
    const r = this.db.get(this.slot(key));
    if (r?.length) {
      this.db.set(this.slot(key), []);
    }
    return Promise.resolve();
  }

  deleteValue(key: Key, val: V): Promise<void> {
    const r = this.db.get(this.slot(key));
    if (r) {
      const i = r.indexOf(val);
      if (i != -1) {
        this.db.set(this.slot(key), [...r.slice(0, i), ...r.slice(i + 1)]);
      }
    }
    return Promise.resolve();
  }

  *entries(range: Range<Key> = {}): IterableIterator<[Key, V]> {
    let { limit } = range;
    const { start, end, reverse = false } = range;

    // TODO: Horrifically inefficient as backing db is not an ordered map.
    // Make it so.
    const keys = this.db
      .keys()
      .map(key => JSON.parse(key))
      .filter(key => key[0] == 'map' && key[1] == this.name)
      .map(key => key[2])
      .sort(compareKeys);

    if (reverse) {
      keys.reverse();
    }

    for (const key of keys) {
      if (reverse) {
        if (end !== undefined && compareKeys(key, end) > 0) {
          continue;
        }
        if (start !== undefined && compareKeys(key, start) <= 0) {
          break;
        }
      } else {
        if (start !== undefined && compareKeys(key, start) < 0) {
          continue;
        }
        if (end !== undefined && compareKeys(key, end) >= 0) {
          break;
        }
      }

      const values = this.db.get(this.slot(key));
      if (!values) {
        return;
      }
      for (const value of values) {
        yield [key, value];
        if (limit && --limit <= 0) {
          return;
        }
      }
    }
  }

  *values(range: Range<Key> = {}): IterableIterator<V> {
    for (const [_, value] of this.entries(range)) {
      yield value;
    }
  }

  *keys(range: Range<Key> = {}): IterableIterator<Key> {
    for (const [key, _] of this.entries(range)) {
      yield key;
    }
  }

  private slot(key: Key): string {
    return JSON.stringify(['map', this.name, key]);
  }
}
