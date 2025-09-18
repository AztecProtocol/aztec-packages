import { BLS12Point, Fr } from '@aztec/foundation/fields';
import { updateInlineTestData } from '@aztec/foundation/testing/files';
import { getBlockBlobFields } from '@aztec/stdlib/block';
import { TxEffect, TxHash } from '@aztec/stdlib/tx';

import { buildBlobHints, getEmptyBlockBlobsHash } from './block-building-helpers.js';

function fieldArrToStr(arr: Fr[]) {
  return `[${arr.map(f => (f.isZero() ? '0' : f.toString())).join(', ')}]`;
}
describe('buildBlobHints', () => {
  it('correctly builds hints for empty blob fields', async () => {
    const { blobCommitments, blobsHash, blobs } = await buildBlobHints([]);
    expect(blobCommitments.length).toBe(1);
    const blobCommitmentStr = blobCommitments[0].compress().toString('hex');
    expect(blobCommitmentStr).toEqual(BLS12Point.COMPRESSED_ZERO.toString('hex'));

    expect(await getEmptyBlockBlobsHash()).toEqual(blobsHash);
    const blobsHashStr = blobsHash.toString();
    expect(blobsHashStr).toMatchInlineSnapshot(`"0x001cedbd7ea5309ef9d1d159209835409bf41b6b1802597a52fa70cc82e934d9"`);

    expect(blobs.length).toBe(1);
    expect(blobs[0].evaluate().y).toEqual(Buffer.alloc(32));
    const zStr = blobs[0].challengeZ.toString();
    expect(zStr).toMatchInlineSnapshot(`"0x0ac4f3ee53aedc4865073ae7fb664e7401d10eadbe3bbcc266c35059f14826bb"`);
  });

  it('correctly builds hints for non-empty blob fields', async () => {
    const txEffect0 = TxEffect.empty();
    txEffect0.txHash = new TxHash(new Fr(42));
    txEffect0.nullifiers[0] = new Fr(0x123);
    const txEffect1 = TxEffect.empty();
    txEffect1.txHash = new TxHash(new Fr(43));
    txEffect1.noteHashes[0] = new Fr(0x6789);
    txEffect1.nullifiers[0] = new Fr(0x45);
    const blobFields = getBlockBlobFields([txEffect0, txEffect1]);
    const { blobCommitments, blobsHash, blobs } = await buildBlobHints(blobFields);

    const blobFields0Str = fieldArrToStr(blobFields.slice(0, 5));
    const blobFields1Str = fieldArrToStr(blobFields.slice(5, -1));
    expect(blobFields.length).toBe(5 + 7 + 1);

    expect(blobCommitments.length).toBe(1);
    const blobCommitmentStr = blobCommitments[0].compress().toString('hex');
    expect(blobCommitmentStr).toMatchInlineSnapshot(
      `"b6a72d9aa6fb01ee6a0dd8a53a734dc499bbe6f88b6b43380878a643b1735825a3a664e9ae3ca778116790bcf988457c"`,
    );

    const blobsHashStr = blobsHash.toString();
    expect(blobsHashStr).toMatchInlineSnapshot(`"0x0099cbfdd6f70f6e0f26f4462998aaadd7c3e36e07b67891d544f0513b3e870d"`);

    expect(blobs.length).toBe(1);
    expect(blobs[0].evaluate().y.toString('hex')).toMatchInlineSnapshot(
      `"6ce7b00c406888c4967abe3108e2387aba885229cccbfbb03981781e08525053"`,
    );
    const zStr = blobs[0].challengeZ.toString();
    expect(zStr).toMatchInlineSnapshot(`"0x1d7ceb7a6a43b63cd57ba894701c9aa5f2f2e6f55aa93200ca95616572eddf56"`);

    const blobCommitmentsFields = blobCommitments[0].toBN254Fields();

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data.
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/checkpoint_root/checkpoint_root_rollup_private_inputs.nr',
      'blob_fields_0',
      blobFields0Str,
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/checkpoint_root/checkpoint_root_rollup_private_inputs.nr',
      'blob_fields_1',
      blobFields1Str,
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/checkpoint_root/checkpoint_root_rollup_private_inputs.nr',
      'expected_blob_commitment_fields_fixture',
      fieldArrToStr(blobCommitmentsFields),
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/checkpoint_root/checkpoint_root_rollup_private_inputs.nr',
      'expected_challenge_z_fixture',
      zStr,
    );
  });
});
