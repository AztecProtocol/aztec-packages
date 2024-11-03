import { MerkleTreeId } from '@aztec/circuit-types';
import { NOTE_HASH_TREE_HEIGHT } from '@aztec/circuits.js';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { openTmpStore } from '@aztec/kv-store/utils';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { MerkleTrees } from '@aztec/world-state';

import { EphemeralAvmTree } from './avm_tree.js';

describe('AVM Ephemeral Tree', () => {
  it('Should append the same way the merkle tree does', async () => {
    const store = openTmpStore(true);
    const worldStateTrees = await MerkleTrees.new(store, new NoopTelemetryClient());
    const copyState = await worldStateTrees.fork();
    const tree = await EphemeralAvmTree.create(0n, NOTE_HASH_TREE_HEIGHT, copyState);

    // Test retrieval of path for an appended leaf
    const leaf = new Fr(1);
    const leaves = [];
    for (let i = 0; i < 9; i++) {
      const leaf = new Fr(i);
      leaves.push(leaf);
      tree.appendLeaf(leaf);
    }
    worldStateTrees.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, leaves);
    const worldSib = await worldStateTrees.getSiblingPath(MerkleTreeId.NOTE_HASH_TREE, 4n, true);
    const sibPath = tree.getSiblingPath(leaf, 4n);
    expect(sibPath).toEqual(worldSib.toFields());

    // Check root
    const treeInfo = await worldStateTrees.getTreeInfo(MerkleTreeId.NOTE_HASH_TREE, true);
    const localRoot = tree.getRoot();
    expect(localRoot.toBuffer()).toEqual(treeInfo.root);
  });

  it('Should calculate the frontier correctly', async () => {
    const store = openTmpStore(true);
    const worldStateTrees = await MerkleTrees.new(store, new NoopTelemetryClient());
    const leaves = [];
    const numLeaves = 6;
    for (let i = 0; i < numLeaves; i++) {
      const leaf = new Fr(i);
      leaves.push(leaf);
    }
    const copyState = await worldStateTrees.fork();
    copyState.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, leaves);
    const tree = await EphemeralAvmTree.create(BigInt(numLeaves), NOTE_HASH_TREE_HEIGHT, copyState);

    const expectedFrontier0 = new Fr(4);
    const exepctedFrontier1 = poseidon2Hash([new Fr(4), new Fr(5)]);
    const expectedFrontier2 = poseidon2Hash([
      poseidon2Hash([new Fr(0), new Fr(1)]),
      poseidon2Hash([new Fr(2), new Fr(3)]),
    ]);
    const expectedFrontier = [expectedFrontier0, exepctedFrontier1, expectedFrontier2];
    expect(tree.frontier).toEqual(expectedFrontier);
    // Check root
    await worldStateTrees.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, leaves);
    const treeInfo = await worldStateTrees.getTreeInfo(MerkleTreeId.NOTE_HASH_TREE, true);
    const localRoot = tree.getRoot();
    expect(localRoot.toBuffer()).toEqual(treeInfo.root);
  });

  it('Should use to frontier to correctly update', async () => {
    const store = openTmpStore(true);
    const worldStateTrees = await MerkleTrees.new(store, new NoopTelemetryClient());
    const leaves = [];
    const numLeaves = 2;
    for (let i = 0; i < numLeaves; i++) {
      const leaf = new Fr(i);
      leaves.push(leaf);
    }
    const copyState = await worldStateTrees.fork();
    copyState.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, leaves);
    const tree = await EphemeralAvmTree.create(BigInt(numLeaves), NOTE_HASH_TREE_HEIGHT, copyState);

    for (let i = 0; i < 5; i++) {
      const leaf = new Fr(i);
      leaves.push(leaf);
      tree.appendLeaf(leaf);
    }
    worldStateTrees.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, leaves);

    const worldSib = await worldStateTrees.getSiblingPath(MerkleTreeId.NOTE_HASH_TREE, 2n, true);
    const sibPath = tree.getSiblingPath(new Fr(0), 2n);
    expect(sibPath).toEqual(worldSib.toFields());

    // Check root
    const treeInfo = await worldStateTrees.getTreeInfo(MerkleTreeId.NOTE_HASH_TREE, true);
    const localRoot = tree.getRoot();
    expect(localRoot.toBuffer()).toEqual(treeInfo.root);
  });
});
