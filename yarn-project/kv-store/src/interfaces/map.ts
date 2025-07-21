import type { Key, Range, Value } from './common.js';

/**
 * A map backed by a persistent store.
 */
interface AztecBaseMap<K extends Key, V extends Value> {
  /**
   * Sets the value at the given key.
   * @param key - The key to set the value at
   * @param val - The value to set
   */
  set(key: K, val: V): Promise<void>;

  /**
   * Sets the values at the given keys.
   * @param entries - The entries to set
   */
  setMany(entries: { key: K; value: V }[]): Promise<void>;

  /**
   * Sets the value at the given key if it does not already exist.
   * @param key - The key to set the value at
   * @param val - The value to set
   */
  setIfNotExists(key: K, val: V): Promise<boolean>;

  /**
   * Deletes the value at the given key.
   * @param key - The key to delete the value at
   */
  delete(key: K): Promise<void>;
}
export interface AztecMap<K extends Key, V extends Value> extends AztecBaseMap<K, V> {
  /**
   * Gets the value at the given key.
   * @param key - The key to get the value from
   */
  get(key: K): V | undefined;

  /**
   * Gets the current size of the map.
   * @returns The size of the map
   */
  size(): number;

  /**
   * Checks if a key exists in the map.
   * @param key - The key to check
   * @returns True if the key exists, false otherwise
   */
  has(key: K): boolean;

  /**
   * Iterates over the map's key-value entries in the key's natural order
   * @param range - The range of keys to iterate over
   */
  entries(range?: Range<K>): IterableIterator<[K, V]>;

  /**
   * Iterates over the map's values in the key's natural order
   * @param range - The range of keys to iterate over
   */
  values(range?: Range<K>): IterableIterator<V>;

  /**
   * Iterates over the map's keys in the key's natural order
   * @param range - The range of keys to iterate over
   */
  keys(range?: Range<K>): IterableIterator<K>;

  /**
   * Clears the map.
   */
  clear(): Promise<void>;
}

/**
 * A map backed by a persistent store.
 */
export interface AztecAsyncMap<K extends Key, V extends Value> extends AztecBaseMap<K, V> {
  /**
   * Gets the value at the given key.
   * @param key - The key to get the value from
   */
  getAsync(key: K): Promise<V | undefined>;

  /**
   * Checks if a key exists in the map.
   * @param key - The key to check
   * @returns True if the key exists, false otherwise
   */
  hasAsync(key: K): Promise<boolean>;

  /**
   * Iterates over the map's key-value entries in the key's natural order
   * @param range - The range of keys to iterate over
   */
  entriesAsync(range?: Range<K>): AsyncIterableIterator<[K, V]>;

  /**
   * Iterates over the map's values in the key's natural order
   * @param range - The range of keys to iterate over
   */
  valuesAsync(range?: Range<K>): AsyncIterableIterator<V>;

  /**
   * Iterates over the map's keys in the key's natural order
   * @param range - The range of keys to iterate over
   */
  keysAsync(range?: Range<K>): AsyncIterableIterator<K>;

  /**
   * Gets the current size of the map.
   * @returns The size of the map
   */
  sizeAsync(): Promise<number>;
}
