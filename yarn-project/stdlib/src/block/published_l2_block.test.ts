import { jsonStringify } from '@aztec/foundation/json-rpc';
import { randomPublishedL2Block } from '@aztec/stdlib/testing';

import { PublishedL2Block } from './published_l2_block.js';

describe('PublishedL2Block', () => {
  it('convert to and from json', async () => {
    const block = await randomPublishedL2Block(1);
    const parsed = PublishedL2Block.schema.parse(JSON.parse(jsonStringify(block)));
    expect(parsed).toEqual(block);
  });

  it('serializes and deserializes to buffer', async () => {
    const block = await randomPublishedL2Block(1);
    const serialized = block.toBuffer();
    const deserialized = PublishedL2Block.fromBuffer(serialized);
    expect(deserialized).toEqual(block);
  });
});
