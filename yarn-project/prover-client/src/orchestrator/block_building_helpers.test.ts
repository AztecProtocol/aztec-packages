import { BLS12Field, BLS12Point, Fr } from '@aztec/foundation/fields';
import { updateInlineTestData } from '@aztec/foundation/testing/files';
import { getBlockBlobFields } from '@aztec/stdlib/block';
import { TxEffect, TxHash } from '@aztec/stdlib/tx';

import { buildBlobHints, getEmptyBlockBlobsHash } from './block-building-helpers.js';

function fieldArrToStr(arr: Fr[]) {
  return `[${arr.map(f => (f.isZero() ? '0' : f.toString())).join(', ')}]`;
}

function toLimbsStr(value: BLS12Field) {
  return `[${value.toNoirBigNum().limbs.join(',')}]`;
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
    txEffect0.transactionFee = new Fr(0x2a);
    txEffect0.nullifiers[0] = new Fr(0x123);
    const txEffect1 = TxEffect.empty();
    txEffect1.txHash = new TxHash(new Fr(43));
    txEffect1.transactionFee = new Fr(0x3b);
    txEffect1.noteHashes[0] = new Fr(0x6789);
    txEffect1.nullifiers[0] = new Fr(0x45);
    const blobFields = getBlockBlobFields([txEffect0, txEffect1]);
    expect(blobFields.length).toBe(4 + 5 + 1); // 4 for txEffect0, 5 for txEffect1, 1 for block end marker.
    const { blobCommitments, blobsHash, blobs } = await buildBlobHints(blobFields);

    expect(blobCommitments.length).toBe(1);
    const blobCommitmentStr = blobCommitments[0].compress().toString('hex');
    expect(blobCommitmentStr).toMatchInlineSnapshot(
      `"83967e699979538c822fec25abc302ed41d77f98239e7b801bb8f4702dc823b873d7076f471e8dcf04760b9cbe20af06"`,
    );

    const blobCommitmentsFields = blobCommitments[0].toBN254Fields();

    const blobsHashStr = blobsHash.toString();
    expect(blobsHashStr).toMatchInlineSnapshot(`"0x0018c7a6e90234380346d82755b0dc1708858c5021e505802b4d21d5fb40ef49"`);

    expect(blobs.length).toBe(1);
    expect(blobs[0].evaluate().y.toString('hex')).toMatchInlineSnapshot(
      `"4d6f35646af52331f7aec98f3d68a3174239a39ddbddd958afd18c9268dd33b1"`,
    );
    const zStr = blobs[0].challengeZ.toString();
    expect(zStr).toMatchInlineSnapshot(`"0x2f46cba1320559052e1b547aff62d8dec5703b2925f9126cfea89742607f51bd"`);

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data.
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/checkpoint_root/tests/blob_tests.nr',
      'blob_fields_from_ts',
      fieldArrToStr(blobFields),
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/checkpoint_root/tests/blob_tests.nr',
      'blob_commitment_limbs_x_from_ts',
      toLimbsStr(blobCommitments[0].x),
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/checkpoint_root/tests/blob_tests.nr',
      'blob_commitment_limbs_y_from_ts',
      toLimbsStr(blobCommitments[0].y),
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/checkpoint_root/tests/blob_tests.nr',
      'blob_commitment_fields_from_ts',
      fieldArrToStr(blobCommitmentsFields),
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/checkpoint_root/tests/blob_tests.nr',
      'challenge_z_from_ts',
      zStr,
    );
  });
});
