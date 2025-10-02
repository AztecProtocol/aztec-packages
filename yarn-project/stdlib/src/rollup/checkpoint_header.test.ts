import { PROPOSED_BLOCK_HEADER_LENGTH_BYTES } from '@aztec/constants';
import { setupCustomSnapshotSerializers } from '@aztec/foundation/testing';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { makeCheckpointHeader } from '../tests/factories.js';
import { CheckpointHeader } from './checkpoint_header.js';

describe('CheckpointHeader', () => {
  let header: CheckpointHeader;

  beforeAll(() => {
    const seed = 9870243;
    setupCustomSnapshotSerializers(expect);
    header = makeCheckpointHeader(seed);
  });

  it('serializes to buffer and deserializes it back', () => {
    const buffer = header.toBuffer();
    expect(buffer.length).toBe(PROPOSED_BLOCK_HEADER_LENGTH_BYTES);
    const res = CheckpointHeader.fromBuffer(buffer);
    expect(res).toEqual(header);
  });

  it('computes hash', () => {
    const hash = header.hash();
    expect(hash).toMatchSnapshot();
  });

  it('computes empty hash', () => {
    const header = CheckpointHeader.empty();
    const hash = header.hash();
    expect(hash).toMatchSnapshot();

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/abis/checkpoint_header.nr',
      'test_data_empty_hash',
      hash.toString(),
    );
  });
});
