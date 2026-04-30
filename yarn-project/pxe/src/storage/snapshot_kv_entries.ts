import type { AztecAsyncArray, AztecAsyncMap, AztecAsyncMultiMap, AztecAsyncSingleton } from '@aztec/kv-store';

/** A single map/multimap entry, rendered as strings for stable snapshotting. */
export type MapEntry = { key: string; value: string };

/** A single array entry, rendered as a string for stable snapshotting. */
export type ArrayEntry = { index: number; value: string };

/**
 * Returns every entry of `map`, with both keys and values rendered as strings, sorted by key. The
 * sort makes the result independent of LMDB's iteration order so snapshots stay stable across
 * runs.
 */
export async function snapshotMap<K, V>(map: AztecAsyncMap<K, V>): Promise<MapEntry[]> {
  const entries: MapEntry[] = [];
  for await (const [k, v] of map.entriesAsync()) {
    entries.push({ key: keyToString(k), value: valueToString(v) });
  }
  return entries.sort(compareMapEntries);
}

/** Returns every `(key, value)` pair of `multiMap`, sorted by key then value for stability. */
export async function snapshotMultiMap<K, V>(multiMap: AztecAsyncMultiMap<K, V>): Promise<MapEntry[]> {
  const entries: MapEntry[] = [];
  for await (const [k, v] of multiMap.entriesAsync()) {
    entries.push({ key: keyToString(k), value: valueToString(v) });
  }
  return entries.sort(compareMapEntries);
}

/** Returns the contents of `array` paired with their numeric indices, in insertion order. */
export async function snapshotArray<V>(array: AztecAsyncArray<V>): Promise<ArrayEntry[]> {
  const entries: ArrayEntry[] = [];
  let index = 0;
  for await (const v of array.valuesAsync()) {
    entries.push({ index: index++, value: valueToString(v) });
  }
  return entries;
}

/** Returns the singleton's value rendered as a string, or `null` if unset. */
export async function snapshotSingleton<V>(singleton: AztecAsyncSingleton<V>): Promise<string | null> {
  const value = await singleton.getAsync();
  return value === undefined ? null : valueToString(value);
}

function compareMapEntries(a: MapEntry, b: MapEntry): number {
  return a.key === b.key ? a.value.localeCompare(b.value) : a.key.localeCompare(b.key);
}

/**
 * Renders a key as a stable string. Buffers and `Uint8Array`s become hex; primitives are tagged
 * with their type prefix so different types can't collide in a snapshot.
 */
function keyToString(k: unknown): string {
  if (typeof k === 'string') {
    return `utf8:${k}`;
  }
  if (typeof k === 'number') {
    return `num:${k}`;
  }
  if (Buffer.isBuffer(k)) {
    return `0x${k.toString('hex')}`;
  }
  if (k instanceof Uint8Array) {
    return `0x${Buffer.from(k).toString('hex')}`;
  }
  if (Array.isArray(k)) {
    return `[${k.map(keyToString).join(',')}]`;
  }
  return JSON.stringify(k);
}

/**
 * Renders a value for snapshotting. Buffers become hex (the on-disk byte view); `Bufferable`
 * values fall back to `value.toBuffer()` so we capture what would have been written. Primitives
 * are tagged like keys so type confusion in a regression shows up rather than aliasing.
 */
function valueToString(v: unknown): string {
  if (Buffer.isBuffer(v)) {
    return v.toString('hex');
  }
  if (v instanceof Uint8Array) {
    return Buffer.from(v).toString('hex');
  }
  if (typeof v === 'number') {
    return `num:${v}`;
  }
  if (typeof v === 'bigint') {
    return `big:${v.toString()}`;
  }
  if (typeof v === 'string') {
    return `utf8:${v}`;
  }
  if (v && typeof (v as { toBuffer?: unknown }).toBuffer === 'function') {
    return (v as { toBuffer: () => Buffer }).toBuffer().toString('hex');
  }
  return JSON.stringify(v);
}
