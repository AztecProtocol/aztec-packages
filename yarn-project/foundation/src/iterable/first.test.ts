import { first } from './index.js';

describe('first iterable', () => {
  it('returns the first entry of a sync iterable', async () => {
    await expect(first([3, 2, 1])).resolves.toEqual(3);
  });

  it('returns the first entry of an async iterable', async () => {
    const generator = (async function* (): AsyncGenerator<number, void, undefined> {
      yield* [3, 2, 1];
    })();

    await expect(first(generator)).resolves.toEqual(3);
  });

  it('returns undefined on an empty iterable', async () => {
    await expect(first([])).resolves.toBeUndefined();
    await expect(
      first(
        (async function* (): AsyncGenerator<number, void, undefined> {
          /* yields nothing */
        })(),
      ),
    ).resolves.toBeUndefined();
  });

  it('closes the underlying iterator after consuming the first entry', async () => {
    let closed = false;
    const generator = (async function* (): AsyncGenerator<number, void, undefined> {
      try {
        yield* [3, 2, 1];
      } finally {
        closed = true;
      }
    })();

    await expect(first(generator)).resolves.toEqual(3);
    expect(closed).toBe(true);
  });
});
