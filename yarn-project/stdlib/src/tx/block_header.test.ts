import { BLOCK_HEADER_LENGTH } from '@aztec/constants';
import { randomInt } from '@aztec/foundation/crypto/random';
import { setupCustomSnapshotSerializers } from '@aztec/foundation/testing';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { makeBlockHeader } from '../tests/factories.js';
import { BlockHeader } from './block_header.js';

describe('BlockHeader', () => {
  let header: BlockHeader;

  beforeAll(() => {
    setupCustomSnapshotSerializers(expect);
    header = makeBlockHeader(randomInt(1000));
  });

  it('serializes to buffer and deserializes it back', () => {
    const buffer = header.toBuffer();
    const res = BlockHeader.fromBuffer(buffer);
    expect(res).toEqual(header);
  });

  it('serializes to field array and deserializes it back', () => {
    const fieldArray = header.toFields();
    const res = BlockHeader.fromFields(fieldArray);
    expect(res).toEqual(header);
  });

  it('computes hash', async () => {
    const seed = 9870243;
    const header = makeBlockHeader(seed);
    const hash = await header.hash();
    expect(hash.toString()).toMatchInlineSnapshot(
      `"0x27d0765b4598120655fbb5cb342ba762d26206245213de0f8bf97ae8f69f82ca"`,
    );
  });

  it('number of fields matches constant', () => {
    const fields = header.toFields();
    expect(fields.length).toBe(BLOCK_HEADER_LENGTH);
  });

  it('computes empty hash', async () => {
    const header = BlockHeader.empty();
    const hash = await header.hash();
    expect(hash.toString()).toMatchInlineSnapshot(
      `"0x0bdc537052dea0f80db9698585dff9f32063b86b6d4934ac17c30c81e8e416d3"`,
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/fnd/noir-protocol-circuits/crates/types/src/abis/block_header.nr',
      'test_data_empty_hash',
      hash.toString(),
    );
  });
});
