import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';

import { BlockHash } from './block_hash.js';
import { type BlockParameter, BlockParameterSchema } from './block_parameter.js';

describe('BlockParameterSchema', () => {
  it.each<[string, BlockParameter]>([
    ['number', BlockNumber(7)],
    ['BlockHash', BlockHash.fromBuffer(Buffer.alloc(32, 1))],
    ['tag latest', 'latest'],
    ['tag proposed', 'proposed'],
    ['tag checkpointed', 'checkpointed'],
    ['tag proven', 'proven'],
    ['tag finalized', 'finalized'],
    ['{ number }', { number: BlockNumber(7) }],
    ['{ hash }', { hash: BlockHash.fromBuffer(Buffer.alloc(32, 1)) }],
    ['{ archive }', { archive: new Fr(123) }],
    ['{ tag }', { tag: 'proven' }],
  ])('roundtrips %s', (_, param) => {
    const json = JSON.parse(JSON.stringify(param));
    const parsed = BlockParameterSchema.parse(json);
    expect(parsed).toEqual(param);
  });

  it('parses a 32-byte hex string as a BlockHash, never coercing it to a JS number', () => {
    const blockHash = BlockHash.fromBuffer(Buffer.alloc(32, 0x07));
    const wire = blockHash.toString();
    const parsed = BlockParameterSchema.parse(wire);
    expect(BlockHash.isBlockHash(parsed)).toBe(true);
    expect((parsed as BlockHash).toString()).toEqual(wire);
  });

  it('rejects huge JS numbers (above MAX_SAFE_INTEGER) for block-number parsing', () => {
    expect(BlockParameterSchema.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(false);
  });

  it('rejects negative numbers', () => {
    expect(BlockParameterSchema.safeParse(-1).success).toBe(false);
  });

  it('rejects non-integer numbers', () => {
    expect(BlockParameterSchema.safeParse(1.5).success).toBe(false);
  });

  it('rejects unknown tags', () => {
    expect(BlockParameterSchema.safeParse('not-a-tag').success).toBe(false);
  });
});
