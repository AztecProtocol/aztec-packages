import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';

import { BlockHash } from './block_hash.js';
import {
  type BlockParameter,
  BlockParameterSchema,
  blockParameterHash,
  inspectBlockParameter,
  isAnchoredBlockParameter,
} from './block_parameter.js';

const blockHash = BlockHash.fromBuffer(Buffer.alloc(32, 2));

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
    ['{ number, hash }', { number: BlockNumber(7), hash: BlockHash.fromBuffer(Buffer.alloc(32, 1)) }],
  ])('roundtrips %s', (_, param) => {
    const json = JSON.parse(JSON.stringify(param));
    const parsed = BlockParameterSchema.parse(json);
    expect(parsed).toEqual(param);
  });

  describe('unknown keys', () => {
    it.each<[string, object, BlockParameter]>([
      ['a number', { number: 7, mode: 'strictly-this-one' }, { number: BlockNumber(7) }],
      ['a hash', { hash: blockHash.toString(), mode: 'strictly-this-one' }, { hash: blockHash }],
      ['an archive root', { archive: new Fr(123).toString(), extra: 1 }, { archive: new Fr(123) }],
      ['a tag', { tag: 'proven', extra: 1 }, { tag: 'proven' }],
      [
        'a number and hash anchor',
        { number: 7, hash: blockHash.toString(), extra: 1 },
        { number: BlockNumber(7), hash: blockHash },
      ],
    ])('are stripped alongside %s', (_, wire, expected) => {
      expect(BlockParameterSchema.parse(wire)).toEqual(expected);
    });
  });

  describe('conflicting selectors', () => {
    it.each<[string, object]>([
      ['hash and archive', { hash: blockHash.toString(), archive: new Fr(123).toString() }],
      ['number and tag', { number: 7, tag: 'proven' }],
      ['number, hash and archive', { number: 7, hash: blockHash.toString(), archive: new Fr(123).toString() }],
      ['nothing at all', {}],
      ['only unknown keys', { blockNumber: 7 }],
    ])('reject %s', (_, wire) => {
      const result = BlockParameterSchema.safeParse(wire);
      expect(result.success).toBe(false);
      // Every union branch failed, so the tail's complaint is nested among the per-branch errors zod reports.
      expect(JSON.stringify(result.error?.issues)).toMatch(/must name exactly one block/);
    });
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

describe('isAnchoredBlockParameter', () => {
  it.each<[string, BlockParameter]>([['a number and hash anchor', { number: BlockNumber(7), hash: blockHash }]])(
    'is true for %s',
    (_, param) => {
      expect(isAnchoredBlockParameter(param)).toBe(true);
    },
  );

  it.each<[string, BlockParameter]>([
    ['a bare number', BlockNumber(7)],
    ['a bare hash', blockHash],
    ['a tag', 'proven'],
    ['{ number }', { number: BlockNumber(7) }],
    ['{ hash }', { hash: blockHash }],
    ['{ archive }', { archive: new Fr(123) }],
  ])('is false for %s', (_, param) => {
    expect(isAnchoredBlockParameter(param)).toBe(false);
  });
});

describe('blockParameterHash', () => {
  it.each<[string, BlockParameter]>([
    ['a bare hash', blockHash],
    ['{ hash }', { hash: blockHash }],
    ['a number and hash anchor', { number: BlockNumber(7), hash: blockHash }],
  ])('returns the pinned hash for %s', (_, param) => {
    expect(blockParameterHash(param)).toEqual(blockHash);
  });

  it.each<[string, BlockParameter]>([
    ['a bare number', BlockNumber(7)],
    ['{ number }', { number: BlockNumber(7) }],
    ['a tag', 'proven'],
    ['{ archive }', { archive: new Fr(123) }],
  ])('returns undefined for %s', (_, param) => {
    expect(blockParameterHash(param)).toBeUndefined();
  });
});

describe('inspectBlockParameter', () => {
  it('names both selectors of a number and hash anchor', () => {
    expect(inspectBlockParameter({ number: BlockNumber(7), hash: blockHash })).toEqual(
      `number=7,hash=${blockHash.toString()}`,
    );
  });
});
