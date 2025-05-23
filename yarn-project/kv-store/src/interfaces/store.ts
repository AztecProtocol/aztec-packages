import type { AztecArray, AztecAsyncArray } from './array.js';
import type { Key, StoreSize, Value } from './common.js';
import type { AztecAsyncCounter, AztecCounter } from './counter.js';
import type { AztecAsyncMap, AztecMap } from './map.js';
import type { AztecAsyncMultiMap, AztecMultiMap } from './multi_map.js';
import type { AztecAsyncSet, AztecSet } from './set.js';
import type { AztecAsyncSingleton, AztecSingleton } from './singleton.js';

/** A key-value store */
export interface AztecKVStore {
  syncGetters: true;
  /**
   * Creates a new map.
   * @param name - The name of the map
   * @returns The map
   */
  openMap<K extends Key, V extends Value>(name: string): AztecMap<K, V>;

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
  openMultiMap<K extends Key, V extends Value>(name: string): AztecMultiMap<K, V>;

  /**
   * Creates a new array.
   * @param name - The name of the array
   * @returns The array
   */
  openArray<T extends Value>(name: string): AztecArray<T>;

  /**
   * Creates a new singleton.
   * @param name - The name of the singleton
   * @returns The singleton
   */
  openSingleton<T extends Value>(name: string): AztecSingleton<T>;

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
   * Deletes the store
   */
  delete(): Promise<void>;

  /**
   * Estimates the size of the store in bytes.
   */
  estimateSize(): Promise<StoreSize>;

  /**
   * Closes the store
   */
  close(): Promise<void>;
}

export interface AztecAsyncKVStore {
  /**
   * Creates a new map.
   * @param name - The name of the map
   * @returns The map
   */
  openMap<K extends Key, V extends Value>(name: string): AztecAsyncMap<K, V>;

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
  openMultiMap<K extends Key, V extends Value>(name: string): AztecAsyncMultiMap<K, V>;

  /**
   * Creates a new array.
   * @param name - The name of the array
   * @returns The array
   */
  openArray<T extends Value>(name: string): AztecAsyncArray<T>;

  /**
   * Creates a new singleton.
   * @param name - The name of the singleton
   * @returns The singleton
   */
  openSingleton<T extends Value>(name: string): AztecAsyncSingleton<T>;

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

  /** Clears all entries in the store */
  clear(): Promise<void>;

  /** Deletes the store */
  delete(): Promise<void>;

  /** Estimates the size of the store in bytes. */
  estimateSize(): Promise<StoreSize>;

  /** Closes the store */
  close(): Promise<void>;

  /** Backups the store to the target folder.*/
  backupTo(dstPath: string, compact?: boolean): Promise<void>;
}
