import type { AztecAsyncArray, AztecAsyncMap, AztecAsyncSingleton, Key } from '@aztec/kv-store';

/**
 * This file contains helpers that produce stable, snapshot-friendly text representations of our kv-stores'
 * contents (map / multimap / array / singleton). Used by the backwards compatibility tests in this directory to
 * fingerprint the bytes PXE persists.
 *
 * Each backwards compatibility schema scenario test follows the same shape:
 *
 * 1. drive the production write path through the store class's public API.
 * 2. re-open the underlying kv-store by name, bypassing the store abstraction layer (eg:
 * `kvStore.openMap<K, Buffer>('foo')`) and snapshot it via the helpers below.
 * 3. compare fresh snapshots with committed ones.
 *
 * Why text rather than buffers: Jest snapshots are stored as JS literals; `Buffer` instances render as the verbose
 * `Buffer <01 02 03>` form, which clutters `.snap` files and resists clean diffs. Each collection's contents are
 * normalized into strings before being fed to `toMatchSnapshot()`.
 */

/** A single map/multimap entry, rendered as strings for stable snapshotting. */
export type MapEntry = { key: string; value: string };

/** A single array entry, rendered as a string for stable snapshotting. */
export type ArrayEntry = { index: number; value: string };

/**
 * Returns every entry of the given map (or multimap), with both keys and values rendered as strings, sorted by key
 * with value as a tiebreaker.
 */
export async function snapshotMap<K extends Key, V>(map: AztecAsyncMap<K, V>): Promise<MapEntry[]> {
  const entries: MapEntry[] = [];
  for await (const [k, v] of map.entriesAsync()) {
    entries.push({ key: keyToString(k), value: valueToString(v) });
  }
  return entries.sort(compareMapEntries);
}

/**
 * Returns the contents of `array` paired with their numeric indices, in insertion order.
 *
 * Unlike {@link snapshotMap}, no sort: arrays are inherently ordered by index and that order *is* part of the schema.
 * The `index` field is preserved on each entry so any unintended reorder shows up in the diff.
 */
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
 * Renders a key as a stable string. Buffers and `Uint8Array`s become `0x`-prefixed hex (matching the canonical byte
 * form used by `Fr.toString()`, `AztecAddress.toString()`, etc. elsewhere in the codebase); primitives carry a type
 * prefix (`utf8:`, `num:`) so that different runtime types can't alias to the same string in a snapshot. Without the
 * prefix, a future change that swapped a `number` key for a `string` of the same digits would be invisible in the
 * diff.
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
 * Renders a value for snapshotting. Same type-prefix discipline as {@link keyToString} so primitives can't
 * accidentally render identically to buffers carrying the same bytes.
 *
 * Resolution order:
 *   1. `Buffer` / `Uint8Array` -> hex. This is the on-disk byte view; the kv-store layer treats these as opaque, so
 *      what we see here is exactly what's persisted.
 *   2. Tagged primitives (`num:`, `big:`, `utf8:`).
 *   3. `Bufferable` fallback: any object with a `.toBuffer()` method renders as `value.toBuffer().toString('hex')`.
 *      Covers stdlib domain types stored without pre-serialization. The canonical byte form is what we want to
 *      fingerprint.
 *   4. `JSON.stringify` for plain objects, matching how the kv-store layer encodes arbitrary structures on disk.
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
