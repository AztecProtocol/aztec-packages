import { makeTuple } from '../array/array.js';
import { type Tuple, mapTuple } from './types.js';

describe('tuple', () => {
  it('types mapTuple correctly', () => {
    const tuple: Tuple<number, 3> = makeTuple(3, i => i);
    // @ts-expect-error should not allow an argument of a different type
    mapTuple(tuple, (i: string) => i);

    const mapped: Tuple<string, 3> = mapTuple(tuple, (i: number) => `${i}`);
    expect(mapped).toEqual(['0', '1', '2']);
  });
});
