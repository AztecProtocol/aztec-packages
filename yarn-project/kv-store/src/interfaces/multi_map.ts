import type { Key, Value } from './common.js';
import type { AztecAsyncMap, AztecMap } from './map.js';

/**
 * A map backed by a persistent store that can have multiple values for a single key.
 */
export interface AztecMultiMap<K extends Key, V extends Value> extends AztecMap<K, V> {
  /**
   * Gets all the values at the given key.
   * @param key - The key to get the values from
   */
  getValues(key: K): IterableIterator<V>;

  /**
   * Deletes a specific value at the given key.
   * @param key - The key to delete the value at
   * @param val - The value to delete
   */
  deleteValue(key: K, val: V): Promise<void>;
}

/**
 * A map backed by a persistent store that can have multiple values for a single key.
 */
export interface AztecAsyncMultiMap<K extends Key, V extends Value> extends AztecAsyncMap<K, V> {
  /**
   * Gets all the values at the given key.
   * @param key - The key to get the values from
   */
  getValuesAsync(key: K): AsyncIterableIterator<V>;

  /**
   * Deletes a specific value at the given key.
   * @param key - The key to delete the value at
   * @param val - The value to delete
   */
  deleteValue(key: K, val: V): Promise<void>;
}
