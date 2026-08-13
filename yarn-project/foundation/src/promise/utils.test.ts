import { sleep } from '../sleep/index.js';
import { allToCompletion, promiseWithResolvers } from './utils.js';

describe('allToCompletion', () => {
  it('resolves with an empty array for no inputs', async () => {
    await expect(allToCompletion([])).resolves.toEqual([]);
  });

  it('resolves with the values in input order', async () => {
    await expect(allToCompletion([Promise.resolve(1), 2, Promise.resolve(3)])).resolves.toEqual([1, 2, 3]);
  });

  it('rejects with the lone failure when a single promise rejects', async () => {
    const error = new Error('lone failure');
    await expect(allToCompletion([Promise.resolve(1), Promise.reject(error)])).rejects.toBe(error);
  });

  it('rejects with an AggregateError holding every failure when several promises reject', async () => {
    const first = new Error('first');
    const second = new Error('second');
    const promise = allToCompletion([Promise.reject(first), Promise.resolve(1), Promise.reject(second)]);
    await expect(promise).rejects.toThrow(AggregateError);
    await expect(promise).rejects.toMatchObject({ errors: [first, second] });
  });

  it('stringifies non-Error reasons in the AggregateError message', async () => {
    const promise = allToCompletion([Promise.reject('boom'), Promise.reject(new Error('second'))]);
    await expect(promise).rejects.toThrow(/boom/);
  });

  it('does not reject until every promise has settled', async () => {
    const { promise: slow, resolve: finishSlow } = promiseWithResolvers<void>();
    let settled = false;
    const result = allToCompletion([Promise.reject(new Error('fast failure')), slow]);
    result.finally(() => (settled = true)).catch(() => {});

    await sleep(1);
    expect(settled).toBe(false);

    finishSlow();
    await expect(result).rejects.toThrow('fast failure');
    expect(settled).toBe(true);
  });
});
