import { BLOBS_PER_BLOCK, FIELDS_PER_BLOB } from '@aztec/constants';
import { fromHex } from '@aztec/foundation/bigint-buffer';
import { poseidon2Hash, sha256ToField } from '@aztec/foundation/crypto';
import { BLS12Fr, BLS12Point, Fr } from '@aztec/foundation/fields';
import { toInlineStrArray } from '@aztec/foundation/testing';
import { updateInlineTestData } from '@aztec/foundation/testing/files';
import { fileURLToPath } from '@aztec/foundation/url';

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';

import { getBlobsPerL1Block } from './blob_utils.js';
import { BatchedBlob, Blob, computeBlobFieldsHash } from './index.js';
import { makeEncodedBlobFields } from './testing.js';

// TODO(MW): Remove below file and test? Only required to ensure commiting and compression are correct.
const trustedSetup = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'trusted_setup_bit_reversed.json')).toString(),
);

describe('Blob Batching', () => {
  it.each([10, 100, 400])('our BLS library should correctly commit to a blob of %p items', size => {
    const blobFields = [new Fr(size)].concat(Array.from({ length: size - 1 }).map((_, i) => new Fr(size + i)));
    const ourBlob = Blob.fromFields(blobFields);

    const point = BLS12Point.decompress(ourBlob.commitment);

    // Double check we correctly decompress the commitment
    const recompressed = point.compress();
    expect(recompressed.equals(ourBlob.commitment)).toBeTruthy();

    let commitment = BLS12Point.ZERO;
    const setupG1Points: BLS12Point[] = trustedSetup['g1_lagrange_bit_reversed']
      .slice(0, size)
      .map((s: string) => BLS12Point.decompress(fromHex(s)));

    setupG1Points.forEach((p, i) => {
      commitment = commitment.add(p.mul(BLS12Fr.fromBN254Fr(blobFields[i])));
    });

    expect(commitment.equals(point)).toBeTruthy();
  });

  it('should construct and verify 1 blob', async () => {
    // Initialize 400 fields. This test shows that a single blob works with batching methods.
    const blobFields = Array.from({ length: 400 }, (_, i) => new Fr(i + 123));
    blobFields[0] = new Fr(400); // Change the first field to indicate the total number of fields.
    const blobs = getBlobsPerL1Block(blobFields);
    expect(blobs.length).toBe(1);
    const onlyBlob = blobs[0];

    // Challenge for the final opening (z)
    const finalChallenges = await BatchedBlob.precomputeBatchedBlobChallenges([blobs]);
    const finalZ = finalChallenges.z;
    const finalGamma = finalChallenges.gamma;

    const blobFieldsHash = await computeBlobFieldsHash(blobFields);
    const challengeZ = await onlyBlob.computeChallengeZ(blobFieldsHash);
    expect(challengeZ).toEqual(finalZ);

    // 'Batched' commitment
    const commitment = BLS12Point.decompress(onlyBlob.commitment);

    // 'Batched' evaluation
    const { y, proof } = onlyBlob.evaluate(finalZ);
    const q = BLS12Point.decompress(proof);
    const finalBlobCommitmentsHash = sha256ToField([onlyBlob.commitment]);

    // Challenge gamma
    const hashedEval = await poseidon2Hash(y.toNoirBigNum().limbs.map(Fr.fromHexString));
    const expectedFinalGamma = BLS12Fr.fromBN254Fr(await poseidon2Hash([hashedEval, finalZ]));
    expect(finalGamma).toEqual(expectedFinalGamma);

    const batchedBlob = await BatchedBlob.batch([blobs]);
    expect(batchedBlob.commitment).toEqual(commitment);
    expect(batchedBlob.q).toEqual(q);
    expect(batchedBlob.z).toEqual(finalZ);
    expect(batchedBlob.y).toEqual(y);
    expect(batchedBlob.blobCommitmentsHash).toEqual(finalBlobCommitmentsHash);

    expect(batchedBlob.verify()).toBe(true);

    // If the snapshot has changed, update the noir test data as well.
    expect(y.toString()).toMatchInlineSnapshot(`"0x0c1168bfe6ec3340004b378b92c9e39d0533c2aa0a43e57d5d1423a076506f74"`);

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data.
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/blob/src/blob_batching.nr',
      'kzg_commitment_x_limbs_blob_400_from_ts',
      toInlineStrArray(commitment.x.toNoirBigNum().limbs),
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/blob/src/blob_batching.nr',
      'kzg_commitment_y_limbs_blob_400_from_ts',
      toInlineStrArray(commitment.y.toNoirBigNum().limbs),
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/blob/src/blob_batching.nr',
      'z_blob_400_from_ts',
      finalZ.toString(),
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/blob/src/blob_batching.nr',
      'gamma_limbs_blob_400_from_ts',
      toInlineStrArray(finalGamma.toNoirBigNum().limbs),
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/blob/src/blob_batching.nr',
      'y_limbs_blob_400_from_ts',
      toInlineStrArray(y.toNoirBigNum().limbs),
    );
  });

  it('should construct and verify a batch of BLOBS_PER_BLOCK blobs in a single block', async () => {
    // Initialize enough fields to require BLOBS_PER_BLOCK blobs
    const numFields = FIELDS_PER_BLOB * (BLOBS_PER_BLOCK - 1) + 123;
    const blobFields = Array.from({ length: numFields }, (_, i) => new Fr(456 + i));
    blobFields[0] = new Fr(numFields); // Change the first field to indicate the total number of fields.
    const blobs = getBlobsPerL1Block(blobFields);
    expect(blobs.length).toBe(BLOBS_PER_BLOCK);

    const finalChallenges = await BatchedBlob.precomputeBatchedBlobChallenges([blobs]);

    // Challenge for the final opening (z)
    const blobFieldsHash = await computeBlobFieldsHash(blobFields);
    const zis = await Promise.all(blobs.map(b => b.computeChallengeZ(blobFieldsHash)));
    let finalZ = zis[0];
    for (let i = 1; i < BLOBS_PER_BLOCK; i++) {
      finalZ = await poseidon2Hash([finalZ, zis[i]]);
    }
    expect(finalZ).toEqual(finalChallenges.z);

    // Batched commitment
    const commitments = blobs.map(b => BLS12Point.decompress(b.commitment));

    // Batched evaluation
    // NB: we share the same finalZ between blobs
    const proofObjects = blobs.map(b => b.evaluate(finalZ));
    const evalYs = proofObjects.map(({ y }) => y);
    const qs = proofObjects.map(({ proof }) => BLS12Point.decompress(proof));

    // Challenge gamma
    const evalYsToBLSBignum = evalYs.map(y => y.toNoirBigNum());
    const hashedEvals = await Promise.all(evalYsToBLSBignum.map(e => poseidon2Hash(e.limbs.map(Fr.fromHexString))));
    let evaluationsHash = hashedEvals[0];
    for (let i = 1; i < BLOBS_PER_BLOCK; i++) {
      evaluationsHash = await poseidon2Hash([evaluationsHash, hashedEvals[i]]);
    }
    const finalGamma = BLS12Fr.fromBN254Fr(await poseidon2Hash([evaluationsHash, finalZ]));
    expect(finalGamma).toEqual(finalChallenges.gamma);

    let batchedC = BLS12Point.ZERO;
    let batchedQ = BLS12Point.ZERO;
    let finalY = BLS12Fr.ZERO;
    let powGamma = new BLS12Fr(1n); // Since we start at gamma^0 = 1
    let finalBlobCommitmentsHash: Buffer = Buffer.alloc(0);
    for (let i = 0; i < BLOBS_PER_BLOCK; i++) {
      const cOperand = commitments[i].mul(powGamma);
      const yOperand = evalYs[i].mul(powGamma);
      const qOperand = qs[i].mul(powGamma);
      batchedC = batchedC.add(cOperand);
      batchedQ = batchedQ.add(qOperand);
      finalY = finalY.add(yOperand);
      powGamma = powGamma.mul(finalGamma);
      finalBlobCommitmentsHash = sha256ToField([finalBlobCommitmentsHash, blobs[i].commitment]).toBuffer();
    }

    const batchedBlob = await BatchedBlob.batch([blobs]);
    expect(batchedBlob.commitment).toEqual(batchedC);
    expect(batchedBlob.q).toEqual(batchedQ);
    expect(batchedBlob.z).toEqual(finalZ);
    expect(batchedBlob.y).toEqual(finalY);
    expect(batchedBlob.blobCommitmentsHash.toBuffer()).toEqual(finalBlobCommitmentsHash);

    expect(batchedBlob.verify()).toBe(true);

    // If the snapshot has changed, update the noir test data as well.
    expect(finalY.toString()).toMatchInlineSnapshot(
      `"0x11163d3ed3ccecbc6dbf093e8e7dabcc5a0b6956714bd922f3f75bb37bc1ad7b"`,
    );

    function writeNoirTestData(filePath: string) {
      // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data.
      for (let i = 0; i < BLOBS_PER_BLOCK; i++) {
        updateInlineTestData(
          filePath,
          `kzg_commitment_x_limbs_blob_${i}_from_ts`,
          toInlineStrArray(commitments[i].x.toNoirBigNum().limbs),
        );
        updateInlineTestData(
          filePath,
          `kzg_commitment_y_limbs_blob_${i}_from_ts`,
          toInlineStrArray(commitments[i].y.toNoirBigNum().limbs),
        );
      }
      updateInlineTestData(filePath, `z_${BLOBS_PER_BLOCK}_blobs_from_ts`, finalZ.toString());
      updateInlineTestData(
        filePath,
        `gamma_limbs_${BLOBS_PER_BLOCK}_blobs_from_ts`,
        toInlineStrArray(finalGamma.toNoirBigNum().limbs),
      );
      updateInlineTestData(
        filePath,
        `y_limbs_${BLOBS_PER_BLOCK}_blobs_from_ts`,
        toInlineStrArray(finalY.toNoirBigNum().limbs),
      );
      updateInlineTestData(
        filePath,
        `batched_c_x_limbs_${BLOBS_PER_BLOCK}_blobs_from_ts`,
        toInlineStrArray(batchedC.x.toNoirBigNum().limbs),
      );
      updateInlineTestData(
        filePath,
        `batched_c_y_limbs_${BLOBS_PER_BLOCK}_blobs_from_ts`,
        toInlineStrArray(batchedC.y.toNoirBigNum().limbs),
      );
      updateInlineTestData(
        filePath,
        `blob_commitments_hash_${BLOBS_PER_BLOCK}_blobs_from_ts`,
        batchedBlob.blobCommitmentsHash.toString(),
      );
    }

    writeNoirTestData('noir-projects/noir-protocol-circuits/crates/blob/src/blob_batching.nr');
    writeNoirTestData('noir-projects/noir-protocol-circuits/crates/rollup-lib/src/checkpoint_root/tests/blob_tests.nr');
  });

  it.each([
    3, 5, 10,
    // 32 <- NB Full 32 blocks currently takes around 30s to fully batch
  ])('should construct and verify a batch of blobs over %p blocks', async numBlocks => {
    const blobFieldsPerBlock = Array.from({ length: numBlocks }, () =>
      makeEncodedBlobFields(FIELDS_PER_BLOB * BLOBS_PER_BLOCK),
    );

    const blobs = blobFieldsPerBlock.map(fields => getBlobsPerL1Block(fields));
    // BatchedBlob.batch() performs a verification check:
    await BatchedBlob.batch(blobs);
  });
});

describe('BatchedBlobAccumulator', () => {
  it('clones correctly', async () => {
    const blobFields = Array.from({ length: FIELDS_PER_BLOB }, (_, i) => new Fr(i + 999));
    blobFields[0] = new Fr(FIELDS_PER_BLOB); // Change the first field to indicate the total number of fields.
    const blobs = getBlobsPerL1Block(blobFields);
    const original = await BatchedBlob.newAccumulator([blobs]);

    // Correctly clone the original.
    const clone = original.clone();
    expect(clone).toEqual(original);

    // Make sure we didn't modify the original during the clone.
    const duplicate = await BatchedBlob.newAccumulator([blobs]);
    expect(original).toEqual(duplicate);

    const modified = await clone.accumulateBlobs(blobs);

    expect(clone).toEqual(original);
    expect(modified).not.toEqual(original);
  });
});
