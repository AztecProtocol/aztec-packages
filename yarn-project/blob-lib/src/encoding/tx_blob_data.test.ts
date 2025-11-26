import { makeTxBlobData } from './fixtures.js';
import { decodeTxBlobData, encodeTxBlobData, getNumTxBlobFields } from './tx_blob_data.js';

describe('tx blob data', () => {
  it('encode and decode correctly', () => {
    const txBlobData = makeTxBlobData();
    const encoded = encodeTxBlobData(txBlobData);
    const decoded = decodeTxBlobData(encoded);
    expect(decoded).toEqual(txBlobData);
  });

  it('get num tx blob fields correctly', () => {
    const partialTxStartMarker = {
      numNoteHashes: 2,
      numNullifiers: 3,
      numL2ToL1Msgs: 4,
      numPublicDataWrites: 5,
      numPrivateLogs: 6,
      privateLogsLength: 78,
      publicLogsLength: 90,
      contractClassLogLength: 111,
    };
    const numTxBlobFields = getNumTxBlobFields(partialTxStartMarker);
    expect(numTxBlobFields).toEqual(
      3 + // tx start marker + tx hash + transaction fee
        2 +
        3 +
        4 +
        5 * 2 + // *2 for leaf slot and value per public data write
        6 +
        78 +
        90 +
        111 +
        1, // +1 for contract address of the contract class log
    );
  });

  it('get num tx blob fields correctly for tx without contract class log', () => {
    const partialTxStartMarker = {
      numNoteHashes: 2,
      numNullifiers: 3,
      numL2ToL1Msgs: 4,
      numPublicDataWrites: 5,
      numPrivateLogs: 6,
      privateLogsLength: 78,
      publicLogsLength: 90,
      contractClassLogLength: 0,
    };
    const numTxBlobFields = getNumTxBlobFields(partialTxStartMarker);
    expect(numTxBlobFields).toEqual(
      3 + // tx start marker + tx hash + transaction fee
        2 +
        3 +
        4 +
        5 * 2 +
        6 +
        78 +
        90,
    );
  });
});
