import { BLOBS_PER_CHECKPOINT, FIELDS_PER_BLOB } from '@aztec/constants';
import { fromHex } from '@aztec/foundation/bigint-buffer';
import { poseidon2Hash, randomInt, sha256ToField } from '@aztec/foundation/crypto';
import { BLS12Fr, BLS12Point, Fr } from '@aztec/foundation/fields';
import { toInlineStrArray } from '@aztec/foundation/testing';
import { updateInlineTestData } from '@aztec/foundation/testing/files';
import { fileURLToPath } from '@aztec/foundation/url';

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';

import { Blob } from './blob.js';
import { BatchedBlob } from './blob_batching.js';
import { getBlobsPerL1Block } from './blob_utils.js';
import { encodeCheckpointEndMarker } from './encoding/checkpoint_end_marker.js';
import { computeBlobFieldsHash } from './hash.js';

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
    const blobs = getBlobsPerL1Block(blobFields);
    expect(blobs.length).toBe(1);
    const onlyBlob = blobs[0];

    // Challenge for the final opening (z)
    const finalChallenges = await BatchedBlob.precomputeBatchedBlobChallenges([blobFields]);
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

    const batchedBlob = await BatchedBlob.batch([blobFields]);
    expect(batchedBlob.commitment).toEqual(commitment);
    expect(batchedBlob.q).toEqual(q);
    expect(batchedBlob.z).toEqual(finalZ);
    expect(batchedBlob.y).toEqual(y);
    expect(batchedBlob.blobCommitmentsHash).toEqual(finalBlobCommitmentsHash);

    expect(batchedBlob.verify()).toBe(true);

    // If the snapshot has changed, update the noir test data as well.
    expect(y.toString()).toMatchInlineSnapshot(`"0x27842c004486b1796de6f1403c71acdba4fc33eee32e4cfe0cb39ef7578a85c6"`);

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data.
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/blob/src/blob_batching.nr',
      'blob_fields_hash_blob_400_from_ts',
      blobFieldsHash.toString(),
    );
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

  it.each([
    [3, 2 * FIELDS_PER_BLOB + 123, '0x0338a65e19e250e80342e1b1c9ea3a5a7edd96a38e51f8550be2a4c5ad587664', false],
    [
      BLOBS_PER_CHECKPOINT,
      BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB,
      '0x04ef3822a4e42167ad10a5665c813bd5cd0a2fedb8ba726d2d1ed4394796a031',
      true,
    ],
  ])(
    'should construct and verify a batch of %p blobs in a single checkpoint',
    async (numBlobs, numBlobFields, expectedFinalY, isCheckpointRootTest) => {
      const blobFields = Array.from({ length: numBlobFields }, (_, i) => new Fr(456 + i));
      if (isCheckpointRootTest) {
        blobFields[numBlobFields - 1] = encodeCheckpointEndMarker({ numBlobFields });
      }

      const blobs = getBlobsPerL1Block(blobFields);
      expect(blobs.length).toBe(numBlobs);

      const finalChallenges = await BatchedBlob.precomputeBatchedBlobChallenges([blobFields]);

      // Challenge for the final opening (z)
      const blobFieldsHash = await computeBlobFieldsHash(blobFields);
      const zis = await Promise.all(blobs.map(b => b.computeChallengeZ(blobFieldsHash)));
      let finalZ = zis[0];
      for (let i = 1; i < numBlobs; i++) {
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
      for (let i = 1; i < numBlobs; i++) {
        evaluationsHash = await poseidon2Hash([evaluationsHash, hashedEvals[i]]);
      }
      const finalGamma = BLS12Fr.fromBN254Fr(await poseidon2Hash([evaluationsHash, finalZ]));
      expect(finalGamma).toEqual(finalChallenges.gamma);

      let batchedC = BLS12Point.ZERO;
      let batchedQ = BLS12Point.ZERO;
      let finalY = BLS12Fr.ZERO;
      let powGamma = new BLS12Fr(1n); // Since we start at gamma^0 = 1
      let finalBlobCommitmentsHash: Buffer = Buffer.alloc(0);
      for (let i = 0; i < numBlobs; i++) {
        const cOperand = commitments[i].mul(powGamma);
        const yOperand = evalYs[i].mul(powGamma);
        const qOperand = qs[i].mul(powGamma);
        batchedC = batchedC.add(cOperand);
        batchedQ = batchedQ.add(qOperand);
        finalY = finalY.add(yOperand);
        powGamma = powGamma.mul(finalGamma);
        finalBlobCommitmentsHash = sha256ToField([finalBlobCommitmentsHash, blobs[i].commitment]).toBuffer();
      }

      const batchedBlob = await BatchedBlob.batch([blobFields]);
      expect(batchedBlob.commitment).toEqual(batchedC);
      expect(batchedBlob.q).toEqual(batchedQ);
      expect(batchedBlob.z).toEqual(finalZ);
      expect(batchedBlob.y).toEqual(finalY);
      expect(batchedBlob.blobCommitmentsHash.toBuffer()).toEqual(finalBlobCommitmentsHash);

      expect(batchedBlob.verify()).toBe(true);

      // If the snapshot has changed, update the noir test data as well.
      expect(finalY.toString()).toMatchInlineSnapshot(`"${expectedFinalY}"`);

      function writeNoirTestData(filePath: string) {
        // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data.
        if (!isCheckpointRootTest) {
          updateInlineTestData(filePath, `blob_fields_hash_${numBlobs}_blobs_from_ts`, blobFieldsHash.toString());
        }
        for (let i = 0; i < numBlobs; i++) {
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
        updateInlineTestData(filePath, `z_${numBlobs}_blobs_from_ts`, finalZ.toString());
        updateInlineTestData(
          filePath,
          `gamma_limbs_${numBlobs}_blobs_from_ts`,
          toInlineStrArray(finalGamma.toNoirBigNum().limbs),
        );
        updateInlineTestData(
          filePath,
          `y_limbs_${numBlobs}_blobs_from_ts`,
          toInlineStrArray(finalY.toNoirBigNum().limbs),
        );
        updateInlineTestData(
          filePath,
          `batched_c_x_limbs_${numBlobs}_blobs_from_ts`,
          toInlineStrArray(batchedC.x.toNoirBigNum().limbs),
        );
        updateInlineTestData(
          filePath,
          `batched_c_y_limbs_${numBlobs}_blobs_from_ts`,
          toInlineStrArray(batchedC.y.toNoirBigNum().limbs),
        );
        updateInlineTestData(
          filePath,
          `blob_commitments_hash_${numBlobs}_blobs_from_ts`,
          batchedBlob.blobCommitmentsHash.toString(),
        );
      }

      if (isCheckpointRootTest) {
        writeNoirTestData(
          'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/checkpoint_root/tests/blob_tests.nr',
        );
      } else {
        writeNoirTestData('noir-projects/noir-protocol-circuits/crates/blob/src/blob_batching.nr');
      }
    },
  );

  it.each([
    3, 5, 10,
    // 32 <- NB Full 32 checkpoints currently takes around 30s to fully batch
  ])('should construct and verify a batch of blobs over %p checkpoints', async numCheckpoints => {
    const blobFieldsPerCheckpoint = Array.from({ length: numCheckpoints }, (_, checkpointIndex) =>
      Array.from(
        { length: 1 + randomInt(FIELDS_PER_BLOB * BLOBS_PER_CHECKPOINT) },
        (_, i) => new Fr(i + checkpointIndex * (FIELDS_PER_BLOB * BLOBS_PER_CHECKPOINT)),
      ),
    );

    const batchedBlob = await BatchedBlob.batch(blobFieldsPerCheckpoint);
    expect(batchedBlob.verify()).toBe(true);
  });
});

describe('BatchedBlobAccumulator', () => {
  it('clones correctly', async () => {
    const blobFields = Array.from({ length: FIELDS_PER_BLOB }, (_, i) => new Fr(i + 999));
    const original = await BatchedBlob.newAccumulator([blobFields]);

    // Correctly clone the original.
    const clone = original.clone();
    expect(clone).toEqual(original);

    // Make sure we didn't modify the original during the clone.
    const duplicate = await BatchedBlob.newAccumulator([blobFields]);
    expect(original).toEqual(duplicate);

    const modified = await clone.accumulateFields(blobFields);

    expect(clone).toEqual(original);
    expect(modified).not.toEqual(original);
  });
});
