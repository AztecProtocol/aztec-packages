import { type AztecArray } from '../interfaces/array.js';
import type { MemDb } from './mem_db.js';

/**
 * An persistent array backed by mem.
 */
export class MemAztecArray<T> implements AztecArray<T> {
  private slot: string;

  constructor(private name: string, private db: MemDb) {
    this.slot = JSON.stringify(['array', this.name]);
  }

  get length(): number {
    return this.db.get(this.slot)?.length || 0;
  }

  push(...vals: T[]): Promise<number> {
    const arr = this.db.get(this.slot);
    if (arr) {
      this.db.set(this.slot, [...arr, ...vals]);
    } else {
      this.db.set(this.slot, [...vals]);
    }
    return Promise.resolve(this.length);
  }

  pop(): Promise<T | undefined> {
    const arr = [...this.db.get(this.slot)];
    const result = arr.pop();
    this.db.set(this.slot, arr);
    return Promise.resolve(result);
  }

  at(index: number): T | undefined {
    const arr = this.db.get(this.slot) || [];
    if (index < 0) {
      return arr[arr.length + index];
    } else {
      return arr[index];
    }
  }

  setAt(index: number, val: T): Promise<boolean> {
    if (index < 0) {
      index = this.length + index;
    }

    if (index < 0 || index >= this.length) {
      return Promise.resolve(false);
    }

    const arr = [...this.db.get(this.slot)];
    arr[index] = val;
    this.db.set(this.slot, arr);
    return Promise.resolve(true);
  }

  entries(): IterableIterator<[number, T]> {
    return this.db.get(this.slot)?.entries() || [];
  }

  values(): IterableIterator<T> {
    return this.db.get(this.slot)?.values() || [];
  }

  [Symbol.iterator](): IterableIterator<T> {
    return this.values();
  }
}
