import {
  type BatchInsertionResult,
  type IndexedTreeId,
  MerkleTreeId,
  type MerkleTreeWriteOperations,
} from '@aztec/circuit-types';
import {
  NOTE_HASH_TREE_HEIGHT,
  NULLIFIER_SUBTREE_HEIGHT,
  type NULLIFIER_TREE_HEIGHT,
  type NullifierLeafPreimage,
  type PUBLIC_DATA_TREE_HEIGHT,
  PublicDataTreeLeaf,
  type PublicDataTreeLeafPreimage,
} from '@aztec/circuits.js';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { type IndexedTreeLeafPreimage } from '@aztec/foundation/trees';
import { openTmpStore } from '@aztec/kv-store/utils';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { MerkleTrees } from '@aztec/world-state';

import { AvmEphemeralForest, EphemeralAvmTree, type IndexedInsertionResult } from './avm_tree.js';

let worldStateTrees: MerkleTrees;
let copyState: MerkleTreeWriteOperations;
// Up to 64 dummy note hashes
let noteHashes: Fr[];
let indexedHashes: Fr[];
let slots: Fr[];
let values: Fr[];
let getSiblingIndex = 21n;

/****************************************************/
/*************** Test Helper Functions **************/
/****************************************************/

// Helper to check the equality of the insertion results (low witness, insertion path)
const checkEqualityOfInsertionResults = <Tree_Height extends number>(
  containerResults: IndexedInsertionResult<IndexedTreeLeafPreimage>[],
  wsResults: BatchInsertionResult<Tree_Height, 0>[],
) => {
  if (containerResults.length !== wsResults.length) {
    throw new Error('Results length mismatch');
  }
  for (let i = 0; i < containerResults.length; i++) {
    const containerResult = containerResults[i];
    const wsResult = wsResults[i];
    expect(containerResult.lowWitness.siblingPath).toEqual(wsResult.lowLeavesWitnessData![0].siblingPath.toFields());
    expect(containerResult.lowWitness.index).toEqual(wsResult.lowLeavesWitnessData![0].index);
    expect(containerResult.lowWitness.preimage).toEqual(wsResult.lowLeavesWitnessData![0].leafPreimage);
    expect(containerResult.insertionPath).toEqual(wsResult.newSubtreeSiblingPath.toFields());
  }
};

const getWorldStateRoot = async (treeId: MerkleTreeId) => {
  return (await worldStateTrees.getTreeInfo(treeId, /*includeUncommitted=*/ true)).root;
};

const getWorldStateSiblingPath = (treeId: MerkleTreeId, index: bigint) => {
  return worldStateTrees.getSiblingPath(treeId, index, /*includeUncommitted=*/ true);
};

const publicDataInsertWorldState = <Tree_Height extends number>(
  slot: Fr,
  value: Fr,
): Promise<BatchInsertionResult<Tree_Height, 0>> => {
  return worldStateTrees.batchInsert(
    MerkleTreeId.PUBLIC_DATA_TREE,
    [new PublicDataTreeLeaf(slot, value).toBuffer()],
    0,
  );
};

const nullifierInsertWorldState = <Tree_Height extends number>(
  nullifier: Fr,
): Promise<BatchInsertionResult<Tree_Height, 0>> => {
  return worldStateTrees.batchInsert(MerkleTreeId.NULLIFIER_TREE, [nullifier.toBuffer()], 0);
};

// Set up some recurring state for the tests
beforeEach(async () => {
  const store = openTmpStore(true);
  worldStateTrees = await MerkleTrees.new(store, new NoopTelemetryClient());
  copyState = await worldStateTrees.fork();

  noteHashes = Array.from({ length: 64 }, (_, i) => new Fr(i));
  // We do + 128 since the first 128 leaves are already filled in the indexed trees (nullifier, public data)
  indexedHashes = Array.from({ length: 64 }, (_, i) => new Fr(i + 128));

  slots = Array.from({ length: 64 }, (_, i) => new Fr(i + 128));
  values = Array.from({ length: 64 }, (_, i) => new Fr(i + 256));
});

/****************************************************/
/*************** Test Cases *************************/
/****************************************************/
/**
 * Each test follows a similar structure with an extra test specific to the  public data tree
 * For each test, we perform a consistency check by comparing the roots and sibling paths (from a random index) or from the insertion results
 * between the ephemeral container and the world state trees.
 * NOTE HASH TREE TESTS
 * 1. Given an empty state, we can append some leaves and remain consistent
 * 2. Given a prefilled worldStateDB, we can fork the worldStateDB into the ephemeral container and append some leaves
 *
 * PUBLIC DATA TREE TESTS
 * 1. Given an empty state, we can append some leaves and remain consistent
 * 2. Given a prefilled worldStateDB, we can fork the worldStateDB into the ephemeral container and append some leaves
 * 3. Given an state with a single leaf, we can update the leaf and append new leaves and remain consistent.
 *
 * NULLIFIER TREE TEST
 * 1. Given an empty state, we can append some leaves and remain consistent
 * 2. Given a prefilled worldStateDB, we can fork the worldStateDB into the ephemeral container and append some leaves
 * 3. Given an state with a single leaf, we can update the leaf and append new leaves and remain consistent.
 *
 * FORKING AND MERGING TEST
 * 1. Appending to a forked ephemeral container should continue to remain consistent with the world state trees
 * 2. Forking, rolling back and forking again should remain consistent with the world state trees
 */

describe('Simple Note Hash Consistency', () => {
  const treeId = MerkleTreeId.NOTE_HASH_TREE;
  it('Should do a simple append and check the root starting with empty', async () => {
    const treeContainer = await AvmEphemeralForest.create(copyState);
    for (const noteHash of noteHashes) {
      treeContainer.appendNoteHash(noteHash);
    }
    await worldStateTrees.appendLeaves(treeId, noteHashes);

    // Check that the roots are consistent
    const wsRoot = await getWorldStateRoot(treeId);
    const computedRoot = treeContainer.treeMap.get(treeId)!.getRoot();
    expect(computedRoot.toBuffer()).toEqual(wsRoot);

    // Check a sibling path from a random index is consistent
    const wsSiblingPath = await getWorldStateSiblingPath(treeId, getSiblingIndex);
    const siblingPath = await treeContainer.getSiblingPath(treeId, getSiblingIndex);
    expect(siblingPath).toEqual(wsSiblingPath.toFields());
  });

  it('Should fork a prefilled tree and check consistency', async () => {
    // Insert half of our note hashes into the copyState (forked from worldStateDB)
    const preInserted = noteHashes.slice(0, 32);
    await copyState.appendLeaves(treeId, preInserted);
    // The tree container has a DB with the first 32 note hashes
    const treeContainer = await AvmEphemeralForest.create(copyState);

    // Append the remaining note hashes within the container
    const postInserted = noteHashes.slice(32);
    for (const noteHash of postInserted) {
      treeContainer.appendNoteHash(noteHash);
    }

    // Build a worldstateDB with all the note hashes
    await worldStateTrees.appendLeaves(treeId, preInserted.concat(postInserted));

    // Check that the roots are consistent
    const wsRoot = await getWorldStateRoot(treeId);
    const computedRoot = treeContainer.treeMap.get(treeId)!.getRoot();
    expect(computedRoot.toBuffer()).toEqual(wsRoot);

    // Check the sibling path from an index before the fork
    let wsSiblingPath = await getWorldStateSiblingPath(treeId, getSiblingIndex);
    let siblingPath = await treeContainer.getSiblingPath(treeId, getSiblingIndex);
    expect(siblingPath).toEqual(wsSiblingPath.toFields());

    // Check the sibling path that we inserted in the container
    getSiblingIndex = 42n;
    wsSiblingPath = await getWorldStateSiblingPath(treeId, getSiblingIndex);
    siblingPath = await treeContainer.getSiblingPath(treeId, getSiblingIndex);
    expect(siblingPath).toEqual(wsSiblingPath.toFields());
  });
});

describe('Simple Public Data Consistency', () => {
  const treeId = MerkleTreeId.PUBLIC_DATA_TREE as IndexedTreeId;
  let containerInsertionResults: IndexedInsertionResult<PublicDataTreeLeafPreimage>[] = [];
  let worldStateInsertionResults: BatchInsertionResult<typeof PUBLIC_DATA_TREE_HEIGHT, 0>[] = [];

  // We need to zero out between tests
  afterEach(() => {
    containerInsertionResults = [];
    worldStateInsertionResults = [];
  });

  it('Should do a simple append and check the root starting with empty', async () => {
    const treeContainer = await AvmEphemeralForest.create(copyState);

    // Store the insertion results for comparison
    // Append all the leaves to the container and the world state trees
    for (let i = 0; i < slots.length; i++) {
      containerInsertionResults.push(await treeContainer.writePublicStorage(slots[i], values[i]));
      worldStateInsertionResults.push(await publicDataInsertWorldState(slots[i], values[i]));
    }

    // Compare the roots of the container and the world state trees
    const wsRoot = await getWorldStateRoot(treeId);
    const computedRoot = treeContainer.treeMap.get(treeId)!.getRoot();
    expect(computedRoot.toBuffer()).toEqual(wsRoot);

    // Check that all the accumulated insertion results match
    checkEqualityOfInsertionResults(containerInsertionResults, worldStateInsertionResults);
  });

  it('Should fork a prefilled tree and check consistency', async () => {
    const treeId = MerkleTreeId.PUBLIC_DATA_TREE as IndexedTreeId;
    const preInsertIndex = 32;

    // Insert the first half of the leaves into the copyState
    for (let i = 0; i < preInsertIndex; i++) {
      await copyState.batchInsert(treeId, [new PublicDataTreeLeaf(slots[i], values[i]).toBuffer()], 0);
    }
    const treeContainer = await AvmEphemeralForest.create(copyState);

    // Insert the second half of the leaves into the container
    for (let i = preInsertIndex; i < slots.length; i++) {
      await treeContainer.writePublicStorage(slots[i], values[i]);
    }

    // Insert all the leaves into the world state trees
    for (let i = 0; i < slots.length; i++) {
      await publicDataInsertWorldState(slots[i], values[i]);
    }

    // Compare the roots of the container and the world state trees
    const wsRoot = await getWorldStateRoot(treeId);
    const computedRoot = treeContainer.treeMap.get(treeId)!.getRoot();
    expect(computedRoot.toBuffer()).toEqual(wsRoot);

    // Get a sibling path from a random index and check it is consistent
    const wsSiblingPath = await getWorldStateSiblingPath(treeId, getSiblingIndex);
    const siblingPath = await treeContainer.getSiblingPath(treeId, getSiblingIndex);
    expect(siblingPath).toEqual(wsSiblingPath.toFields());
  });

  it('Should update a leaf and check consistency', async () => {
    // This test does the following:
    // 1. Create a tree with the leaf (slot = 128, value = 256)
    // 2. Update the leaf to (slot = 128, value = 258)
    // 3. Append a new leaf (slot = 129, value = 257)
    // 4. Update the new leaf to (slot = 129, value = 259)
    // 5. Check that the roots and resulting sibling paths are consistent after each operation

    // Step 1
    const treeId = MerkleTreeId.PUBLIC_DATA_TREE as IndexedTreeId;
    // Add a single element of (slot = 128, value = 256) to the tree before forking into our ephemeral state
    await copyState.batchInsert(treeId, [new PublicDataTreeLeaf(new Fr(128), new Fr(256)).toBuffer()], 0);
    const treeContainer = await AvmEphemeralForest.create(copyState);

    await publicDataInsertWorldState(new Fr(128), new Fr(256));

    // Step 2
    containerInsertionResults.push(await treeContainer.writePublicStorage(new Fr(128), new Fr(258)));
    worldStateInsertionResults.push(await publicDataInsertWorldState(new Fr(128), new Fr(258)));

    // Step 3
    containerInsertionResults.push(await treeContainer.writePublicStorage(new Fr(129), new Fr(257)));
    worldStateInsertionResults.push(await publicDataInsertWorldState(new Fr(129), new Fr(257)));

    // Step 4
    containerInsertionResults.push(await treeContainer.writePublicStorage(new Fr(129), new Fr(259)));
    worldStateInsertionResults.push(await publicDataInsertWorldState(new Fr(129), new Fr(259)));

    // Check the roots are consistent
    const wsRoot = await getWorldStateRoot(treeId);
    const computedRoot = treeContainer.treeMap.get(treeId)!.getRoot();
    expect(computedRoot.toBuffer()).toEqual(wsRoot);

    // Check the insertion results match
    checkEqualityOfInsertionResults(containerInsertionResults, worldStateInsertionResults);
  });
});

describe('Simple Nullifier Consistency', () => {
  const treeId = MerkleTreeId.NULLIFIER_TREE as IndexedTreeId;
  let containerInsertionResults: IndexedInsertionResult<NullifierLeafPreimage>[] = [];
  let worldStateInsertionResults: BatchInsertionResult<typeof NULLIFIER_TREE_HEIGHT, 0>[] = [];

  // We need to zero out between tests
  afterEach(() => {
    containerInsertionResults = [];
    worldStateInsertionResults = [];
  });

  it('Should do a simple append and check the root starting with empty', async () => {
    const treeContainer = await AvmEphemeralForest.create(copyState);

    // Insert all the leaves to the container and the world state trees
    for (let i = 0; i < indexedHashes.length; i++) {
      containerInsertionResults.push(await treeContainer.appendNullifier(indexedHashes[i]));
      worldStateInsertionResults.push(await nullifierInsertWorldState(indexedHashes[i]));
    }

    // Compare the roots of the container and the world state
    const wsRoot = await getWorldStateRoot(treeId);
    const computedRoot = treeContainer.treeMap.get(treeId)!.getRoot();
    expect(computedRoot.toBuffer()).toEqual(wsRoot);

    // Check that all the accumulated insertion results match
    checkEqualityOfInsertionResults(containerInsertionResults, worldStateInsertionResults);

    // Check a sibling path from a random index is consistent
    const wsSiblingPath = await getWorldStateSiblingPath(treeId, getSiblingIndex);
    const siblingPath = await treeContainer.getSiblingPath(treeId, getSiblingIndex);
    expect(siblingPath).toEqual(wsSiblingPath.toFields());
  });

  it('Should fork a prefilled tree and check consistency', async () => {
    const preInsertIndex = 32;
    for (let i = 0; i < preInsertIndex; i++) {
      await copyState.batchInsert(treeId, [indexedHashes[i].toBuffer()], 0);
    }
    const treeContainer = await AvmEphemeralForest.create(copyState);

    for (let i = preInsertIndex; i < indexedHashes.length; i++) {
      containerInsertionResults.push(await treeContainer.appendNullifier(indexedHashes[i]));
    }
    for (let i = 0; i < indexedHashes.length; i++) {
      worldStateInsertionResults.push(await nullifierInsertWorldState(indexedHashes[i]));
    }

    // Compare the roots of the container and the world state
    const wsRoot = await getWorldStateRoot(treeId);
    const computedRoot = treeContainer.treeMap.get(treeId)!.getRoot();
    expect(computedRoot.toBuffer()).toEqual(wsRoot);

    // Check insertion results - note we can only compare against the post-insertion results
    checkEqualityOfInsertionResults(containerInsertionResults, worldStateInsertionResults.slice(preInsertIndex));
  });

  it('Should check that the insertion paths resolve to the root', async () => {
    const treeContainer = await AvmEphemeralForest.create(copyState);
    const rootBefore = treeContainer.treeMap.get(MerkleTreeId.NULLIFIER_TREE)!.getRoot().toBuffer();

    const containerInsert = await treeContainer.appendNullifier(indexedHashes[0]);
    const rootAfter = treeContainer.treeMap.get(MerkleTreeId.NULLIFIER_TREE)!.getRoot().toBuffer();

    const calcRootFromPath = (path: Fr[], leaf: Fr, index: bigint) => {
      for (const sibling of path) {
        if (index % 2n === 0n) {
          leaf = poseidon2Hash([leaf, sibling]);
        } else {
          leaf = poseidon2Hash([sibling, leaf]);
        }
        index = index / 2n;
      }
      return leaf;
    };

    // We perform the following steps to check we can compute the next root from the insertion path
    // (1) Check membership of the low nullifier
    // (2) Update the low nullifier and compute the new root
    // (3) Check the insertion path for a zero leaf value against new root
    // (4) Compute the new root after inserting the new leaf
    // (5) Check the root after the insertion

    // Step 1
    const membershipRoot = calcRootFromPath(
      containerInsert.lowWitness.siblingPath,
      treeContainer.hashPreimage(containerInsert.lowWitness.preimage),
      containerInsert.lowWitness.index,
    );
    expect(membershipRoot.toBuffer()).toEqual(rootBefore);

    // Step 2
    // Update low nullifier
    const newLowNullifier = containerInsert.lowWitness.preimage;
    newLowNullifier.nextIndex = containerInsert.leafIndex;
    newLowNullifier.nextNullifier = containerInsert.newOrElementToUpdate.element.nullifier;
    // Compute new root
    const updatedRoot = calcRootFromPath(
      containerInsert.lowWitness.siblingPath,
      treeContainer.hashPreimage(newLowNullifier),
      containerInsert.lowWitness.index,
    );

    //Step 3
    const zeroMembershipRoot = calcRootFromPath(containerInsert.insertionPath, Fr.ZERO, containerInsert.leafIndex);
    expect(zeroMembershipRoot.toBuffer()).toEqual(updatedRoot.toBuffer());

    // Step 4
    const finalRoot = calcRootFromPath(
      containerInsert.insertionPath,
      treeContainer.hashPreimage(containerInsert.newOrElementToUpdate.element),
      containerInsert.leafIndex,
    );
    expect(finalRoot.toBuffer()).toEqual(rootAfter);
  });
});

describe('Big Random Avm Ephemeral Container Test', () => {
  it('Should do a big random test', async () => {
    const shuffleArray = (array: Fr[]) => {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = array[i];
        array[i] = array[j];
        array[j] = temp;
      }
    };

    // Can be up to 64
    const ENTRY_COUNT = 50;
    shuffleArray(noteHashes);
    shuffleArray(indexedHashes);
    shuffleArray(slots);
    shuffleArray(values);

    const treeContainer = await AvmEphemeralForest.create(copyState);

    // Insert values ino merkleTrees
    // Note Hash
    await worldStateTrees.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, noteHashes.slice(0, ENTRY_COUNT));
    // Everything else
    for (let i = 0; i < ENTRY_COUNT; i++) {
      await nullifierInsertWorldState(indexedHashes[i]);
      await publicDataInsertWorldState(slots[i], values[i]);
      treeContainer.appendNoteHash(noteHashes[i]);
      await treeContainer.appendNullifier(indexedHashes[i]);
      await treeContainer.writePublicStorage(slots[i], values[i]);
    }

    const wsRoots = [];
    const computedRoots = [];
    for (const treeId of [MerkleTreeId.NOTE_HASH_TREE, MerkleTreeId.NULLIFIER_TREE, MerkleTreeId.PUBLIC_DATA_TREE]) {
      wsRoots.push(await getWorldStateRoot(treeId));
      computedRoots.push(treeContainer.treeMap.get(treeId)!.getRoot().toBuffer());
    }

    // All the roots should match
    for (let i = 0; i < wsRoots.length; i++) {
      expect(computedRoots[i]).toEqual(wsRoots[i]);
    }

    // Get a sibling path from each tree and check it is consistent
    let wsSiblingPath = await getWorldStateSiblingPath(MerkleTreeId.NOTE_HASH_TREE, getSiblingIndex);
    let siblingPath = await treeContainer.getSiblingPath(MerkleTreeId.NOTE_HASH_TREE, getSiblingIndex);
    expect(siblingPath).toEqual(wsSiblingPath.toFields());

    wsSiblingPath = await getWorldStateSiblingPath(MerkleTreeId.NULLIFIER_TREE, getSiblingIndex);
    siblingPath = await treeContainer.getSiblingPath(MerkleTreeId.NULLIFIER_TREE, getSiblingIndex);
    expect(siblingPath).toEqual(wsSiblingPath.toFields());

    wsSiblingPath = await getWorldStateSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, getSiblingIndex);
    siblingPath = await treeContainer.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, getSiblingIndex);
    expect(siblingPath).toEqual(wsSiblingPath.toFields());
  });
});

describe('Checking forking and merging', () => {
  const treeId = MerkleTreeId.PUBLIC_DATA_TREE as IndexedTreeId;

  it('Should check forked results are eventually consistent', async () => {
    const treeContainer = await AvmEphemeralForest.create(copyState);
    // Write all but the last value to the container
    for (let i = 0; i < slots.length - 1; i++) {
      await treeContainer.writePublicStorage(slots[i], values[i]);
    }
    // Fork the ephemeral container
    const forkedContainer = treeContainer.fork();

    // Write the last element to the forked container
    await forkedContainer.writePublicStorage(slots[slots.length - 1], values[slots.length - 1]);
    const forkedRoot = forkedContainer.treeMap.get(treeId)!.getRoot();
    let originalRoot = treeContainer.treeMap.get(treeId)!.getRoot();

    // The roots should NOT match since we have an extra element
    expect(forkedRoot.toBuffer()).not.toEqual(originalRoot.toBuffer());

    // Write the last element to original container
    await treeContainer.writePublicStorage(slots[slots.length - 1], values[slots.length - 1]);
    originalRoot = treeContainer.treeMap.get(treeId)!.getRoot();

    // We should be consistent now
    expect(forkedRoot.toBuffer()).toEqual(originalRoot.toBuffer());
  });

  it('Fork-Rollback-Fork-Merge should be consistent', async () => {
    // To store results
    const wsInsertionResults: BatchInsertionResult<typeof PUBLIC_DATA_TREE_HEIGHT, 0>[] = [];
    const containerInsertionResults = [];

    const treeContainer = await AvmEphemeralForest.create(copyState);
    // Write the first element to the container
    containerInsertionResults.push(await treeContainer.writePublicStorage(slots[0], values[0]));

    // Fork the ephemeral container (simulating a nested call)
    const forkedContainer = treeContainer.fork();
    // Write to the fork
    containerInsertionResults.push(await forkedContainer.writePublicStorage(slots[1], values[1]));

    // We add to this fork but we check it doesnt impact the initial fork (i.e. Rollback)
    const nestedCallFork = forkedContainer.fork();
    await nestedCallFork.writePublicStorage(slots[2], values[2]);

    // We write to the original fork (i.e. the parent of nestedCallFork), e.g. if nestedCallFork reverts
    containerInsertionResults.push(await forkedContainer.writePublicStorage(slots[3], values[3]));

    // Build the original worldState with elements of inde 0, 1 and 3 (note that we skip 2)
    wsInsertionResults.push(await publicDataInsertWorldState(slots[0], values[0]));
    wsInsertionResults.push(await publicDataInsertWorldState(slots[1], values[1]));
    wsInsertionResults.push(await publicDataInsertWorldState(slots[3], values[3]));

    const containerRoot = forkedContainer.treeMap.get(treeId)!.getRoot();
    const wsRoot = await getWorldStateRoot(treeId);
    expect(containerRoot.toBuffer()).toEqual(wsRoot);

    // Check that all the accumulated insertion results
    checkEqualityOfInsertionResults(containerInsertionResults, wsInsertionResults);
  });
});

/**
 * This is a small test that acts like a sanity check that the inner Tree class is working as expected.
 * This is a good canary if things are going wrong, whether the problem is in the Tree class or the EphemeralForest class.
 */
describe('AVM Ephemeral Tree Sanity Test', () => {
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
    await copyState.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, leaves);
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
});

describe('Batch Insertion', () => {
  it('Should batch insert into the nullifier tree', async () => {
    const treeContainer = await AvmEphemeralForest.create(copyState);
    await treeContainer.appendNullifier(indexedHashes[0]);
    await treeContainer.appendNullifier(indexedHashes[1]);
    await worldStateTrees.batchInsert(
      MerkleTreeId.NULLIFIER_TREE,
      [indexedHashes[0].toBuffer(), indexedHashes[1].toBuffer()],
      NULLIFIER_SUBTREE_HEIGHT,
    );

    // Check root
    const wsRoot = await getWorldStateRoot(MerkleTreeId.NULLIFIER_TREE);
    const computedRoot = treeContainer.treeMap.get(MerkleTreeId.NULLIFIER_TREE)!.getRoot();
    expect(computedRoot.toBuffer()).toEqual(wsRoot);
  });
});

// This benchmark also performs a convenient sanity check
/* eslint no-console: ["error", { allow: ["time", "timeEnd"] }] */
describe('A basic benchmark', () => {
  it('Should benchmark writes', async () => {
    // This random is fine for now, since the entry leaves are between 0-127
    // We just want to make sure there are minimal "updates" from this set
    const leaves = Array.from({ length: 64 }, _ => Fr.random());
    const slots = leaves.map((_, i) => new Fr(i + 128));

    const container = await AvmEphemeralForest.create(copyState);
    await publicDataInsertWorldState(new Fr(0), new Fr(128));

    // Updating the first slot, triggers the index 0 to be added to the minimum stored key in the container
    await container.writePublicStorage(new Fr(0), new Fr(128));

    // Check Roots before benchmarking
    let wsRoot = await getWorldStateRoot(MerkleTreeId.PUBLIC_DATA_TREE);
    let computedRoot = container.treeMap.get(MerkleTreeId.PUBLIC_DATA_TREE)!.getRoot();
    expect(computedRoot.toBuffer()).toEqual(wsRoot);

    console.time('benchmark');
    // These writes are all new leaves and should be impacted by the key sorted algorithm of the tree.
    for (let i = 0; i < leaves.length; i++) {
      await container.writePublicStorage(slots[i], leaves[i]);
    }
    console.timeEnd('benchmark');

    // Update worldstate for sanity check
    for (let i = 0; i < leaves.length; i++) {
      await publicDataInsertWorldState(slots[i], leaves[i]);
    }
    // Check roots
    wsRoot = await getWorldStateRoot(MerkleTreeId.PUBLIC_DATA_TREE);
    computedRoot = container.treeMap.get(MerkleTreeId.PUBLIC_DATA_TREE)!.getRoot();
    expect(computedRoot.toBuffer()).toEqual(wsRoot);
  });
});
