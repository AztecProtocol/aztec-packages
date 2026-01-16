export async function toArray<T>(
  iterator: Iterable<T> | AsyncIterableIterator<T> | AsyncIterable<T> | IterableIterator<T>,
): Promise<T[]> {
  const arr = [];
  for await (const i of iterator) {
    arr.push(i);
  }
  return arr;
}
