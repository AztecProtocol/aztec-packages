import { TxEffect, TxHash } from '@aztec/circuit-types';
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
    txEffect0.txHash = new TxHash(new Fr(42));
    txEffect0.nullifiers[0] = new Fr(0x123);
    const txEffect1 = TxEffect.empty();
    txEffect1.txHash = new TxHash(new Fr(43));
    txEffect1.noteHashes[0] = new Fr(0x6789);
    txEffect1.nullifiers[0] = new Fr(0x45);
    const { blobFields, blobCommitments, blobsHash, blobs } = buildBlobHints([txEffect0, txEffect1]);

    const blobFields0Str = fieldArrToStr(blobFields.slice(0, 5));
    const blobFields1Str = fieldArrToStr(blobFields.slice(5));
    expect(blobFields.length).toBe(5 + 7);

    expect(blobCommitments.length).toBe(1);
    const blobCommitmentStr = fieldArrToStr(blobCommitments[0]);
    expect(blobCommitmentStr).toMatchInlineSnapshot(
      `"[0x008c32fe581c8fdba12c0d7597911dead2d937d68525bae655508412bb53bb98, 0x0000000000000000000000000000006aaa0680f21270e7d8de4e19da5164f95c]"`,
    );

    const blobsHashStr = blobsHash.toString();
    expect(blobsHashStr).toMatchInlineSnapshot(`"0x00a965619c8668b834755678b32d023b9c5e8588ce449f44f7fa9335455b5cc5"`);

    const publicInputs = BlobPublicInputs.fromBlob(blobs[0]);
    expect(publicInputs.y).toMatchInlineSnapshot(
      `17179655213294173540446545222866729565951946174336496855332549059993428157821n`,
    );
    const zStr = publicInputs.z.toString();
    expect(zStr).toMatchInlineSnapshot(`"0x1f92b871671f27a378d23f1cef10fbd8f0d90dd7172da9e3c3fc1aa745a072c3"`);

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
