import { TxEffect } from '@aztec/circuit-types';
import { Fr } from '@aztec/circuits.js';
import { BlobPublicInputs } from '@aztec/circuits.js/blobs';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { buildBlobHints } from './block-building-helpers.js';

function fieldArrToStr(arr: Fr[]) {
  return `[${arr.map(f => (f.isZero() ? '0' : f.toString())).join(', ')}]`;
}

describe('buildBlobHints', () => {
  it('correctly builds hints for empty blob fields', () => {
    const { blobFields, blobCommitments, blobsHash, blobs } = buildBlobHints([]);

    expect(blobFields).toEqual([]);

    expect(blobCommitments.length).toBe(1);
    const blobCommitmentStr = fieldArrToStr(blobCommitments[0]);
    expect(blobCommitmentStr).toMatchInlineSnapshot(
      `"[0x00c0000000000000000000000000000000000000000000000000000000000000, 0]"`,
    );

    const blobsHashStr = blobsHash.toString();
    expect(blobsHashStr).toMatchInlineSnapshot(`"0x001cedbd7ea5309ef9d1d159209835409bf41b6b1802597a52fa70cc82e934d9"`);

    const publicInputs = BlobPublicInputs.fromBlob(blobs[0]);
    expect(publicInputs.y).toBe(0n);
    const zStr = publicInputs.z.toString();
    expect(zStr).toMatchInlineSnapshot(`"0x0ac4f3ee53aedc4865073ae7fb664e7401d10eadbe3bbcc266c35059f14826bb"`);

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data.
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/block_root/empty_block_root_rollup_inputs.nr',
      'expected_empty_blob_commitment',
      blobCommitmentStr,
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/block_root/empty_block_root_rollup_inputs.nr',
      'expected_empty_blobs_hash',
      blobsHashStr,
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/block_root/empty_block_root_rollup_inputs.nr',
      'expected_z',
      zStr,
    );
  });

  it('correctly builds hints for non-empty blob fields', () => {
    const txEffect0 = TxEffect.empty();
    txEffect0.nullifiers[0] = new Fr(0x123);
    const txEffect1 = TxEffect.empty();
    txEffect1.noteHashes[0] = new Fr(0x6789);
    txEffect1.nullifiers[0] = new Fr(0x45);
    const { blobFields, blobCommitments, blobsHash, blobs } = buildBlobHints([txEffect0, txEffect1]);

    const blobFields0Str = fieldArrToStr(blobFields.slice(0, 4));
    const blobFields1Str = fieldArrToStr(blobFields.slice(4));
    expect(blobFields.length).toBe(4 + 6);

    expect(blobCommitments.length).toBe(1);
    const blobCommitmentStr = fieldArrToStr(blobCommitments[0]);
    expect(blobCommitmentStr).toMatchInlineSnapshot(
      `"[0x00ad8be66e7276942652627bb00fe1e65dc1c3c6701ab27cc05eff662950071d, 0x00000000000000000000000000000071baf7a9af9757f1d3878b37b438797213]"`,
    );

    const blobsHashStr = blobsHash.toString();
    expect(blobsHashStr).toMatchInlineSnapshot(`"0x00dc577f5c94c82b847693b76ee69cd33d4e5eee3adb6f37d8d7ab662c84725d"`);

    const publicInputs = BlobPublicInputs.fromBlob(blobs[0]);
    expect(publicInputs.y).toBe(11463660905914812112228400842008710735611240877901286242511876802170210355245n);
    const zStr = publicInputs.z.toString();
    expect(zStr).toMatchInlineSnapshot(`"0x1582b354f32263abde313d597582ebceafe17d4e2a68dd47533383e85b4cb780"`);

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
      'expected_blobs_hash',
      blobsHashStr,
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/block_root/block_root_rollup_inputs.nr',
      'expected_blob_commitment',
      blobCommitmentStr,
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/block_root/block_root_rollup_inputs.nr',
      'expected_z',
      zStr,
    );
  });
});
