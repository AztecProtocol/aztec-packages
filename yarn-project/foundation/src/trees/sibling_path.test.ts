import { Fr } from '../fields/index.js';
import { jsonStringify } from '../json-rpc/index.js';
import { type MerkleTree, MerkleTreeCalculator } from '../trees/index.js';
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

  describe('sibling path', () => {
    let tree: MerkleTree;

    beforeAll(async () => {
      const calculator = await MerkleTreeCalculator.create(4);
      const leaves = Array.from({ length: 5 }).map((_, i) => new Fr(i).toBuffer());
      tree = await calculator.computeTree(leaves);
    });

    test.each([0, 1, 2, 3, 4, 5, 6, 7])(
      'recovers the root from a leaf at index %s and its sibling path',
      async index => {
        const leaf = tree.leaves[index];
        const siblingPath = tree.getSiblingPath(index);
        expect(await computeRootFromSiblingPath(leaf, siblingPath, index)).toEqual(tree.root);
      },
    );
  });
});
