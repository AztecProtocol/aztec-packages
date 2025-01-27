export async function toArray<T>(
  iterator: AsyncIterable<T> | AsyncIterableIterator<T> | IterableIterator<T>,
): Promise<T[]> {
  const arr = [];
  for await (const i of iterator) {
    arr.push(i);
  }
  return arr;
}
