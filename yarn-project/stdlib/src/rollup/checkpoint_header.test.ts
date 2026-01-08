import { CHECKPOINT_HEADER_SIZE_IN_BYTES } from '@aztec/constants';
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

    expect(hash).toMatchInlineSnapshot('"0x00d72511e843bf5a2e44e8bd1da20c2626311d1d6679424f717807a1db731d62"');

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/abis/checkpoint_header.nr',
      'empty_checkpoint_header_hash_from_ts',
      hash,
    );
  });

  it('computes hash of non-empty header', () => {
    const header = CheckpointHeader.from({
      lastArchiveRoot: new Fr(123),
      blockHeadersHash: new Fr(456),
      blobsHash: new Fr(77),
      inHash: new Fr(88),
      slotNumber: SlotNumber(1234),
      timestamp: BigInt(5678),
      coinbase: EthAddress.fromField(new Fr(9090)),
      feeRecipient: AztecAddress.fromField(new Fr(101010)),
      gasFees: new GasFees(100, 200),
      totalManaUsed: new Fr(151617),
    });
    const hash = header.hash().toString();

    expect(hash).toMatchInlineSnapshot('"0x00710281705a29930cf34f3470280e346449cd5a5d551177db509d2b5d3a5f21"');

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/abis/checkpoint_header.nr',
      'checkpoint_header_hash_from_ts',
      hash,
    );
  });
});
