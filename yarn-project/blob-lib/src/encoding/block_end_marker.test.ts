import { Fr } from '@aztec/foundation/fields';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { decodeBlockEndMarker, encodeBlockEndMarker, isBlockEndMarker } from './block_end_marker.js';

describe('block end marker', () => {
  it('encode and decode correctly', () => {
    const blockEndMarker = {
      timestamp: 456789n,
      blockNumber: 123,
      numTxs: 99,
    };

    const encoded = encodeBlockEndMarker(blockEndMarker);
    expect(isBlockEndMarker(encoded)).toBe(true);

    const decoded = decodeBlockEndMarker(encoded);
    expect(decoded).toEqual(blockEndMarker);

    // AZTEC_GENERATE_TEST_DATA=1 yarn test block_end_marker.test.ts
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/blob_data/block_blob_data.nr',
      'block_end_marker_from_typescript',
      encoded.toString(),
    );
  });

  it('encode and decode large values correctly', () => {
    const blockEndMarker = {
      timestamp: (1n << 63n) + 567890n,
      blockNumber: 0xabcd1234,
      numTxs: 0xfedc,
    };

    const encoded = encodeBlockEndMarker(blockEndMarker);
    expect(isBlockEndMarker(encoded)).toBe(true);

    const decoded = decodeBlockEndMarker(encoded);
    expect(decoded).toEqual(blockEndMarker);

    // AZTEC_GENERATE_TEST_DATA=1 yarn test block_end_marker.test.ts
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/blob_data/block_blob_data.nr',
      'large_block_end_marker_from_typescript',
      encoded.toString(),
    );
  });

  it('can identify incorrect block end marker', () => {
    const randomField = Fr.random();
    expect(isBlockEndMarker(randomField)).toBe(false);
  });
});
