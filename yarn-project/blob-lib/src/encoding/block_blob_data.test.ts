import { decodeBlockBlobData, encodeBlockBlobData } from './block_blob_data.js';
import { makeBlockBlobData } from './fixtures.js';

describe('block blob data', () => {
  it('encodes and decodes a block carrying the l1-to-l2 message root', () => {
    const blockBlobData = makeBlockBlobData({ numTxs: 3 });
    expect(blockBlobData.txs.length).toBe(3);
    // Every block carries the l1-to-l2 message tree root.
    expect(blockBlobData.l1ToL2MessageRoot).toBeDefined();

    const encoded = encodeBlockBlobData(blockBlobData);
    const decoded = decodeBlockBlobData(encoded);
    expect(decoded).toEqual(blockBlobData);
  });
});
