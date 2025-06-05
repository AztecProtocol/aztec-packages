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
}

/**
 * Wraps an AztecMap that stores `Buffer`s with functions that convert to and from some other type `TypedV`, making the
 * map behave as if it stored `TypedV` objects.
 * @param into A function that converts a `TypedV` into a `Buffer`.
 * @param from A function that creates a `TypedV` from a `Buffer`.
 */
export function typedBufferAztecMap<K extends Key, TypedV>(
  map: AztecAsyncMap<K, Buffer>,
  into: (value: TypedV) => Buffer,
  from: (value: Buffer) => TypedV,
): AztecAsyncMap<K, TypedV> {
  return {
    getAsync: async function (key: K): Promise<TypedV | undefined> {
      const val = await map.getAsync(key);
      if (val !== undefined) {
        return from(val);
      }
    },
    hasAsync: function (key: K): Promise<boolean> {
      return map.hasAsync(key);
    },
    entriesAsync: async function* (range?: Range<K> | undefined): AsyncIterableIterator<[K, TypedV]> {
      for await (const [key, val] of map.entriesAsync(range)) {
        yield [key, from(val)];
      }
    },
    valuesAsync: async function* (range?: Range<K> | undefined): AsyncIterableIterator<TypedV> {
      for await (const val of map.valuesAsync(range)) {
        yield from(val);
      }
    },
    keysAsync: function (range?: Range<K> | undefined): AsyncIterableIterator<K> {
      return map.keysAsync(range);
    },
    set: function (key: K, val: TypedV): Promise<void> {
      return map.set(key, into(val));
    },
    setIfNotExists: function (key: K, val: TypedV): Promise<boolean> {
      return map.setIfNotExists(key, into(val));
    },
    delete: function (key: K): Promise<void> {
      return map.delete(key);
    },
  };
}
