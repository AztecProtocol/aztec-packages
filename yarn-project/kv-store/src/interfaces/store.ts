import { type AztecArray, type AztecAsyncArray } from './array.js';
import { type Key } from './common.js';
import { type AztecAsyncCounter, type AztecCounter } from './counter.js';
import { AztecMultiMapWithSize, type AztecAsyncMap, type AztecAsyncMultiMap, type AztecMap, type AztecMultiMap } from './map.js';
import { type AztecAsyncSet, type AztecSet } from './set.js';
import { type AztecAsyncSingleton, type AztecSingleton } from './singleton.js';

/** A key-value store */
export interface AztecKVStore {
  syncGetters: true;
  /**
   * Creates a new map.
   * @param name - The name of the map
   * @returns The map
   */
  openMap<K extends Key, V>(name: string): AztecMap<K, V>;

  /**
   * Creates a new set.
   * @param name - The name of the set
   * @returns The set
   */
  openSet<K extends Key>(name: string): AztecSet<K>;

  /**
   * Creates a new multi-map.
   * @param name - The name of the multi-map
   * @returns The multi-map
   */
  openMultiMap<K extends Key, V>(name: string): AztecMultiMap<K, V>;

  /**
   * Creates a new multi-map with size.
   * @param name - The name of the multi-map
   * @returns The multi-map
   */
  openMultiMapWithSize<K extends Key, V>(name: string): AztecMultiMapWithSize<K, V>;

  /**
   * Creates a new array.
   * @param name - The name of the array
   * @returns The array
   */
  openArray<T>(name: string): AztecArray<T>;

  /**
   * Creates a new singleton.
   * @param name - The name of the singleton
   * @returns The singleton
   */
  openSingleton<T>(name: string): AztecSingleton<T>;

  /**
   * Creates a new count map.
   * @param name - name of the counter
   */
  openCounter<K extends Key>(name: string): AztecCounter<K>;

  /**
   * Starts a transaction. All calls to read/write data while in a transaction are queued and executed atomically.
   * @param callback - The callback to execute in a transaction
   */
  transaction<T extends Exclude<any, Promise<any>>>(callback: () => T): Promise<T>;

  /**
   * Clears all entries in the store
   */
  clear(): Promise<void>;

  /**
   * Forks the store.
   */
  fork(): Promise<AztecKVStore>;

  /**
   * Deletes the store
   */
  delete(): Promise<void>;

  /**
   * Estimates the size of the store in bytes.
   */
  estimateSize(): { mappingSize: number; actualSize: number; numItems: number };
}

export interface AztecAsyncKVStore {
  /**
   * Creates a new map.
   * @param name - The name of the map
   * @returns The map
   */
  openMap<K extends Key, V>(name: string): AztecAsyncMap<K, V>;

  /**
   * Creates a new set.
   * @param name - The name of the set
   * @returns The set
   */
  openSet<K extends Key>(name: string): AztecAsyncSet<K>;

  /**
   * Creates a new multi-map.
   * @param name - The name of the multi-map
   * @returns The multi-map
   */
  openMultiMap<K extends Key, V>(name: string): AztecAsyncMultiMap<K, V>;

  /**
   * Creates a new array.
   * @param name - The name of the array
   * @returns The array
   */
  openArray<T>(name: string): AztecAsyncArray<T>;

  /**
   * Creates a new singleton.
   * @param name - The name of the singleton
   * @returns The singleton
   */
  openSingleton<T>(name: string): AztecAsyncSingleton<T>;

  /**
   * Creates a new count map.
   * @param name - name of the counter
   */
  openCounter<K extends Key>(name: string): AztecAsyncCounter<K>;

  /**
   * Starts a transaction. All calls to read/write data while in a transaction are queued and executed atomically.
   * @param callback - The callback to execute in a transaction
   */
  transactionAsync<T extends Exclude<any, Promise<any>>>(callback: () => Promise<T>): Promise<T>;

  /**
   * Clears all entries in the store
   */
  clear(): Promise<void>;

  /**
   * Forks the store.
   */
  fork(): Promise<AztecAsyncKVStore>;

  /**
   * Deletes the store
   */
  delete(): Promise<void>;

  /**
   * Estimates the size of the store in bytes.
   */
  estimateSize(): { mappingSize: number; actualSize: number; numItems: number };
}
