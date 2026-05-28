/**
 * A map whose keys and values are raw byte buffers. Keys are stored in bytewise (memcmp) order, so a
 * range scan over `entriesAsync` yields entries in raw lexicographic order — useful for composite keys
 * encoded as fixed-width big-endian byte segments.
 */
export interface AztecAsyncBinaryMap {
  /** Sets the value at the given key. Both key and value are stored as raw bytes. */
  set(key: Uint8Array, value: Uint8Array): Promise<void>;

  /** Deletes the value at the given key. */
  delete(key: Uint8Array): Promise<void>;

  /** Returns the value at the given key, or undefined. */
  getAsync(key: Uint8Array): Promise<Uint8Array | undefined>;

  /** Returns true iff the key exists. */
  hasAsync(key: Uint8Array): Promise<boolean>;

  /**
   * Iterates over the map's `(key, value)` entries in bytewise key order, with `start` inclusive and
   * `end` exclusive. Both bounds are raw key buffers (`Uint8Array`). Reverse and limit are supported.
   */
  entriesAsync(range?: BinaryMapRange): AsyncIterableIterator<[Uint8Array, Uint8Array]>;
}

/** A range over raw byte keys. `start` is inclusive, `end` is exclusive. */
export type BinaryMapRange = {
  start?: Uint8Array;
  end?: Uint8Array;
  reverse?: boolean;
  limit?: number;
};
