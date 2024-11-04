import { MerkleTreeId } from '@aztec/circuit-types';
import { NOTE_HASH_TREE_HEIGHT } from '@aztec/circuits.js';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { openTmpStore } from '@aztec/kv-store/utils';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { MerkleTrees } from '@aztec/world-state';

import { EphemeralAvmTree, EphemeralTreeContainer } from './avm_tree.js';

describe('AVM Ephemeral Tree', () => {
  it('Should append the same way the merkle tree does', async () => {
    const store = openTmpStore(true);
    const worldStateTrees = await MerkleTrees.new(store, new NoopTelemetryClient());
    const copyState = await worldStateTrees.fork();
    const tree = await EphemeralAvmTree.create(0n, NOTE_HASH_TREE_HEIGHT, copyState, MerkleTreeId.NOTE_HASH_TREE);

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
    const tree = await EphemeralAvmTree.create(
      BigInt(numLeaves),
      NOTE_HASH_TREE_HEIGHT,
      copyState,
      MerkleTreeId.NOTE_HASH_TREE,
    );

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
    const tree = await EphemeralAvmTree.create(
      BigInt(numLeaves),
      NOTE_HASH_TREE_HEIGHT,
      copyState,
      MerkleTreeId.NOTE_HASH_TREE,
    );

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

  it('Low Nullifier Retrieval from forked state', async () => {
    const store = openTmpStore(true);
    let worldStateTrees = await MerkleTrees.new(store, new NoopTelemetryClient());
    // Note nullifier tree has the first 0-127 indices filled
    let nullifierValues = [new Fr(1000), new Fr(1005), new Fr(1003), new Fr(1004)];
    // Update the global world state
    await worldStateTrees.batchInsert(
      MerkleTreeId.NULLIFIER_TREE,
      nullifierValues.map(i => i.toBuffer()),
      0,
    );
    // Do the same with the copiedState (not sure why fork doesnt preserve the batch inserts...)
    const copyState = await worldStateTrees.fork();
    await copyState.batchInsert(
      MerkleTreeId.NULLIFIER_TREE,
      nullifierValues.map(i => i.toBuffer()),
      0,
    );

    // Create a container with the copied state
    const treeContainer = await EphemeralTreeContainer.create(copyState);
    // Compare the low nullifier for index at 128n (the element Fr(1000))
    let lowNullifierIndex = await worldStateTrees.getPreviousValueIndex(MerkleTreeId.NULLIFIER_TREE, 1000n, true);
    let lowNullifier = await worldStateTrees.getLeafPreimage(
      MerkleTreeId.NULLIFIER_TREE,
      lowNullifierIndex!.index,
      true,
    );
    let containerLowNullifier = await treeContainer.getLowNullifier(MerkleTreeId.NULLIFIER_TREE, new Fr(1000));
    expect(lowNullifier).toEqual(containerLowNullifier.preimage);
  });

  it.only('Low Nullifier Retrieval: appended to fork', async () => {
    // Now we will try to append a new element to the local tree and check if the low nullifier is still the same
    // Try insert something
    const nullifierValues = [new Fr(1000), new Fr(1006), new Fr(1003), new Fr(1004), new Fr(1002)];
    const store = openTmpStore(true);
    const worldStateTrees = await MerkleTrees.new(store, new NoopTelemetryClient());
    const copyState = await worldStateTrees.fork();
    // Insert all 5 nullifiers
    await worldStateTrees.batchInsert(
      MerkleTreeId.NULLIFIER_TREE,
      nullifierValues.map(i => i.toBuffer()),
      0,
    );
    // Insert 4 nullifiers to the copied state
    await copyState.batchInsert(
      MerkleTreeId.NULLIFIER_TREE,
      nullifierValues.slice(0, 4).map(i => i.toBuffer()),
      0,
    );
    // Create a container with the copied state
    const treeContainer = await EphemeralTreeContainer.create(copyState);
    // Append the last element - Fr(1002)
    await treeContainer.appendLeaf(MerkleTreeId.NULLIFIER_TREE, new Fr(1002));
    // Get the low nullifier info of a future insertion of 1005
    const lowNullifierIndex = await worldStateTrees.getPreviousValueIndex(MerkleTreeId.NULLIFIER_TREE, 1005n, true);
    const lowNullifier = await worldStateTrees.getLeafPreimage(
      MerkleTreeId.NULLIFIER_TREE,
      lowNullifierIndex!.index,
      true,
    );
    // Get the low nullifier from the local container
    const containerLowNullifier = await treeContainer.getLowNullifier(MerkleTreeId.NULLIFIER_TREE, new Fr(1005));
    expect(lowNullifier).toEqual(containerLowNullifier.preimage);
  });
});
