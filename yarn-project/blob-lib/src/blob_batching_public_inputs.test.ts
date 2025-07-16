import { BLOBS_PER_BLOCK, BLOB_ACCUMULATOR_PUBLIC_INPUTS } from '@aztec/constants';
import { timesParallel } from '@aztec/foundation/collection';
import { randomInt } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

import cKzg from 'c-kzg';

import { Blob } from './blob.js';
import { BatchedBlob } from './blob_batching.js';
import {
  BlobAccumulatorPublicInputs,
  BlockBlobPublicInputs,
  FinalBlobAccumulatorPublicInputs,
} from './blob_batching_public_inputs.js';
import { makeBatchedBlobAccumulator, makeBlockBlobPublicInputs } from './testing.js';

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

describe('BlockBlobPublicInputs', () => {
  let blobPI: BlockBlobPublicInputs;

  beforeAll(() => {
    blobPI = makeBlockBlobPublicInputs(randomInt(1000));
  });

  it('serializes to buffer and deserializes it back', () => {
    const buffer = blobPI.toBuffer();
    const res = BlockBlobPublicInputs.fromBuffer(buffer);
    expect(res).toEqual(blobPI);
  });
});

describe('BlobAccumulatorPublicInputs', () => {
  let blobPI: BlobAccumulatorPublicInputs;

  beforeAll(() => {
    blobPI = BlobAccumulatorPublicInputs.fromBatchedBlobAccumulator(makeBatchedBlobAccumulator(randomInt(1000)));
  });

  it('serializes to buffer and deserializes it back', () => {
    const buffer = blobPI.toBuffer();
    const res = BlobAccumulatorPublicInputs.fromBuffer(buffer);
    expect(res).toEqual(blobPI);
  });

  it('serializes to fields and deserializes it back', () => {
    const fields = blobPI.toFields();
    expect(fields.length).toEqual(BLOB_ACCUMULATOR_PUBLIC_INPUTS);
    const res = BlobAccumulatorPublicInputs.fromFields(fields);
    expect(res).toEqual(blobPI);
  });
});

describe('FinalBlobAccumulatorPublicInputs', () => {
  let blobPI: FinalBlobAccumulatorPublicInputs;

  beforeAll(() => {
    blobPI = FinalBlobAccumulatorPublicInputs.fromBatchedBlobAccumulator(makeBatchedBlobAccumulator(randomInt(1000)));
  });

  it('serializes to buffer and deserializes it back', () => {
    const buffer = blobPI.toBuffer();
    const res = FinalBlobAccumulatorPublicInputs.fromBuffer(buffer);
    expect(res).toEqual(blobPI);
  });

  it('converts correctly from BatchedBlob class', async () => {
    const blobs = await timesParallel(BLOBS_PER_BLOCK, i => Blob.fromFields(Array(400).fill(new Fr(i + 1))));
    const batched = await BatchedBlob.batch(blobs);
    const converted = FinalBlobAccumulatorPublicInputs.fromBatchedBlob(batched);
    expect(converted.blobCommitmentsHash).toEqual(batched.blobCommitmentsHash);
    expect(converted.z).toEqual(batched.z);
    expect(converted.y).toEqual(batched.y);
    expect(converted.c).toEqual(batched.commitment);
  });
});
