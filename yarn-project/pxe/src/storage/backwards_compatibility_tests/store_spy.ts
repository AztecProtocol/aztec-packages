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

/** A spied `AztecAsyncKVStore` together with a function that returns the sorted log of `open*()` calls. */
export interface StoreSpy {
  store: AztecAsyncKVStore;
  openedStores: () => OpenedStoreEntry[];
}

/**
 * Wraps an `AztecAsyncKVStore` so every `openMap`/`openMultiMap`/`openArray`/`openSingleton` call is recorded
 * before being delegated to the inner store. `openedStores()` returns a defensive copy sorted by `(name, kind)`,
 * giving callers a stable canonical view suitable for snapshot assertions.
 */
export function createStoreSpy(inner: AztecAsyncKVStore): StoreSpy {
  const entries: OpenedStoreEntry[] = [];

  const store: AztecAsyncKVStore = {
    openMap<K extends Key, V extends Value>(name: string): AztecAsyncMap<K, V> {
      entries.push({ name, kind: 'map' });
      return inner.openMap<K, V>(name);
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
    openSet: name => inner.openSet(name),
    openCounter: name => inner.openCounter(name),
    transactionAsync: callback => inner.transactionAsync(callback),
    clear: () => inner.clear(),
    delete: () => inner.delete(),
    estimateSize: () => inner.estimateSize(),
    close: () => inner.close(),
    backupTo: (dstPath, compact) => inner.backupTo(dstPath, compact),
  };

  const openedStores = () =>
    [...entries].sort((a, b) => (a.name === b.name ? a.kind.localeCompare(b.kind) : a.name.localeCompare(b.name)));

  return { store, openedStores };
}
