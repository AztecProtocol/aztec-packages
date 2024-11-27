export async function toArray<T>(asyncIterator: AsyncIterableIterator<T>) {
  const arr = [];
  for await (const i of asyncIterator) arr.push(i);
  return arr;
}
