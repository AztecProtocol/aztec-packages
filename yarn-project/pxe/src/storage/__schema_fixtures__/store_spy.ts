import type {
  AztecAsyncArray,
  AztecAsyncKVStore,
  AztecAsyncMap,
  AztecAsyncMultiMap,
  AztecAsyncSingleton,
} from '@aztec/kv-store';

type Key = string | number | Uint8Array | Array<string | number>;
type Value = NonNullable<any>;

/** The kind of named sub-store opened on an `AztecAsyncKVStore`. */
export type StoreKind = 'map' | 'multimap' | 'array' | 'singleton';

/** A single recorded `open*()` call against a spied store. */
export interface OpenedStoreEntry {
  name: string;
  kind: StoreKind;
}

/** A spied `AztecAsyncKVStore` together with the log of `open*()` calls observed against it. */
export interface StoreSpy {
  store: AztecAsyncKVStore;
  log: OpenedStoreEntry[];
}

/**
 * Wraps an `AztecAsyncKVStore` so every `openMap`/`openMultiMap`/`openArray`/`openSingleton`
 * call is recorded to a log before being delegated to the inner store. Used by the schema
 * compatibility test to enumerate the named sub-stores PXE opens at construction time.
 *
 * All other methods (`openSet`, `openCounter`, `transactionAsync`, `clear`, `delete`,
 * `estimateSize`, `close`, `backupTo`) are delegated directly to the inner store without
 * being recorded.
 */
export function createStoreSpy(inner: AztecAsyncKVStore): StoreSpy {
  const log: OpenedStoreEntry[] = [];

  const store: AztecAsyncKVStore = {
    openMap<K extends Key, V extends Value>(name: string): AztecAsyncMap<K, V> {
      log.push({ name, kind: 'map' });
      return inner.openMap<K, V>(name);
    },
    openMultiMap<K extends Key, V extends Value>(name: string): AztecAsyncMultiMap<K, V> {
      log.push({ name, kind: 'multimap' });
      return inner.openMultiMap<K, V>(name);
    },
    openArray<T extends Value>(name: string): AztecAsyncArray<T> {
      log.push({ name, kind: 'array' });
      return inner.openArray<T>(name);
    },
    openSingleton<T extends Value>(name: string): AztecAsyncSingleton<T> {
      log.push({ name, kind: 'singleton' });
      return inner.openSingleton<T>(name);
    },
    openSet: name => inner.openSet(name),
    openCounter: name => inner.openCounter(name),
    transactionAsync: callback => inner.transactionAsync(callback),
    clear: () => inner.clear(),
    delete: () => inner.delete(),
    estimateSize: () => inner.estimateSize(),
    close: () => inner.close(),
    backupTo: (dstPath, compact) => inner.backupTo(dstPath, compact),
  };

  return { store, log };
}
