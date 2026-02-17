import { sleep } from '../sleep/index.js';
import { filter } from './filter.js';

async function* asyncValues(vals: number[] = [0, 1, 2, 3, 4]): AsyncGenerator<number, void, undefined> {
  yield* vals;
}

async function collectAll<T>(iterator: AsyncIterableIterator<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const item of iterator) {
    results.push(item);
  }
  return results;
}

describe('filter async iterator', () => {
  it('should filter all values greater than 2', async () => {
    const res = filter(asyncValues(), val => val > 2);

    expect(res[Symbol.asyncIterator]).toBeTruthy();
    await expect(collectAll(res)).resolves.toEqual([3, 4]);
  });

  it('should filter all values less than 2', async () => {
    const res = filter(asyncValues(), val => val < 2);

    expect(res[Symbol.asyncIterator]).toBeTruthy();
    await expect(collectAll(res)).resolves.toEqual([0, 1]);
  });

  it('should filter all values equal to 2', async () => {
    const res = filter(asyncValues(), val => val === 2);

    expect(res[Symbol.asyncIterator]).toBeTruthy();
    await expect(collectAll(res)).resolves.toEqual([2]);
  });

  it('should return empty array when no values match', async () => {
    const res = filter(asyncValues(), val => val > 10);

    expect(res[Symbol.asyncIterator]).toBeTruthy();
    await expect(collectAll(res)).resolves.toEqual([]);
  });

  it('should return all values when predicate always returns true', async () => {
    const res = filter(asyncValues(), () => true);

    expect(res[Symbol.asyncIterator]).toBeTruthy();
    await expect(collectAll(res)).resolves.toEqual([0, 1, 2, 3, 4]);
  });

  it('should filter with async predicate', async () => {
    const res = filter(asyncValues(), async val => {
      await sleep(1);
      return val > 2;
    });

    expect(res[Symbol.asyncIterator]).toBeTruthy();
    await expect(collectAll(res)).resolves.toEqual([3, 4]);
  });

  it('should filter with async predicate that uses promises', async () => {
    const res = filter(asyncValues(), val => Promise.resolve(val % 2 === 0));

    expect(res[Symbol.asyncIterator]).toBeTruthy();
    await expect(collectAll(res)).resolves.toEqual([0, 2, 4]);
  });

  it('should handle empty iterator', async () => {
    const res = filter(asyncValues([]), val => val > 0);

    expect(res[Symbol.asyncIterator]).toBeTruthy();
    await expect(collectAll(res)).resolves.toEqual([]);
  });

  it('should handle single element iterator', async () => {
    const res = filter(asyncValues([42]), val => val === 42);

    expect(res[Symbol.asyncIterator]).toBeTruthy();
    await expect(collectAll(res)).resolves.toEqual([42]);
  });

  it('should filter complex objects', async () => {
    async function* objectValues() {
      yield { id: 1, active: true };
      yield { id: 2, active: false };
      yield { id: 3, active: true };
    }

    const res = filter(objectValues(), obj => obj.active);

    expect(res[Symbol.asyncIterator]).toBeTruthy();
    const results = await collectAll(res);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ id: 1, active: true });
    expect(results[1]).toEqual({ id: 3, active: true });
  });

  it('should allow predicate to access item properties', async () => {
    async function* stringValues() {
      yield 'hello';
      yield 'world';
      yield 'hi';
    }

    const res = filter(stringValues(), str => str.length > 3);

    expect(res[Symbol.asyncIterator]).toBeTruthy();
    await expect(collectAll(res)).resolves.toEqual(['hello', 'world']);
  });

  it('should handle predicate errors', async () => {
    const res = filter(asyncValues(), () => {
      throw new Error('Predicate error');
    });

    await expect(collectAll(res)).rejects.toThrow('Predicate error');
  });

  it('should handle async predicate errors', async () => {
    const res = filter(asyncValues(), async () => {
      await sleep(1);
      throw new Error('Async predicate error');
    });

    await expect(collectAll(res)).rejects.toThrow('Async predicate error');
  });
});
