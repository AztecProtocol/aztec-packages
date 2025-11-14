import { decodeBlockBlobData, encodeBlockBlobData } from './block_blob_data.js';
import { makeBlockBlobData } from './fixtures.js';

describe('block blob data', () => {
  it('encode and decode first block', () => {
    const isFirstBlock = true;
    const numTxs = 3;
    const blockBlobData = makeBlockBlobData({ isFirstBlock, numTxs });
    expect(blockBlobData.txs.length).toBe(3);
    expect(blockBlobData.l1ToL2MessageRoot).toBeDefined();

    const encoded = encodeBlockBlobData(blockBlobData);
    const decoded = decodeBlockBlobData(encoded, isFirstBlock);
    expect(decoded).toEqual(blockBlobData);
  });

  it('encode and decode second block', () => {
    const isFirstBlock = false;
    const numTxs = 3;
    const blockBlobData = makeBlockBlobData({ isFirstBlock, numTxs });
    expect(blockBlobData.txs.length).toBe(3);
    expect(blockBlobData.l1ToL2MessageRoot).toBeUndefined();

    const encoded = encodeBlockBlobData(blockBlobData);
    const decoded = decodeBlockBlobData(encoded, isFirstBlock);
    expect(decoded).toEqual(blockBlobData);
  });

  it('does not include l1ToL2MessageRoot if not first block', () => {
    const blockBlobData = makeBlockBlobData({ isFirstBlock: true, numTxs: 3 });
    const { l1ToL2MessageRoot, ...blockBlobDataWithoutL1ToL2MessageRoot } = blockBlobData;
    // l1ToL2MessageRoot exists in the blob data.
    expect(l1ToL2MessageRoot).toBeDefined();

    const encoded = encodeBlockBlobData(blockBlobData);
    // isFirstBlock is false. The l1ToL2MessageRoot should be ignored.
    const decoded = decodeBlockBlobData(encoded, false);
    expect(decoded).toEqual(blockBlobDataWithoutL1ToL2MessageRoot);
  });
});
