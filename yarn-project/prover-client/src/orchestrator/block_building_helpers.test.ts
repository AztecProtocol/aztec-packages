import { BLS12Point, Fr } from '@aztec/foundation/fields';
import { updateInlineTestData } from '@aztec/foundation/testing/files';
import { TxEffect, TxHash } from '@aztec/stdlib/tx';

import { buildBlobHints, getEmptyBlockBlobsHash } from './block-building-helpers.js';

function fieldArrToStr(arr: Fr[]) {
  return `[${arr.map(f => (f.isZero() ? '0' : f.toString())).join(', ')}]`;
}

describe('buildBlobHints', () => {
  it('correctly builds hints for empty blob fields', async () => {
    const { blobFields, blobCommitments, blobsHash, blobs } = await buildBlobHints([]);

    expect(blobFields).toEqual([]);

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

    const blobCommitmentsFields = blobCommitments[0].toBN254Fields();

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data.
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/block_root/empty_block_root_rollup_inputs.nr',
      'expected_empty_effect_blob_commitment_fields',
      fieldArrToStr(blobCommitmentsFields),
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/block_root/empty_block_root_rollup_inputs.nr',
      'expected_empty_effect_blobs_hash',
      blobsHashStr,
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/block_root/empty_block_root_rollup_inputs.nr',
      'expected_empty_effect_challenge_z',
      zStr,
    );
  });

  it('correctly builds hints for non-empty blob fields', async () => {
    const txEffect0 = TxEffect.empty();
    txEffect0.txHash = new TxHash(new Fr(42));
    txEffect0.nullifiers[0] = new Fr(0x123);
    const txEffect1 = TxEffect.empty();
    txEffect1.txHash = new TxHash(new Fr(43));
    txEffect1.noteHashes[0] = new Fr(0x6789);
    txEffect1.nullifiers[0] = new Fr(0x45);
    const { blobFields, blobCommitments, blobsHash, blobs } = await buildBlobHints([txEffect0, txEffect1]);

    const blobFields0Str = fieldArrToStr(blobFields.slice(0, 5));
    const blobFields1Str = fieldArrToStr(blobFields.slice(5));
    expect(blobFields.length).toBe(5 + 7);

    expect(blobCommitments.length).toBe(1);
    const blobCommitmentStr = blobCommitments[0].compress().toString('hex');
    expect(blobCommitmentStr).toMatchInlineSnapshot(
      `"8c32fe581c8fdba12c0d7597911dead2d937d68525bae655508412bb53bb986aaa0680f21270e7d8de4e19da5164f95c"`,
    );

    const blobsHashStr = blobsHash.toString();
    expect(blobsHashStr).toMatchInlineSnapshot(`"0x00a965619c8668b834755678b32d023b9c5e8588ce449f44f7fa9335455b5cc5"`);

    expect(blobs.length).toBe(1);
    expect(blobs[0].evaluate().y.toString('hex')).toMatchInlineSnapshot(
      `"25fb571bd6a15d4e3a8f6fe199b714c51e1e03ef40366e2e77e5c5733ab9e57d"`,
    );
    const zStr = blobs[0].challengeZ.toString();
    expect(zStr).toMatchInlineSnapshot(`"0x1f92b871671f27a378d23f1cef10fbd8f0d90dd7172da9e3c3fc1aa745a072c3"`);

    const blobCommitmentsFields = blobCommitments[0].toBN254Fields();

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data.
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/block_root/block_root_rollup_inputs.nr',
      'blob_fields_0',
      blobFields0Str,
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/block_root/block_root_rollup_inputs.nr',
      'blob_fields_1',
      blobFields1Str,
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/block_root/block_root_rollup_inputs.nr',
      'expected_blob_commitment_fields_fixture',
      fieldArrToStr(blobCommitmentsFields),
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/block_root/block_root_rollup_inputs.nr',
      'expected_challenge_z_fixture',
      zStr,
    );
  });
});
