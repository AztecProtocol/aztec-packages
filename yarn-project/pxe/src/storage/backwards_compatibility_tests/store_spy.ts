import type {
  AztecAsyncArray,
  AztecAsyncBinaryMap,
  AztecAsyncCounter,
  AztecAsyncKVStore,
  AztecAsyncMap,
  AztecAsyncMultiMap,
  AztecAsyncSet,
  AztecAsyncSingleton,
  Key,
} from '@aztec/kv-store';

type Value = NonNullable<any>;

/** The kind of named sub-store opened on an `AztecAsyncKVStore`. */
export type StoreKind = 'map' | 'binaryMap' | 'multimap' | 'array' | 'singleton' | 'set' | 'counter';

/** A single recorded `open*()` call against a spied store. */
export interface OpenedStoreEntry {
  name: string;
  kind: StoreKind;
}

/** A spied `AztecAsyncKVStore` together with a function that returns the sorted log of `open*()` calls. */
export interface StoreSpy {
  store: AztecAsyncKVStore;
  getOpenedStores: () => OpenedStoreEntry[];
}

/**
 * Wraps an `AztecAsyncKVStore` so every `openMap`/`openMultiMap`/`openArray`/`openSingleton`/`openSet`/`openCounter`
 * call is recorded before being delegated to the inner store.
 */
export function createStoreSpy(inner: AztecAsyncKVStore): StoreSpy {
  const entries: OpenedStoreEntry[] = [];

  const store: AztecAsyncKVStore = {
    openMap<K extends Key, V extends Value>(name: string): AztecAsyncMap<K, V> {
      entries.push({ name, kind: 'map' });
      return inner.openMap<K, V>(name);
    },
    openBinaryMap(name: string): AztecAsyncBinaryMap {
      entries.push({ name, kind: 'binaryMap' });
      return inner.openBinaryMap(name);
    },
    openMultiMap<K extends Key, V extends Value>(name: string): AztecAsyncMultiMap<K, V> {
      entries.push({ name, kind: 'multimap' });
      return inner.openMultiMap<K, V>(name);
    },
    openArray<T extends Value>(name: string): AztecAsyncArray<T> {
      entries.push({ name, kind: 'array' });
      return inner.openArray<T>(name);
    },
    openSingleton<T extends Value>(name: string): AztecAsyncSingleton<T> {
      entries.push({ name, kind: 'singleton' });
      return inner.openSingleton<T>(name);
    },
    openSet<K extends Key>(name: string): AztecAsyncSet<K> {
      entries.push({ name, kind: 'set' });
      return inner.openSet<K>(name);
    },
    openCounter<K extends Key>(name: string): AztecAsyncCounter<K> {
      entries.push({ name, kind: 'counter' });
      return inner.openCounter<K>(name);
    },
    transactionAsync: callback => inner.transactionAsync(callback),
    clear: () => inner.clear(),
    delete: () => inner.delete(),
    estimateSize: () => inner.estimateSize(),
    close: () => inner.close(),
    backupTo: (dstPath, compact) => inner.backupTo(dstPath, compact),
  };

  const getOpenedStores = () =>
    [...entries].sort((a, b) => (a.name === b.name ? a.kind.localeCompare(b.kind) : a.name.localeCompare(b.name)));

  return { store, getOpenedStores };
}
