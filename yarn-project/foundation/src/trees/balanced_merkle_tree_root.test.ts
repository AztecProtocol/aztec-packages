import { Fr } from '../curves/bn254/field.js';
import { updateInlineTestData } from '../testing/files/index.js';
import { computeBalancedMerkleTreeRootAsync, computeBalancedShaRoot } from './balanced_merkle_tree_root.js';
import { makePoseidonMerkleHash } from './hasher.js';

// Matches DomainSeparator.MERKLE_HASH / DOM_SEP__MERKLE_HASH.
const MERKLE_HASH_SEPARATOR = 2982624097;
const poseidonMerkleHash = makePoseidonMerkleHash(MERKLE_HASH_SEPARATOR);

describe('balanced merkle tree', () => {
  it('should correctly compute the tree root', async () => {
    const leaves = Array.from({ length: 16 }, (_, i) => new Fr(i + 1).toBuffer());
    const root = await computeBalancedMerkleTreeRootAsync(leaves, poseidonMerkleHash);
    const rootHex = `0x${root.toString('hex')}`;
    expect(rootHex).toMatchInlineSnapshot(`"0x2bc86dba04dfdd6352c3b1c66b2300445964e2888aa52fdb023d2e645a3d3399"`);
    // Run with AZTEC_GENERATE_TEST_DATA=1 to update the noir test data.
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/merkle_tree/root.nr',
      'expected_tree_root_from_ts',
      rootHex,
    );
  });
  it('should correctly compute an empty tree root', async () => {
    const leaves = new Array(16).fill(Buffer.alloc(32));
    const root = await computeBalancedMerkleTreeRootAsync(leaves, poseidonMerkleHash);
    const rootHex = `0x${root.toString('hex')}`;
    expect(rootHex).toMatchInlineSnapshot(`"0x1e20ad4181460cbfdc74ca773502c59b890f184efe300ebad895956d318422da"`);
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
