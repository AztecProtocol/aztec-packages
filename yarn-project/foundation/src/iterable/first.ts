/**
 * Returns the first entry of an iterable, or undefined if it yields none, closing the underlying
 * iterator either way. Use this instead of calling `.next()` once and abandoning the iterator:
 * an abandoned generator never runs its finally blocks, so any resource it holds is leaked — e.g.
 * a kv-store iterator's LMDB cursor, where enough leaks deadlock the store.
 */
export async function first<T>(
  iterator: Iterable<T> | AsyncIterableIterator<T> | AsyncIterable<T> | IterableIterator<T>,
): Promise<T | undefined> {
  for await (const i of iterator) {
    return i;
  }
  return undefined;
}
