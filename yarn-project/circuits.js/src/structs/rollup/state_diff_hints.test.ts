import { makePrivateBaseStateDiffHints } from '../../tests/factories.js';
import { PrivateBaseStateDiffHints } from './state_diff_hints.js';

describe('StateDiffHints', () => {
  it('serializes private hints to buffer and deserializes it back', () => {
    const expected = makePrivateBaseStateDiffHints();
    const buffer = expected.toBuffer();
    const res = PrivateBaseStateDiffHints.fromBuffer(buffer);
    expect(res).toEqual(expected);
  });
});
