import { AZTEC_MAX_EPOCH_DURATION, EMPTY_EPOCH_OUT_HASH } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';

import { computeEpochOutHash } from './out_hash.js';

describe('out hash', () => {
  it('computes the out hash for a full epoch', () => {
    const messagesInEpoch = Array.from({ length: AZTEC_MAX_EPOCH_DURATION }, (_, i) => [[[new Fr(i + 123)]]]);

    const outHash = computeEpochOutHash(messagesInEpoch).toString();

    expect(outHash).toMatchInlineSnapshot(`"0x005d7aadcc96e1b40eff174895314c29d932c57e57e6f5aa2880596664bae4b9"`);
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

    expect(outHash).toMatchInlineSnapshot(`"0x002277ea21b0f438ba7f3badd17a588b5fc119d782d371c4808bbb95e2af335e"`);
  });
});
