import { Fr } from '../curves/bn254/index.js';
import { jsonStringify } from '../json-rpc/index.js';
import { type MerkleTree, MerkleTreeCalculator } from '../trees/index.js';
import { makePoseidonMerkleHash } from './hasher.js';
import { SiblingPath, computeRootFromSiblingPath } from './sibling_path.js';

describe('SiblingPath', () => {
  it('serializes to JSON', () => {
    const path = SiblingPath.random(10);
    const json = jsonStringify(path);
    expect(SiblingPath.schema.parse(JSON.parse(json))).toEqual(path);
  });

  it('validates length', () => {
    const path = SiblingPath.random(10);
    const json = jsonStringify(path);
    expect(() => SiblingPath.schemaFor(12).parse(JSON.parse(json))).toThrow(
      expect.objectContaining({ name: 'ZodError' }),
    );
  });

  describe('deserialization of malformed paths', () => {
    it('rejects a path declaring more elements than any tree is deep', () => {
      // Four bytes declaring 1,000,000 elements, with no path data at all.
      expect(() => SiblingPath.fromBuffer(Buffer.from('AA9CQA==', 'base64'))).toThrow(
        'Vector size 1000000 exceeds maximum allowed 128',
      );
    });

    it('rejects the largest length a 32 bit prefix can encode', () => {
      expect(() => SiblingPath.schema.parse('/////w==')).toThrow('Vector size 4294967295 exceeds maximum allowed 128');
    });

    it('rejects a path declaring more elements than the buffer holds', () => {
      const buf = Buffer.alloc(4);
      buf.writeUInt32BE(100, 0);
      expect(() => SiblingPath.fromBuffer(buf)).toThrow('Vector size 100 exceeds remaining buffer length 0');
    });

    it('rejects a path whose data is truncated mid-element', () => {
      const buf = SiblingPath.random(4).toBuffer();
      expect(() => SiblingPath.fromBuffer(buf.subarray(0, buf.length - 16))).toThrow(
        'Attempted to read beyond buffer length',
      );
    });

    it('rejects a path declaring more elements than its data holds', () => {
      const buf = SiblingPath.random(4).toBuffer();
      buf.writeUInt32BE(5, 0);
      expect(() => SiblingPath.fromBuffer(buf)).toThrow('Attempted to read beyond buffer length');
    });
  });

  describe('sibling path', () => {
    let tree: MerkleTree;

    // Matches DomainSeparator.MERKLE_HASH / DOM_SEP__MERKLE_HASH.
    const hasher = makePoseidonMerkleHash(2982624097);

    beforeAll(async () => {
      const calculator = await MerkleTreeCalculator.create(4, undefined, hasher);
      const leaves = Array.from({ length: 5 }).map((_, i) => new Fr(i).toBuffer());
      tree = await calculator.computeTree(leaves);
    });

    test.each([0, 1, 2, 3, 4, 5, 6, 7])(
      'recovers the root from a leaf at index %s and its sibling path',
      async index => {
        const leaf = tree.leaves[index];
        const siblingPath = tree.getSiblingPath(index);
        expect(await computeRootFromSiblingPath(leaf, siblingPath, index, hasher)).toEqual(tree.root);
      },
    );
  });
});
