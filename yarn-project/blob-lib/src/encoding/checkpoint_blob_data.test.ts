import { decodeCheckpointBlobData, encodeCheckpointBlobData } from './checkpoint_blob_data.js';
import { makeCheckpointBlobData } from './fixtures.js';

describe('checkpoint blob data', () => {
  it('encode and decode a checkpoint with an empty block', () => {
    const numBlocks = 1;
    const numTxsPerBlock = 0;
    const checkpointBlobData = makeCheckpointBlobData({ numBlocks, numTxsPerBlock });
    const encoded = encodeCheckpointBlobData(checkpointBlobData);
    const decoded = decodeCheckpointBlobData(encoded);
    expect(decoded).toEqual(checkpointBlobData);
  });

  it('encode and decode a checkpoint with a block that has a single tx', () => {
    const numBlocks = 1;
    const numTxsPerBlock = 1;
    const checkpointBlobData = makeCheckpointBlobData({ numBlocks, numTxsPerBlock });
    const encoded = encodeCheckpointBlobData(checkpointBlobData);
    const decoded = decodeCheckpointBlobData(encoded);
    expect(decoded).toEqual(checkpointBlobData);
  });

  it('encode and decode a checkpoint with multiple blocks, each has a single tx', () => {
    const numBlocks = 3;
    const numTxsPerBlock = 1;
    const checkpointBlobData = makeCheckpointBlobData({ numBlocks, numTxsPerBlock });
    const encoded = encodeCheckpointBlobData(checkpointBlobData);
    const decoded = decodeCheckpointBlobData(encoded);
    expect(decoded).toEqual(checkpointBlobData);
  });

  it('encode and decode a checkpoint with multiple blocks, each has multiple txs', () => {
    const numBlocks = 3;
    const numTxsPerBlock = 5;
    const checkpointBlobData = makeCheckpointBlobData({ numBlocks, numTxsPerBlock });
    const encoded = encodeCheckpointBlobData(checkpointBlobData);
    const decoded = decodeCheckpointBlobData(encoded);
    expect(decoded).toEqual(checkpointBlobData);
  });
});
