import { type Key, type Range } from './common.js';

/**
 * A map backed by a persistent store.
 */
interface AztecBaseMap<K extends Key, V> {
  /**
   * Sets the value at the given key.
   * @param key - The key to set the value at
   * @param val - The value to set
   */
  set(key: K, val: V): Promise<void>;

  /**
   * Atomically swap the value at the given key
   * @param key - The key to swap the value at
   * @param fn - The function to swap the value with
   */
  swap(key: K, fn: (val: V | undefined) => V): Promise<void>;

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
export interface AztecMap<K extends Key, V> extends AztecBaseMap<K, V> {
  /**
   * Gets the value at the given key.
   * @param key - The key to get the value from
   */
  get(key: K): V | undefined;

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

export interface AztecMapWithSize<K extends Key, V> extends AztecMap<K, V> {
  /**
   * Gets the size of the map.
   * @returns The size of the map
   */
  size(): number;
}

/**
 * A map backed by a persistent store that can have multiple values for a single key.
 */
export interface AztecMultiMap<K extends Key, V> extends AztecMap<K, V> {
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

export interface AztecMultiMapWithSize<K extends Key, V> extends AztecMultiMap<K, V> {
  /**
   * Gets the size of the map.
   * @returns The size of the map
   */
  size(): number;
}

/**
 * A map backed by a persistent store.
 */
export interface AztecAsyncMap<K extends Key, V> extends AztecBaseMap<K, V> {
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
}

/**
 * A map backed by a persistent store that can have multiple values for a single key.
 */
export interface AztecAsyncMultiMap<K extends Key, V> extends AztecAsyncMap<K, V> {
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
