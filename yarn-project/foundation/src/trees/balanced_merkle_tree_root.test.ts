import { Fr } from '../curves/bn254/field.js';
import { updateInlineTestData } from '../testing/files/index.js';
import { computeBalancedPoseidonRoot, computeBalancedShaRoot } from './balanced_merkle_tree_root.js';

describe('balanced merkle tree', () => {
  it('should correctly compute the tree root', async () => {
    const leaves = Array.from({ length: 16 }, (_, i) => new Fr(i + 1).toBuffer());
    const root = await computeBalancedPoseidonRoot(leaves);
    const rootHex = `0x${root.toString('hex')}`;
    expect(rootHex).toMatchInlineSnapshot(`"0x1528946361c480e8dc1e9ae3f8c31c997625fa1ddeddc7db5ad0dce3ac58fc4c"`);

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update the noir test data.
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/merkle_tree/root.nr',
      'expected_tree_root_from_ts',
      rootHex,
    );
  });

  it('should correctly compute an empty tree root', async () => {
    const leaves = new Array(16).fill(Buffer.alloc(32));
    const root = await computeBalancedPoseidonRoot(leaves);
    const rootHex = `0x${root.toString('hex')}`;
    expect(rootHex).toMatchInlineSnapshot(`"0x2373ea368857ec7af97e7b470d705848e2bf93ed7bef142a490f2119bcf82d8e"`);

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update the noir test data.
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/merkle_tree/root.nr',
      'expected_empty_root_from_ts',
      rootHex,
    );
  });

  it('should correctly compute the sha tree root', () => {
    const leaves = Array.from({ length: 16 }, (_, i) => new Fr(i + 1).toBuffer());
    const root = computeBalancedShaRoot(leaves);
    const rootHex = `0x${root.toString('hex')}`;
    expect(rootHex).toMatchInlineSnapshot(`"0x00b007869b8a5e2a9b3b580a318e702cea04b2f5438f2e26743f545e4d1ecbdb"`);

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update the noir test data.
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/merkle_tree/root.nr',
      'expected_sha_root_from_ts',
      rootHex,
    );
  });
});
