import { commitmentToFields, computeBlobFieldsHash, encodeCheckpointEndMarker } from '@aztec/blob-lib';
import { MAX_U32_VALUE } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { toInlineStrArray } from '@aztec/foundation/testing';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { buildBlobHints } from './block-building-helpers.js';

describe('buildBlobHints', () => {
  it('correctly builds hints for 1 blob', async () => {
    const blobFieldsWithoutEndMarker = Array.from({ length: 5 }, (_, i) => new Fr((i + 123) * MAX_U32_VALUE));

    // The fixtures are used in the checkpoint root rollup tests.
    // It expects the last field to be the checkpoint end marker.
    const blobFields = blobFieldsWithoutEndMarker.concat([
      encodeCheckpointEndMarker({ numBlobFields: blobFieldsWithoutEndMarker.length + 1 }),
    ]);

    const { blobCommitments, blobsHash, blobs } = await buildBlobHints(blobFields);

    expect(blobs.length).toBe(1);
    const onlyBlob = blobs[0];

    expect(blobCommitments.length).toBe(1);
    const blobCommitmentsFields = commitmentToFields(onlyBlob.commitment);
    expect(blobCommitmentsFields).toEqual(blobCommitments[0].toBN254Fields());
    const blobCommitmentStr = onlyBlob.commitment.toString('hex');
    expect(blobCommitmentStr).toMatchInlineSnapshot(
      `"8237b1ff58b30787118558b932c9782f8b6d200543e0d0c63d9466aaf8238cc4226b6d91f1569e91e7353f2686151c4f"`,
    );

    const blobsHashStr = blobsHash.toString();
    expect(blobsHashStr).toMatchInlineSnapshot(`"0x00b2d6078f2e80ca3c09cc955600053d0542e304b5ee4cefac37e554064fe32d"`);

    const blobFieldsHash = await computeBlobFieldsHash(blobFields);
    const challengeZ = await onlyBlob.computeChallengeZ(blobFieldsHash);
    const zStr = challengeZ.toString();
    expect(zStr).toMatchInlineSnapshot(`"0x0a3c46459eb1496fb668371f5a418f65a40c0d35b0aac56585b37d80024c124a"`);

    const proof = await onlyBlob.evaluate(challengeZ, true /* verifyProof */);
    const yStr = proof.y.toString();
    expect(yStr).toMatchInlineSnapshot(`"0x1b1e010b93e259b5f5f51a5d7d75bc99494d94bc221b867eaa938c83c82e679d"`);

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
      'challenge_z_from_ts',
      zStr,
    );
  });
});
