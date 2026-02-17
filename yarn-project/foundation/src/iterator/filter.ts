/** Wraps an async iterable iterator such that it filters values based on a predicate. */
export async function* filter<T>(
  iterator: AsyncIterableIterator<T>,
  predicate: (item: T) => boolean | Promise<boolean>,
): AsyncIterableIterator<T> {
  for await (const item of iterator) {
    if (await predicate(item)) {
      yield item;
    }
  }
}
