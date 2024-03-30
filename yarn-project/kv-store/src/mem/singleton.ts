import type { AztecSingleton } from '../interfaces/singleton.js';
import type { MemDb } from './mem_db.js';

/**
 * Stores a single value in mem.
 */
export class MemAztecSingleton<T> implements AztecSingleton<T> {
  private slot: string;

  constructor(private name: string, private db: MemDb) {
    this.slot = JSON.stringify(['array', this.name]);
  }

  get(): T | undefined {
    return this.db.get(this.slot);
  }

  set(val: T): Promise<boolean> {
    this.db.set(this.slot, val);
    return Promise.resolve(true);
  }

  delete(): Promise<boolean> {
    this.db.del(this.slot);
    return Promise.resolve(true);
  }
}
