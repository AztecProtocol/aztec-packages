import { Fr } from '@aztec/foundation/fields';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import {
  decodeCheckpointEndMarker,
  encodeCheckpointEndMarker,
  isCheckpointEndMarker,
} from './checkpoint_end_marker.js';

describe('checkpoint end marker', () => {
  it('encode and decode correctly', () => {
    const checkpointEndMarker = {
      numBlobFields: 1234,
    };

    const encoded = encodeCheckpointEndMarker(checkpointEndMarker);
    expect(isCheckpointEndMarker(encoded)).toBe(true);

    const decoded = decodeCheckpointEndMarker(encoded);
    expect(decoded).toEqual(checkpointEndMarker);

    // AZTEC_GENERATE_TEST_DATA=1 yarn test checkpoint_end_marker.test.ts
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/blob_data/checkpoint_blob_data.nr',
      'checkpoint_end_marker_from_ts',
      encoded.toString(),
    );
  });

  it('encode and decode large values correctly', () => {
    const checkpointEndMarker = {
      numBlobFields: 0xffffffff,
    };

    const encoded = encodeCheckpointEndMarker(checkpointEndMarker);
    expect(isCheckpointEndMarker(encoded)).toBe(true);

    const decoded = decodeCheckpointEndMarker(encoded);
    expect(decoded).toEqual(checkpointEndMarker);

    // AZTEC_GENERATE_TEST_DATA=1 yarn test checkpoint_end_marker.test.ts
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/blob_data/checkpoint_blob_data.nr',
      'large_checkpoint_end_marker_from_ts',
      encoded.toString(),
    );
  });

  it('can identify incorrect checkpoint end marker', () => {
    const randomField = Fr.random();
    expect(isCheckpointEndMarker(randomField)).toBe(false);
  });
});
