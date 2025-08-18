import { BLOCK_HEADER_LENGTH } from '@aztec/constants';
import { randomInt } from '@aztec/foundation/crypto';
import { setupCustomSnapshotSerializers } from '@aztec/foundation/testing';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { makeHeader } from '../tests/factories.js';
import { BlockHeader } from './block_header.js';

describe('BlockHeader', () => {
  let header: BlockHeader;

  beforeAll(() => {
    setupCustomSnapshotSerializers(expect);
    header = makeHeader(randomInt(1000), undefined);
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
    const header = makeHeader(seed, undefined);
    const hash = await header.hash();
    expect(hash).toMatchSnapshot();
  });

  it('number of fields matches constant', () => {
    const fields = header.toFields();
    expect(fields.length).toBe(BLOCK_HEADER_LENGTH);
  });

  it('computes empty hash', async () => {
    const header = BlockHeader.empty();
    const hash = await header.hash();
    expect(hash).toMatchSnapshot();

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/abis/block_header.nr',
      'test_data_empty_hash',
      hash.toString(),
    );
  });
});
