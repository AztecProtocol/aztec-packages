import { EMPTY_EPOCH_OUT_HASH, MAX_CHECKPOINTS_PER_EPOCH } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';

import { computeEpochOutHash } from './out_hash.js';

describe('out hash', () => {
  it('computes the out hash for a full epoch', () => {
    const messagesInEpoch = Array.from({ length: MAX_CHECKPOINTS_PER_EPOCH }, (_, i) => [[[new Fr(i + 123)]]]);

    const outHash = computeEpochOutHash(messagesInEpoch).toString();

    expect(outHash).toMatchInlineSnapshot(`"0x008c50251fe5f98286db86e24e87548f77407ad54788bc5d884616bf2ed20397"`);
  });

  it('returns an empty out hash root for an epoch with no txs/messages', () => {
    const outHash = computeEpochOutHash([[], [[], []], [[[]], []]]);
    expect(outHash).toEqual(new Fr(EMPTY_EPOCH_OUT_HASH));
  });

  it('computes the out hash for an epoch with some checkpoints that have no messages', () => {
    const messagesInEpoch = [
      [[[new Fr(11)]]],
      [],
      [[], []],
      [[], [[new Fr(44)]]],
      [[], [[]]],
      [[], [[], [new Fr(66)]], [[]]],
    ];

    const outHash = computeEpochOutHash(messagesInEpoch).toString();

    expect(outHash).toMatchInlineSnapshot(`"0x0001279f68bef9c06b812c7c902b6c050d8f0d963ff12e4a04111145473c0bd5"`);
  });
});
