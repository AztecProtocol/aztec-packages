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
      '"0x20d46dceda5d61ea884e476bef5ff972557b8a9f5be393bb769c656a3be93367"',
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
      '"0x2332f3e8426f1e4fbf66323836e2de1916d47eeb53feb7d3d09ee30d001374be"',
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/abis/block_header.nr',
      'test_data_empty_hash',
      hash.toString(),
    );
  });
});
