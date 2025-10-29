import { BLOBS_PER_BLOCK, BLOB_ACCUMULATOR_PUBLIC_INPUTS, FIELDS_PER_BLOB } from '@aztec/constants';
import { randomInt } from '@aztec/foundation/crypto';

import { BatchedBlob } from './blob_batching.js';
import {
  BlobAccumulatorPublicInputs,
  BlockBlobPublicInputs,
  FinalBlobAccumulatorPublicInputs,
} from './blob_batching_public_inputs.js';
import { makeBatchedBlobAccumulator, makeBlockBlobPublicInputs, makeEncodedBlobs } from './testing.js';

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
    const blobs = makeEncodedBlobs(BLOBS_PER_BLOCK * FIELDS_PER_BLOB);
    const batched = await BatchedBlob.batch([blobs]);
    const converted = FinalBlobAccumulatorPublicInputs.fromBatchedBlob(batched);
    expect(converted.blobCommitmentsHash).toEqual(batched.blobCommitmentsHash);
    expect(converted.z).toEqual(batched.z);
    expect(converted.y).toEqual(batched.y);
    expect(converted.c).toEqual(batched.commitment);
  });
});
