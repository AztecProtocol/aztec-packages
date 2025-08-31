import { BLOBS_PER_BLOCK, FIELDS_PER_BLOB } from '@aztec/constants';
import { fromHex } from '@aztec/foundation/bigint-buffer';
import { poseidon2Hash, randomInt, sha256ToField } from '@aztec/foundation/crypto';
import { BLS12Fr, BLS12Point, Fr } from '@aztec/foundation/fields';
import { fileURLToPath } from '@aztec/foundation/url';

import cKzg from 'c-kzg';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';

import { BatchedBlob, BatchedBlobAccumulator, Blob } from './index.js';

// TODO(MW): Remove below file and test? Only required to ensure commiting and compression are correct.
const trustedSetup = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'trusted_setup_bit_reversed.json')).toString(),
);

// Importing directly from 'c-kzg' does not work:
const { FIELD_ELEMENTS_PER_BLOB, computeKzgProof, loadTrustedSetup, verifyKzgProof } = cKzg;

try {
  loadTrustedSetup();
} catch (error: any) {
  if (error.message.includes('trusted setup is already loaded')) {
    // NB: The c-kzg lib has no way of checking whether the setup is loaded or not,
    // and it throws an error if it's already loaded, even though nothing is wrong.
    // This is a rudimentary way of ensuring we load the trusted setup if we need it.
  } else {
    throw new Error(error);
  }
}

describe('Blob Batching', () => {
  it.each([10, 100, 400])('our BLS library should correctly commit to a blob of %p items', async size => {
    const blobItems: Fr[] = Array(size).fill(new Fr(size + 1));
    const ourBlob = await Blob.fromFields(blobItems);

    const point = BLS12Point.decompress(ourBlob.commitment);

    // Double check we correctly decompress the commitment
    const recompressed = point.compress();
    expect(recompressed.equals(ourBlob.commitment)).toBeTruthy();

    let commitment = BLS12Point.ZERO;
    const setupG1Points: BLS12Point[] = trustedSetup['g1_lagrange_bit_reversed']
      .slice(0, size)
      .map((s: string) => BLS12Point.decompress(fromHex(s)));

    setupG1Points.forEach((p, i) => {
      commitment = commitment.add(p.mul(BLS12Fr.fromBN254Fr(blobItems[i])));
    });

    expect(commitment.equals(point)).toBeTruthy();
  });

  it('should construct and verify a batched blob of 400 items', async () => {
    // Initialize 400 fields. This test shows that a single blob works with batching methods.
    // The values here are used to test Noir's blob evaluation in noir-projects/noir-protocol-circuits/crates/blob/src/blob_batching.nr -> test_400_batched
    const blobItems = Array(400).fill(new Fr(3));
    const blobs = await Blob.getBlobsPerBlock(blobItems);

    // Challenge for the final opening (z)
    const zis = blobs.map(b => b.challengeZ);
    const finalZ = zis[0];

    // 'Batched' commitment
    const commitments = blobs.map(b => BLS12Point.decompress(b.commitment));

    // 'Batched' evaluation
    const proofObjects = blobs.map(b => computeKzgProof(b.data, finalZ.toBuffer()));
    const evalYs = proofObjects.map(p => BLS12Fr.fromBuffer(Buffer.from(p[1])));
    const qs = proofObjects.map(p => BLS12Point.decompress(Buffer.from(p[0])));

    // Challenge gamma
    const evalYsToBLSBignum = evalYs.map(y => y.toNoirBigNum());
    const hashedEvals = await Promise.all(evalYsToBLSBignum.map(e => poseidon2Hash(e.limbs.map(Fr.fromHexString))));
    const finalGamma = BLS12Fr.fromBN254Fr(await poseidon2Hash([hashedEvals[0], zis[0]]));

    let batchedC = BLS12Point.ZERO;
    let batchedQ = BLS12Point.ZERO;
    let finalY = BLS12Fr.ZERO;
    let powGamma = new BLS12Fr(1n); // Since we start at gamma^0 = 1
    let finalBlobCommitmentsHash: Buffer = Buffer.alloc(0);
    for (let i = 0; i < blobs.length; i++) {
      const cOperand = commitments[i].mul(powGamma);
      const yOperand = evalYs[i].mul(powGamma);
      const qOperand = qs[i].mul(powGamma);
      batchedC = batchedC.add(cOperand);
      batchedQ = batchedQ.add(qOperand);
      finalY = finalY.add(yOperand);
      powGamma = powGamma.mul(finalGamma);
      finalBlobCommitmentsHash = sha256ToField([finalBlobCommitmentsHash, blobs[i].commitment]).toBuffer();
    }

    expect(batchedC.equals(commitments[0])).toBeTruthy();
    expect(finalY.equals(evalYs[0])).toBeTruthy();
    expect(finalBlobCommitmentsHash.equals(sha256ToField([blobs[0].commitment]).toBuffer())).toBeTruthy();

    const batchedBlob = await BatchedBlob.batch(blobs);

    expect(batchedC.equals(batchedBlob.commitment)).toBeTruthy();
    expect(batchedQ.equals(batchedBlob.q)).toBeTruthy();
    expect(finalZ.equals(batchedBlob.z)).toBeTruthy();
    expect(finalY.equals(batchedBlob.y)).toBeTruthy();
    expect(finalBlobCommitmentsHash.equals(batchedBlob.blobCommitmentsHash.toBuffer())).toBeTruthy();

    const isValid = verifyKzgProof(batchedC.compress(), finalZ.toBuffer(), finalY.toBuffer(), batchedQ.compress());
    expect(isValid).toBe(true);
  });

  it('should construct and verify a batch of BLOBS_PER_BLOCK full blobs', async () => {
    // The values here are used to test Noir's blob evaluation in noir-projects/noir-protocol-circuits/crates/blob/src/blob_batching.nr -> test_full_blobs_batched
    // Initialize enough fields to require 6 blobs
    const items = Array.from({ length: BLOBS_PER_BLOCK }, (_, i) =>
      Array.from({ length: FIELDS_PER_BLOB }, (_, j) => new Fr(3 + i).mul(new Fr(j + 1))),
    );
    const blobs = await Blob.getBlobsPerBlock(items.flat());

    // Challenge for the final opening (z)
    const zis = blobs.map(b => b.challengeZ);
    if (BLOBS_PER_BLOCK < 2) {
      // just because of how we're constructing this test.
      throw new Error('This test assumes BLOBS_PER_BLOCK >= 2. Please update the test.');
    }
    let finalZ = await poseidon2Hash([zis[0], zis[1]]);
    for (let i = 2; i < BLOBS_PER_BLOCK; i++) {
      finalZ = await poseidon2Hash([finalZ, zis[i]]);
    }

    // Batched commitment
    const commitments = blobs.map(b => BLS12Point.decompress(b.commitment));

    // Batched evaluation
    // NB: we share the same finalZ between blobs
    const proofObjects = blobs.map(b => computeKzgProof(b.data, finalZ.toBuffer()));
    const evalYs = proofObjects.map(p => BLS12Fr.fromBuffer(Buffer.from(p[1])));
    const qs = proofObjects.map(p => BLS12Point.decompress(Buffer.from(p[0])));

    // Challenge gamma
    const evalYsToBLSBignum = evalYs.map(y => y.toNoirBigNum());
    const hashedEvals = await Promise.all(evalYsToBLSBignum.map(e => poseidon2Hash(e.limbs.map(Fr.fromHexString))));

    let tempGamma = await poseidon2Hash([hashedEvals[0], hashedEvals[1]]);
    for (let i = 2; i < BLOBS_PER_BLOCK; i++) {
      tempGamma = await poseidon2Hash([tempGamma, hashedEvals[i]]);
    }
    const finalGamma = BLS12Fr.fromBN254Fr(await poseidon2Hash([tempGamma, finalZ]));

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

    const batchedBlob = await BatchedBlob.batch(blobs);

    expect(batchedC.equals(batchedBlob.commitment)).toBeTruthy();
    expect(batchedQ.equals(batchedBlob.q)).toBeTruthy();
    expect(finalZ.equals(batchedBlob.z)).toBeTruthy();
    expect(finalY.equals(batchedBlob.y)).toBeTruthy();
    expect(finalBlobCommitmentsHash.equals(batchedBlob.blobCommitmentsHash.toBuffer())).toBeTruthy();

    const isValid = verifyKzgProof(batchedC.compress(), finalZ.toBuffer(), finalY.toBuffer(), batchedQ.compress());
    expect(isValid).toBe(true);

    // Used to print test constants for `blob_batching.nr` - `test_full_blobs_batched`.
    // Uncomment to generate test data:
    // printTestData(commitments, finalZ, finalGamma, finalY, batchedC, finalBlobCommitmentsHash);
  });

  it.each([
    3, 5, 10,
    // 32 <- NB Full 32 blocks currently takes around 30s to fully batch
  ])('should construct and verify a batch of blobs over %p blocks', async blocks => {
    const items = new Array(FIELD_ELEMENTS_PER_BLOB * blocks * BLOBS_PER_BLOCK)
      .fill(Fr.ZERO)
      .map((_, i) => new Fr(i + randomInt(120)));

    const blobs = [];
    for (let i = 0; i < blocks; i++) {
      const start = i * FIELD_ELEMENTS_PER_BLOB * BLOBS_PER_BLOCK;
      blobs.push(
        ...(await Blob.getBlobsPerBlock(items.slice(start, start + FIELD_ELEMENTS_PER_BLOB * BLOBS_PER_BLOCK))),
      );
    }
    // BatchedBlob.batch() performs a verification check:
    await BatchedBlob.batch(blobs);
  });
});

// Uncomment to generate test data:
// // Used to create the test data for `blob_batching.nr` - `test_full_blobs_batched`.
// function formatCommitments(commitments: BLS12Point[]) {
//   return (
//     "[\n" +
//     commitments
//       .map(c => {
//         const xLimbs = c.x.toNoirBigNum().limbs.map(l => `        ${l},`).join("\n");
//         const yLimbs = c.y.toNoirBigNum().limbs.map(l => `        ${l},`).join("\n");
//         return `    BatchingBlobCommitment::from_limbs(
//         [
// ${xLimbs}
//         ],
//         [
// ${yLimbs}
//         ],
//     )
//         .point`;
//       })
//       .join(",\n") +
//     "\n];"
//   );
// }

// // Used to create the test data for `blob_batching.nr` - `test_full_blobs_batched`.
// function formatBLS12Fr(f: BLS12Fr) {
//   const noirBigNum = f.toNoirBigNum();
//   return `
//   [
// ${noirBigNum.limbs.map(l => `    ${l},`).join("\n")}
//   ]`;
// }

// // Prints the test data for `blob_batching.nr` - `test_full_blobs_batched`.
// function printTestData(commitments: BLS12Point[], finalZ: Fr, finalGamma: BLS12Fr, finalY: BLS12Fr, batchedC: BLS12Point, blobCommitmentsHash: Buffer<ArrayBufferLike>) {
//   console.log("kzg_commitments_in:", formatCommitments(commitments));
//   console.log("z:", finalZ);
//   console.log("gamma:", formatBLS12Fr(finalGamma));
//   console.log("expected_y (for comment):", finalY);
//   console.log("expected_y:", formatBLS12Fr(finalY));
//   console.log("expected_c (for comment):", batchedC);
//   console.log("expected_c", formatCommitments([batchedC]));
//   console.log("blobCommitmentsHash", Fr.fromBuffer(blobCommitmentsHash))
// }

describe('BatchedBlobAccumulator', () => {
  let acc: BatchedBlobAccumulator;
  let blobs: Blob[];

  beforeAll(async () => {
    const items = new Array(FIELD_ELEMENTS_PER_BLOB * BLOBS_PER_BLOCK)
      .fill(Fr.ZERO)
      .map((_, i) => new Fr(i + randomInt(120)));
    blobs = await Blob.getBlobsPerBlock(items);
    acc = await BatchedBlob.newAccumulator(blobs);
  });

  it('clones correctly', async () => {
    const clone = acc.clone();
    expect(acc).toEqual(clone);
    const modified = await clone.accumulate(blobs[0]);
    expect(acc).not.toEqual(modified);
  });
});
