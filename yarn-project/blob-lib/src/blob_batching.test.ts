import { BLOBS_PER_BLOCK, FIELDS_PER_BLOB } from '@aztec/constants';
import { fromHex } from '@aztec/foundation/bigint-buffer';
import { poseidon2Hash, randomBigInt, sha256ToField } from '@aztec/foundation/crypto';
import { BLS12Fr, BLS12Point, Fr } from '@aztec/foundation/fields';
import { fileURLToPath } from '@aztec/foundation/url';

import cKzg from 'c-kzg';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';

import { BatchedBlob, Blob } from './index.js';

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

describe('blob', () => {
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
    // Initialise 400 fields. This test shows that a single blob works with batching methods.
    // The values here are used to test Noir's blob evaluation in noir-projects/noir-protocol-circuits/crates/blob/src/blob_batching.nr -> test_400_batched
    const blobItems = Array(400).fill(new Fr(3));
    const blobs = await Blob.getBlobs(blobItems);

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

  it('should construct and verify a batch of 3 full blobs', async () => {
    // The values here are used to test Noir's blob evaluation in noir-projects/noir-protocol-circuits/crates/blob/src/blob_batching.nr -> test_full_blobs_batched
    // Initialise enough fields to require 3 blobs
    const items = [new Fr(3), new Fr(4), new Fr(5)].map(f =>
      new Array(FIELDS_PER_BLOB).fill(f).map((elt, i) => elt.mul(new Fr(i + 1))),
    );
    const blobs = await Blob.getBlobs(items.flat());

    // Challenge for the final opening (z)
    const zis = blobs.map(b => b.challengeZ);
    const finalZ = await poseidon2Hash([await poseidon2Hash([zis[0], zis[1]]), zis[2]]);

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
    const finalGamma = BLS12Fr.fromBN254Fr(
      await poseidon2Hash([
        await poseidon2Hash([await poseidon2Hash([hashedEvals[0], hashedEvals[1]]), hashedEvals[2]]),
        finalZ,
      ]),
    );

    let batchedC = BLS12Point.ZERO;
    let batchedQ = BLS12Point.ZERO;
    let finalY = BLS12Fr.ZERO;
    let powGamma = new BLS12Fr(1n); // Since we start at gamma^0 = 1
    let finalBlobCommitmentsHash: Buffer = Buffer.alloc(0);
    for (let i = 0; i < 3; i++) {
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
  });

  it.each([
    3, 5, 10,
    // 32 <- NB Full 32 blocks currently takes around 30s to fully batch
  ])('should construct and verify a batch of blobs over %p blocks', async blocks => {
    const items = new Array(FIELD_ELEMENTS_PER_BLOB * blocks * BLOBS_PER_BLOCK)
      .fill(Fr.ZERO)
      .map((_, i) => new Fr(BigInt(i) + randomBigInt(120n)));

    const blobs = [];
    for (let i = 0; i < blocks; i++) {
      const start = i * FIELD_ELEMENTS_PER_BLOB * BLOBS_PER_BLOCK;
      blobs.push(...(await Blob.getBlobs(items.slice(start, start + FIELD_ELEMENTS_PER_BLOB * BLOBS_PER_BLOCK))));
    }
    // BatchedBlob.batch() performs a verification check:
    await BatchedBlob.batch(blobs);
  });
});
