import { type Key, type Range } from './common.js';

/**
 * A set backed by a persistent store.
 */
interface AztecBaseSet<K extends Key> {
  /**
   * Adds the given value.
   * @param key - The key to add.
   */
  add(key: K): Promise<void>;

  /**
   * Deletes the given key.
   * @param key - The key to delete.
   */
  delete(key: K): Promise<void>;
}

export interface AztecSet<K extends Key> extends AztecBaseSet<K> {
  /**
   * Checks if a key exists in the set.
   * @param key - The key to check
   * @returns True if the key exists, false otherwise
   */
  has(key: K): boolean;

  /**
   * Iterates over the sets's keys entries in the key's natural order
   * @param range - The range of keys to iterate over
   */
  entries(range?: Range<K>): IterableIterator<K>;
}

export interface AztecAsyncSet<K extends Key> extends AztecBaseSet<K> {
  /**
   * Checks if a key exists in the set.
   * @param key - The key to check
   * @returns True if the key exists, false otherwise
   */
  hasAsync(key: K): Promise<boolean>;

  /**
   * Iterates over the sets's keys entries in the key's natural order
   * @param range - The range of keys to iterate over
   */
  entriesAsync(range?: Range<K>): AsyncIterableIterator<K>;
}
