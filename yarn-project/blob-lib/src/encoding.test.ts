import { TX_START_PREFIX } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import {
  createBlockEndMarker,
  decodeTxStartMarker,
  encodeTxStartMarker,
  getNumBlobFieldsFromTxStartMarker,
  getNumTxsFromBlockEndMarker,
  isBlockEndMarker,
  isValidTxStartMarker,
} from './encoding.js';

describe('tx start marker', () => {
  it('encode and decode correctly', () => {
    const txStartMarker = {
      prefix: TX_START_PREFIX,
      numBlobFields: 5678,
      revertCode: 99,
      numNoteHashes: 11,
      numNullifiers: 22,
      numL2ToL1Msgs: 33,
      numPublicDataWrites: 44,
      numPrivateLogs: 55,
      publicLogsLength: 1234,
      contractClassLogLength: 876,
    };

    const encoded = encodeTxStartMarker(txStartMarker);
    expect(getNumBlobFieldsFromTxStartMarker(encoded)).toBe(txStartMarker.numBlobFields);

    const decoded = decodeTxStartMarker(encoded);
    expect(decoded).toEqual(txStartMarker);
    expect(isValidTxStartMarker(decoded)).toBe(true);

    // AZTEC_GENERATE_TEST_DATA=1 yarn test encoding.test.ts
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/tx_base/components/tx_blob_data.nr',
      'tx_start_marker_from_typescript',
      encoded.toString(),
    );
  });

  it('encode and decode large values correctly', () => {
    const txStartMarker = {
      prefix: TX_START_PREFIX,
      numBlobFields: 0x98765432,
      revertCode: 0x99,
      numNoteHashes: 0x1122,
      numNullifiers: 0x3344,
      numL2ToL1Msgs: 0x5566,
      numPublicDataWrites: 0x7788,
      numPrivateLogs: 0x99aa,
      publicLogsLength: 0x12345678,
      contractClassLogLength: 0xbbcc,
    };

    const encoded = encodeTxStartMarker(txStartMarker);
    expect(getNumBlobFieldsFromTxStartMarker(encoded)).toBe(txStartMarker.numBlobFields);

    const decoded = decodeTxStartMarker(encoded);
    expect(decoded).toEqual(txStartMarker);
    expect(isValidTxStartMarker(decoded)).toBe(true);

    // AZTEC_GENERATE_TEST_DATA=1 yarn test encoding.test.ts
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/tx_base/components/tx_blob_data.nr',
      'large_tx_start_marker_from_typescript',
      encoded.toString(),
    );
  });

  it('can identify incorrect tx start marker', () => {
    const randomField = Fr.random();
    const txStartMarker = decodeTxStartMarker(randomField);
    expect(isValidTxStartMarker(txStartMarker)).toBe(false);
  });
});

describe('block end marker', () => {
  it('encode and decode correctly', () => {
    const numTxs = 5;
    const blockEndMarker = createBlockEndMarker(numTxs);
    expect(isBlockEndMarker(blockEndMarker)).toBe(true);
    expect(getNumTxsFromBlockEndMarker(blockEndMarker)).toBe(numTxs);
  });

  it('can identify incorrect block end marker', () => {
    const randomField = Fr.random();
    expect(isBlockEndMarker(randomField)).toBe(false);

    const blockEndMarker = createBlockEndMarker(5);
    const withExtraValuePrepended = new Fr(blockEndMarker.toBigInt() + 0xf0000000000000000000000000000000n);
    expect(isBlockEndMarker(withExtraValuePrepended)).toBe(false);
  });
});
