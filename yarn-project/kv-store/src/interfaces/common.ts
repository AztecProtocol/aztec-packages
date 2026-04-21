/** The key type for use with the kv-store */
export type Key = string | number | Uint8Array | Array<string | number>;

export type Value = NonNullable<any>;

/** A range of keys of arbitrary type. */
export type CustomRange<K> = {
  /** The key of the first item to include */
  start?: K;
  /** The key of the last item to include */
  end?: K;
  /** Whether to iterate in reverse */
  reverse?: boolean;
  /** The maximum number of items to iterate over */
  limit?: number;
};

/** Maps a custom range into a range of valid key types to iterate over. */
export function mapRange<CK, K extends Key = Key>(range: CustomRange<CK>, mapFn: (key: CK) => K): Range<K> {
  return {
    start: range.start ? mapFn(range.start) : undefined,
    end: range.end ? mapFn(range.end) : undefined,
    reverse: range.reverse,
    limit: range.limit,
  };
}

/** A range of keys to iterate over. */
export type Range<K extends Key = Key> = CustomRange<K>;

export type StoreSize = { mappingSize: number; physicalFileSize: number; actualSize: number; numItems: number };

/** Per-container options for `openMap` / `openMultiMap` / `openSet`. */
export type OpenContainerOptions = {
  /**
   * Hint that the container's keys carry sensitive information and should be obfuscated
   * on disk (HMAC'd) when the backend supports it — currently only the SQLite-OPFS backend
   * with a real encryption cipher. Enabling this disables range queries on the container
   * (HMAC destroys ordering); point lookups and full-iteration remain available.
   *
   * Backends that don't support key obfuscation (LMDB, IndexedDB) silently ignore this
   * flag and store keys in the clear. SQLite-OPFS throws at open time if `opaqueKeys`
   * is set but no cipher was provided to the store.
   */
  opaqueKeys?: boolean;
};
