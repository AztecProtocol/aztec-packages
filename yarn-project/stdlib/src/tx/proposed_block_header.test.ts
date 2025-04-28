import { PROPOSED_BLOCK_HEADER_LENGTH_BYTES } from '@aztec/constants';
import { setupCustomSnapshotSerializers } from '@aztec/foundation/testing';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { makeHeader } from '../tests/factories.js';
import { ProposedBlockHeader } from './proposed_block_header.js';

describe('ProposedBlockHeader', () => {
  let header: ProposedBlockHeader;

  beforeAll(() => {
    const seed = 9870243;
    setupCustomSnapshotSerializers(expect);
    header = makeHeader(seed, undefined).toPropose();
  });

  it('serializes to buffer and deserializes it back', () => {
    const buffer = header.toBuffer();
    expect(buffer.length).toBe(PROPOSED_BLOCK_HEADER_LENGTH_BYTES);
    const res = ProposedBlockHeader.fromBuffer(buffer);
    expect(res).toEqual(header);
  });

  it('computes hash', () => {
    const hash = header.hash();
    expect(hash).toMatchSnapshot();
  });

  it('computes empty hash', () => {
    const header = ProposedBlockHeader.empty();
    const hash = header.hash();
    expect(hash).toMatchSnapshot();

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/proposed_block_header.nr',
      'test_data_empty_hash',
      hash.toString(),
    );
  });
});
