import type { Key, Range } from '../interfaces/common.js';
import type { AztecCounter } from '../interfaces/counter.js';
import { MemAztecMap } from './map.js';
import type { MemDb } from './mem_db.js';

export class MemAztecCounter implements AztecCounter<Key> {
  private map: MemAztecMap<number>;

  constructor(name: string, db: MemDb) {
    this.map = new MemAztecMap(name, db, false);
  }

  async set(key: Key, value: number): Promise<void> {
    if (value) {
      return this.map.set(key, value);
    } else {
      await this.map.delete(key);
    }
  }

  async update(key: Key, delta = 1): Promise<void> {
    const current = this.map.get(key) ?? 0;
    const next = current + delta;

    if (next < 0) {
      throw new Error(`Cannot update ${key} in counter below zero`);
    }

    await this.map.delete(key);

    if (next > 0) {
      await this.map.set(key, next);
    }
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
