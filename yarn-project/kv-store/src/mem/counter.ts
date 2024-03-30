import type { Key, Range } from '../interfaces/common.js';
import type { AztecCounter } from '../interfaces/counter.js';
import { MemAztecMap } from './map.js';
import type { MemDb } from './mem_db.js';

export class MemAztecCounter implements AztecCounter<Key> {
  private map: MemAztecMap<number>;

  constructor(name: string, db: MemDb) {
    this.map = new MemAztecMap(name, db);
  }

  async set(key: Key, value: number): Promise<boolean> {
    if (value) {
      return this.map.set(key, value);
    } else {
      await this.map.delete(key);
      return true;
    }
  }

  async update(key: Key, delta = 1): Promise<boolean> {
    const current = this.map.get(key) ?? 0;
    const next = current + delta;

    if (next < 0) {
      throw new Error(`Cannot update ${key} in counter below zero`);
    }

    await this.map.delete(key);

    if (next > 0) {
      await this.map.set(key, next);
    }

    return true;
  }

  get(key: Key): number {
    return this.map.get(key) ?? 0;
  }

  entries(range: Range<Key> = {}): IterableIterator<[Key, number]> {
    return this.map.entries(range);
  }

  keys(range: Range<Key> = {}): IterableIterator<Key> {
    return this.map.keys(range);
  }
}
