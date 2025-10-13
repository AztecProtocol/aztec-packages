import { BLOBS_PER_BLOCK, BLOB_ACCUMULATOR_LENGTH } from '@aztec/constants';
import { timesParallel } from '@aztec/foundation/collection';
import { randomInt } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

import cKzg from 'c-kzg';

import { Blob } from './blob.js';
import { BatchedBlob } from './blob_batching.js';
import { BlobAccumulator, FinalBlobAccumulator } from './blob_batching_public_inputs.js';
import { makeBatchedBlobAccumulator } from './testing.js';

try {
  cKzg.loadTrustedSetup();
} catch (error: any) {
  if (error.message.includes('trusted setup is already loaded')) {
    // NB: The c-kzg lib has no way of checking whether the setup is loaded or not,
    // and it throws an error if it's already loaded, even though nothing is wrong.
    // This is a rudimentary way of ensuring we load the trusted setup if we need it.
  } else {
    throw new Error(error);
  }
}

describe('BlobAccumulator', () => {
  let blobPI: BlobAccumulator;

  beforeAll(() => {
    blobPI = BlobAccumulator.fromBatchedBlobAccumulator(makeBatchedBlobAccumulator(randomInt(1000)));
  });

  it('serializes to buffer and deserializes it back', () => {
    const buffer = blobPI.toBuffer();
    const res = BlobAccumulator.fromBuffer(buffer);
    expect(res).toEqual(blobPI);
  });

  it('serializes to fields and deserializes it back', () => {
    const fields = blobPI.toFields();
    expect(fields.length).toEqual(BLOB_ACCUMULATOR_LENGTH);
    const res = BlobAccumulator.fromFields(fields);
    expect(res).toEqual(blobPI);
  });
});

describe('FinalBlobAccumulator', () => {
  let blobPI: FinalBlobAccumulator;

  beforeAll(() => {
    blobPI = FinalBlobAccumulator.fromBatchedBlobAccumulator(makeBatchedBlobAccumulator(randomInt(1000)));
  });

  it('serializes to buffer and deserializes it back', () => {
    const buffer = blobPI.toBuffer();
    const res = FinalBlobAccumulator.fromBuffer(buffer);
    expect(res).toEqual(blobPI);
  });

  it('converts correctly from BatchedBlob class', async () => {
    const blobs = await timesParallel(BLOBS_PER_BLOCK, i => Blob.fromFields(Array(400).fill(new Fr(i + 1))));
    const batched = await BatchedBlob.batch(blobs);
    const converted = FinalBlobAccumulator.fromBatchedBlob(batched);
    expect(converted.blobCommitmentsHash).toEqual(batched.blobCommitmentsHash);
    expect(converted.z).toEqual(batched.z);
    expect(converted.y).toEqual(batched.y);
    expect(converted.c).toEqual(batched.commitment);
  });
});
