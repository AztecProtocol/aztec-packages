import { CHECKPOINT_HEADER_SIZE_IN_BYTES } from '@aztec/constants';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { AztecAddress } from '../aztec-address/index.js';
import { GasFees } from '../gas/gas_fees.js';
import { makeCheckpointHeader } from '../tests/factories.js';
import { ContentCommitment } from '../tx/content_commitment.js';
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

    expect(hash).toMatchInlineSnapshot('"0x007802c95d2f1ade746d97350a18ddbfdb9f5bee2803436917a3cf3d6a685a3a"');

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
      contentCommitment: new ContentCommitment(new Fr(77), new Fr(88), new Fr(99)),
      slotNumber: new Fr(1234),
      timestamp: BigInt(5678),
      coinbase: EthAddress.fromField(new Fr(9090)),
      feeRecipient: AztecAddress.fromField(new Fr(101010)),
      gasFees: new GasFees(100, 200),
      totalManaUsed: new Fr(151617),
    });
    const hash = header.hash().toString();

    expect(hash).toMatchInlineSnapshot('"0x007df45447387f2e48b4acae48b6c7f72eb63a9f6611c2f665df39f013a20dcf"');

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/abis/checkpoint_header.nr',
      'checkpoint_header_hash_from_ts',
      hash,
    );
  });
});
