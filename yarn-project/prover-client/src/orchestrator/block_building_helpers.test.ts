import { commitmentToFields, computeBlobFieldsHash } from '@aztec/blob-lib';
import { Fr } from '@aztec/foundation/fields';
import { toInlineStrArray } from '@aztec/foundation/testing';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { buildBlobHints } from './block-building-helpers.js';

describe('buildBlobHints', () => {
  it('correctly builds hints for 1 blob', async () => {
    // Only the first field needs to be the actual length of the blob fields. The rest is arbitrary.
    const blobFields = [
      new Fr(11),
      Fr.fromString('0x00000074785f7374617274000000010000000000000000000000000000000004'),
      new Fr(42),
      new Fr(0x2a),
      new Fr(0x123),
      Fr.fromString('0x00000074785f7374617274000100010000000000000000000000000000000005'),
      new Fr(43),
      new Fr(0x3b),
      new Fr(0x6789),
      new Fr(0x45),
      Fr.fromString('0x000000000000000000000000000000000000000000626c6f636b5f656e640002'),
    ];

    const { blobCommitments, blobsHash, blobs } = buildBlobHints(blobFields);

    expect(blobs.length).toBe(1);
    const onlyBlob = blobs[0];

    expect(blobCommitments.length).toBe(1);
    const blobCommitmentsFields = commitmentToFields(onlyBlob.commitment);
    expect(blobCommitmentsFields).toEqual(blobCommitments[0].toBN254Fields());
    const blobCommitmentStr = onlyBlob.commitment.toString('hex');
    expect(blobCommitmentStr).toMatchInlineSnapshot(
      `"8df0325a56d0e4959d5ff1310b8f4e9be4ce318e0c91287de690d12b98782065e0eea216aca5086cb82514e36d660943"`,
    );

    const blobsHashStr = blobsHash.toString();
    expect(blobsHashStr).toMatchInlineSnapshot(`"0x0060acfbd8f99d87a17096a8118c58360c5a20d0db2d4a4a1060bbcc260bd363"`);

    const blobFieldsHash = await computeBlobFieldsHash(blobFields);
    const challengeZ = await onlyBlob.computeChallengeZ(blobFieldsHash);
    const zStr = challengeZ.toString();
    expect(zStr).toMatchInlineSnapshot(`"0x0cfa1559ddd669051b7f6a7158c27c5dea85956d05501aa998210831392e370a"`);

    const proof = onlyBlob.evaluate(challengeZ, true /* verifyProof */);
    const yStr = proof.y.toString();
    expect(yStr).toMatchInlineSnapshot(`"0x26aa329721c5f1626b0d3c12aaa569e2d0f3ba86ed6ec74fbb87bddfa4c12111"`);

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data.
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/checkpoint_root/tests/blob_tests.nr',
      'blob_fields_from_ts',
      toInlineStrArray(blobFields),
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/checkpoint_root/tests/blob_tests.nr',
      'blob_commitment_limbs_x_from_ts',
      toInlineStrArray(blobCommitments[0].x.toNoirBigNum().limbs),
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/checkpoint_root/tests/blob_tests.nr',
      'blob_commitment_limbs_y_from_ts',
      toInlineStrArray(blobCommitments[0].y.toNoirBigNum().limbs),
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/checkpoint_root/tests/blob_tests.nr',
      'blob_commitment_fields_from_ts',
      toInlineStrArray(blobCommitmentsFields),
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/checkpoint_root/tests/blob_tests.nr',
      'challenge_z_from_ts',
      zStr,
    );
  });
});
