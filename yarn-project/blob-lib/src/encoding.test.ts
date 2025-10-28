import { FIELDS_PER_BLOB, TX_START_PREFIX } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import {
  checkBlobFieldsEncoding,
  createBlockEndMarker,
  decodeTxStartMarker,
  encodeTxStartMarker,
  getNumBlobFieldsFromTxStartMarker,
  getNumTxsFromBlockEndMarker,
  isBlockEndMarker,
  isValidTxStartMarker,
} from './encoding.js';
import { makeEncodedBlobFields, makeEncodedBlockBlobFields } from './testing.js';

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

describe('blob fields encoding', () => {
  describe('single block', () => {
    it('can identify correct encoding for single blob', () => {
      const blobFields = makeEncodedBlobFields(7);
      expect(checkBlobFieldsEncoding(blobFields)).toBe(true);
    });

    it('can identify correct encoding for fields across multiple blobs', () => {
      const blobFields = makeEncodedBlobFields(FIELDS_PER_BLOB * 3);
      expect(checkBlobFieldsEncoding(blobFields)).toBe(true);
    });

    it('can identify correct encoding for multiple blocks, each with a single tx', () => {
      const blobFields = [
        new Fr(1 + 7 + 6 + 8),
        makeEncodedBlockBlobFields(7),
        makeEncodedBlockBlobFields(6),
        makeEncodedBlockBlobFields(8),
      ].flat();
      expect(checkBlobFieldsEncoding(blobFields)).toBe(true);
    });

    it('can identify correct encoding for multiple blocks, each with multiple txs', () => {
      const blobFields = [
        new Fr(1 + 7 + 3 + 4 + 6 + 5 + 8 + 4 + 6),
        makeEncodedBlockBlobFields(7, 3, 4),
        makeEncodedBlockBlobFields(6, 5),
        makeEncodedBlockBlobFields(8, 4, 6),
      ].flat();
      expect(checkBlobFieldsEncoding(blobFields)).toBe(true);
    });

    it('can identify correct encoding for empty blocks', () => {
      const blobFields = [
        new Fr(1 + 1 + 1 + 1), // +1 for checkpoint prefix, +1 for each block end marker.
        makeEncodedBlockBlobFields(),
        makeEncodedBlockBlobFields(),
        makeEncodedBlockBlobFields(),
      ].flat();
      expect(checkBlobFieldsEncoding(blobFields)).toBe(true);
    });

    it('can identify incorrect encoding with extra fields', () => {
      const blobFields = makeEncodedBlobFields(7);
      // Add an extra field.
      const withExtraFields = blobFields.concat(new Fr(12));
      expect(checkBlobFieldsEncoding(withExtraFields)).toBe(false);
    });

    it('can identify incorrect encoding with fewer fields than the prefix specifies', () => {
      const blobFields = makeEncodedBlobFields(7);
      // Change the prefix to only allow 6 fields.
      blobFields[0] = new Fr(6);
      expect(checkBlobFieldsEncoding(blobFields)).toBe(false);
    });
  });

  it('can identify incorrect encoding that has a large prefix', () => {
    const blobFields = makeEncodedBlobFields(7);
    blobFields[0] = new Fr(2n ** 64n);
    expect(checkBlobFieldsEncoding(blobFields)).toBe(false);
  });

  it('can identify incorrect encoding that has a random field in the middle', () => {
    const blobFields = [
      new Fr(1 + 7 + 1 + 6),
      makeEncodedBlockBlobFields(7),
      Fr.random(), // A random field.
      makeEncodedBlockBlobFields(6),
    ].flat();
    expect(checkBlobFieldsEncoding(blobFields)).toBe(false);
  });

  it('can identify incorrect encoding that has a mismatch number of txs in the block end marker', () => {
    const blobFields = makeEncodedBlobFields(7);
    // Change the the block end marker (last field) to specify 2 txs instead of 1.
    blobFields[blobFields.length - 1] = createBlockEndMarker(2);
    expect(checkBlobFieldsEncoding(blobFields)).toBe(false);
  });

  it('can identify incorrect encoding that has a mismatch number of txs in the block end marker in the middle', () => {
    const blobFields = [new Fr(1 + 7 + 6 + 8), makeEncodedBlockBlobFields(7, 6)].flat();
    // Change the block end marker (last field) to specify 1 tx instead of 2.
    blobFields[blobFields.length - 1] = createBlockEndMarker(1);
    // Continue to add another block.
    blobFields.push(...makeEncodedBlockBlobFields(8));
    expect(checkBlobFieldsEncoding(blobFields)).toBe(false);
  });

  it('can identify incorrect encoding that has a random tx start marker', () => {
    const blobFields = [new Fr(1 + 7 + 6), makeEncodedBlockBlobFields(7)].flat();
    const block2Fields = makeEncodedBlockBlobFields(6);
    // Change the tx start marker (first field) to be random.
    block2Fields[0] = Fr.random();
    blobFields.push(...block2Fields);
    expect(checkBlobFieldsEncoding(blobFields)).toBe(false);
  });

  it('can identify random fields', () => {
    const blobFields = Array.from({ length: 10 }, () => Fr.random());
    expect(checkBlobFieldsEncoding(blobFields)).toBe(false);
  });
});
