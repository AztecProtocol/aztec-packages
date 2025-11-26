import { commitmentToFields, computeBlobFieldsHash, encodeCheckpointEndMarker } from '@aztec/blob-lib';
import { MAX_U32_VALUE } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
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

    const { blobCommitments, blobsHash, blobs } = buildBlobHints(blobFields);

    expect(blobs.length).toBe(1);
    const onlyBlob = blobs[0];

    expect(blobCommitments.length).toBe(1);
    const blobCommitmentsFields = commitmentToFields(onlyBlob.commitment);
    expect(blobCommitmentsFields).toEqual(blobCommitments[0].toBN254Fields());
    const blobCommitmentStr = onlyBlob.commitment.toString('hex');
    expect(blobCommitmentStr).toMatchInlineSnapshot(
      `"b6e7a457a8799e584eeac804e0e01d8bc4e1d159ac2a801309b22d1612691ecc97d31a330b5cd07fc78df6ffe5c7c4d6"`,
    );

    const blobsHashStr = blobsHash.toString();
    expect(blobsHashStr).toMatchInlineSnapshot(`"0x0098b965ae031d8ee91534cdd87a14d0edb804397e31ae1daf0ea27fa9c502b9"`);

    const blobFieldsHash = await computeBlobFieldsHash(blobFields);
    const challengeZ = await onlyBlob.computeChallengeZ(blobFieldsHash);
    const zStr = challengeZ.toString();
    expect(zStr).toMatchInlineSnapshot(`"0x214fde23666780cf52da41db2ce5ac67b74907efeecfb183c477063859fd8e4b"`);

    const proof = onlyBlob.evaluate(challengeZ, true /* verifyProof */);
    const yStr = proof.y.toString();
    expect(yStr).toMatchInlineSnapshot(`"0x058c570b7d2911810e7e797a8c242928751ce2385a6591f9884e32b60c27482c"`);

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
