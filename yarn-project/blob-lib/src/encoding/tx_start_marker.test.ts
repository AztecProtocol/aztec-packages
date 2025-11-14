import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { decodeTxStartMarker, encodeTxStartMarker } from './tx_start_marker.js';

describe('tx start marker', () => {
  it('encode and decode correctly', () => {
    const txStartMarker = {
      numBlobFields: 5678,
      revertCode: 99,
      numNoteHashes: 11,
      numNullifiers: 22,
      numL2ToL1Msgs: 33,
      numPublicDataWrites: 44,
      numPrivateLogs: 55,
      privateLogsLength: 789,
      publicLogsLength: 1234,
      contractClassLogLength: 876,
    };

    const encoded = encodeTxStartMarker(txStartMarker);

    const decoded = decodeTxStartMarker(encoded);
    expect(decoded).toEqual(txStartMarker);

    // AZTEC_GENERATE_TEST_DATA=1 yarn test tx_start_marker.test.ts
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/tx_base/components/tx_blob_data.nr',
      'tx_start_marker_from_typescript',
      encoded.toString(),
    );
  });

  it('encode and decode large values correctly', () => {
    const txStartMarker = {
      numBlobFields: 0x98765432,
      revertCode: 0x99,
      numNoteHashes: 0x1122,
      numNullifiers: 0x3344,
      numL2ToL1Msgs: 0x5566,
      numPublicDataWrites: 0x7788,
      numPrivateLogs: 0x99aa,
      privateLogsLength: 0xddee,
      publicLogsLength: 0x12345678,
      contractClassLogLength: 0xbbcc,
    };

    const encoded = encodeTxStartMarker(txStartMarker);

    const decoded = decodeTxStartMarker(encoded);
    expect(decoded).toEqual(txStartMarker);

    // AZTEC_GENERATE_TEST_DATA=1 yarn test tx_start_marker.test.ts
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/tx_base/components/tx_blob_data.nr',
      'large_tx_start_marker_from_typescript',
      encoded.toString(),
    );
  });
});
