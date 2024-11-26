import { makePrivateBaseStateDiffHints, makePublicBaseStateDiffHints } from '../../tests/factories.js';
import { PrivateBaseStateDiffHints, PublicBaseStateDiffHints } from './state_diff_hints.js';

describe('StateDiffHints', () => {
  it('serializes private hints to buffer and deserializes it back', () => {
    const expected = makePrivateBaseStateDiffHints();
    const buffer = expected.toBuffer();
    const res = PrivateBaseStateDiffHints.fromBuffer(buffer);
    expect(res).toEqual(expected);
  });

  it('serializes public hints to buffer and deserializes it back', () => {
    const expected = makePublicBaseStateDiffHints();
    const buffer = expected.toBuffer();
    const res = PublicBaseStateDiffHints.fromBuffer(buffer);
    expect(res).toEqual(expected);
  });
});
