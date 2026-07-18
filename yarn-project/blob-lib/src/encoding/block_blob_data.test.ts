import { decodeBlockBlobData, encodeBlockBlobData } from './block_blob_data.js';
import { makeBlockBlobData } from './fixtures.js';

describe('block blob data', () => {
  it('encode and decode first block', () => {
    const blockBlobData = makeBlockBlobData({ isFirstBlock: true, numTxs: 3 });
    expect(blockBlobData.txs.length).toBe(3);
    expect(blockBlobData.l1ToL2MessageRoot).toBeDefined();

    const encoded = encodeBlockBlobData(blockBlobData);
    const decoded = decodeBlockBlobData(encoded);
    expect(decoded).toEqual(blockBlobData);
  });

  it('encode and decode non-first block (still carries the l1-to-l2 root)', () => {
    const blockBlobData = makeBlockBlobData({ isFirstBlock: false, numTxs: 3 });
    expect(blockBlobData.txs.length).toBe(3);
    // Every block carries the l1-to-l2 message tree root post-flip (AZIP-22 Fast Inbox).
    expect(blockBlobData.l1ToL2MessageRoot).toBeDefined();

    const encoded = encodeBlockBlobData(blockBlobData);
    const decoded = decodeBlockBlobData(encoded);
    expect(decoded).toEqual(blockBlobData);
  });
});
