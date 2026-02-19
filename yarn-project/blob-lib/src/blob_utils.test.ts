import { FIELDS_PER_BLOB } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';

import { decodeCheckpointBlobDataFromBlobs, getBlobsPerL1Block } from './blob_utils.js';
import { encodeCheckpointBlobData } from './encoding/checkpoint_blob_data.js';
import { makeCheckpointBlobData } from './encoding/fixtures.js';
import { BlobDeserializationError } from './errors.js';

describe('blob fields encoding', () => {
  it('can process correct encoding for a single blob', async () => {
    const checkpointBlobData = makeCheckpointBlobData();
    const blobFields = encodeCheckpointBlobData(checkpointBlobData);
    expect(blobFields.length).toBeLessThan(FIELDS_PER_BLOB);

    const blobs = await getBlobsPerL1Block(blobFields);
    expect(blobs.length).toBe(1);

    const decoded = decodeCheckpointBlobDataFromBlobs(blobs);
    expect(decoded).toEqual(checkpointBlobData);
  });

  it('can process correct encoding for multiple blobs', async () => {
    const checkpointBlobData = makeCheckpointBlobData({ numBlocks: 2, numTxsPerBlock: 1, isFullTx: true });
    const blobFields = encodeCheckpointBlobData(checkpointBlobData);
    expect(blobFields.length).toBeGreaterThan(FIELDS_PER_BLOB);

    const blobs = await getBlobsPerL1Block(blobFields);
    expect(blobs.length).toBeGreaterThan(1);

    const decoded = decodeCheckpointBlobDataFromBlobs(blobs);
    expect(decoded).toEqual(checkpointBlobData);
  });

  it('throws processing random blob data', async () => {
    const blobFields = Array.from({ length: 10 }, () => Fr.random());
    const blobs = await getBlobsPerL1Block(blobFields);
    expect(blobs.length).toBe(1);

    expect(() => decodeCheckpointBlobDataFromBlobs(blobs)).toThrow(BlobDeserializationError);
  });
});
