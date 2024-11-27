import { type AztecSingleton } from '../interfaces/singleton.js';

/**
 * Stores a single value in JungleDB.
 */
export class JungleDBAztecSingleton<T> implements AztecSingleton<T> {
  #db: any;
  #slot: string;

  constructor(db: any, name: string) {
    this.#db = db;
    this.#slot = `singleton:${name}:value`;
  }

  get(): T | undefined {
    return this.#db.getSync(this.#slot);
  }

  set(val: T): Promise<boolean> {
    return this.#db.put(this.#slot, val);
  }

  delete(): Promise<boolean> {
    return this.#db.remove(this.#slot);
  }
}
