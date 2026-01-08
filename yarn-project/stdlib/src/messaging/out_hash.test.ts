import { AZTEC_MAX_EPOCH_DURATION } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { computeEpochOutHash } from './out_hash.js';

describe('out hash', () => {
  it('computes the out hash for a full epoch', () => {
    const messagesInEpoch = Array.from({ length: AZTEC_MAX_EPOCH_DURATION }, (_, i) => [[[new Fr(i + 123)]]]);

    const outHash = computeEpochOutHash(messagesInEpoch).toString();

    expect(outHash).toMatchInlineSnapshot(`"0x00cac4cadfb6b99199909262a27271d0d84c27a8cdc23e45ac77c6ce031ba732"`);

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data.
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/root/utils/compute_epoch_out_hash.nr',
      'full_epoch_out_hash_from_ts',
      outHash,
    );
  });

  it('produces a zero out hash for an epoch with no txs/messages', () => {
    const outHash = computeEpochOutHash([[], [[], []], [[[]], []]]);
    expect(outHash).toEqual(Fr.ZERO);
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
    // The resulting checkpoint out hashes should match the fixtures in the noir test: [11, 0, 0, 44, 0, 66].

    const outHash = computeEpochOutHash(messagesInEpoch).toString();

    expect(outHash).toMatchInlineSnapshot(`"0x00f83de1d6645701e7faa407066fad314e8c42676338856beb5da9d4062fbb28"`);

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data.
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/root/tests/consecutive_rollups_tests.nr',
      'out_hash_from_ts',
      outHash,
    );
  });
});
