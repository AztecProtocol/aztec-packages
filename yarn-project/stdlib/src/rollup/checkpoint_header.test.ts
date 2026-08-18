import { CHECKPOINT_HEADER_SIZE_IN_BYTES, MAX_FIELD_VALUE } from '@aztec/constants';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { AztecAddress } from '../aztec-address/index.js';
import { GasFees } from '../gas/gas_fees.js';
import { makeCheckpointHeader } from '../tests/factories.js';
import { CheckpointHeader } from './checkpoint_header.js';

describe('CheckpointHeader', () => {
  it('serializes to buffer and deserializes it back', () => {
    const header = makeCheckpointHeader(9870243);
    const buffer = header.toBuffer();
    expect(buffer.length).toBe(CHECKPOINT_HEADER_SIZE_IN_BYTES);
    const res = CheckpointHeader.fromBuffer(buffer);
    expect(res).toEqual(header);
  });

  it('computes hash of empty header', () => {
    const header = CheckpointHeader.empty();
    const hash = header.hash().toString();

    expect(hash).toMatchInlineSnapshot(`"0x002e384af86a480f952aa16443fd29646a9063865e62d7c403fc7ed697bb7712"`);

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/fnd/noir-protocol-circuits/crates/types/src/abis/checkpoint_header.nr',
      'empty_checkpoint_header_hash_from_ts',
      hash,
    );
  });

  it('computes hash of non-empty header', () => {
    const header = CheckpointHeader.from({
      lastArchiveRoot: new Fr(123),
      blockHeadersHash: new Fr(456),
      blobsHash: new Fr(77),
      inboxRollingHash: new Fr(89),
      epochOutHash: new Fr(99),
      slotNumber: SlotNumber(1234),
      timestamp: BigInt(5678),
      coinbase: EthAddress.fromField(new Fr(9090)),
      feeRecipient: AztecAddress.fromFieldUnsafe(new Fr(101010)),
      gasFees: new GasFees(100, 200),
      totalManaUsed: new Fr(151617),
      accumulatedFees: new Fr(181920),
    });
    const hash = header.hash().toString();

    expect(hash).toMatchInlineSnapshot(`"0x00751391e842cd7b2014478255dd3309df86327197a0feb03f0af1b758f62ba5"`);

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/fnd/noir-protocol-circuits/crates/types/src/abis/checkpoint_header.nr',
      'checkpoint_header_hash_from_ts',
      hash,
    );
  });

  it('computes hash of non-empty header with large values', () => {
    const header = CheckpointHeader.from({
      lastArchiveRoot: new Fr(MAX_FIELD_VALUE - 123n),
      blockHeadersHash: new Fr(MAX_FIELD_VALUE - 456n),
      blobsHash: new Fr(MAX_FIELD_VALUE - 77n),
      inboxRollingHash: new Fr(MAX_FIELD_VALUE - 89n),
      epochOutHash: new Fr(MAX_FIELD_VALUE - 99n),
      slotNumber: SlotNumber(1234),
      timestamp: 2n ** 64n - 1n - 5678n,
      coinbase: EthAddress.fromField(new Fr(2n ** 160n - 1n - 9090n)),
      feeRecipient: AztecAddress.fromFieldUnsafe(new Fr(MAX_FIELD_VALUE - 101010n)),
      gasFees: new GasFees(2n ** 128n - 1n - 100n, 2n ** 128n - 1n - 200n),
      totalManaUsed: new Fr(MAX_FIELD_VALUE - 151617n),
      accumulatedFees: new Fr(MAX_FIELD_VALUE - 181920n),
    });
    // Override the slot number and ignore the type check so it could be the large value same as in the noir test.
    header.slotNumber = (MAX_FIELD_VALUE - 1234n) as any;

    const hash = header.hash().toString();

    expect(hash).toMatchInlineSnapshot(`"0x005bd09725c6e77a4a28a7ccdaf7875ba5882431ca3c82e62db96e8a12769ce5"`);

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/fnd/noir-protocol-circuits/crates/types/src/abis/checkpoint_header.nr',
      'checkpoint_header_hash_large_values_from_ts',
      hash,
    );
  });
});
