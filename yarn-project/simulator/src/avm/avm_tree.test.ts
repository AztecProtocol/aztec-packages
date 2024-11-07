import { BatchInsertionResult, IndexedTreeId, MerkleTreeId, MerkleTreeWriteOperations } from '@aztec/circuit-types';
import {
    NOTE_HASH_TREE_HEIGHT,
    NULLIFIER_TREE_HEIGHT,
    NullifierLeafPreimage,
    PUBLIC_DATA_TREE_HEIGHT,
    PublicDataTreeLeaf,
    PublicDataTreeLeafPreimage,
} from '@aztec/circuits.js';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { IndexedTreeLeafPreimage } from '@aztec/foundation/trees';
import { openTmpStore } from '@aztec/kv-store/utils';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { MerkleTrees } from '@aztec/world-state';

import { EphemeralAvmTree, EphemeralTreeContainer, IndexedInsertionResult } from './avm_tree.js';

let worldStateTrees: MerkleTrees;
let copyState: MerkleTreeWriteOperations;
// Up to 64 dummy note hashes
let noteHashes: Fr[];
let indexedHashes: Fr[];
let slots: Fr[];
let values: Fr[];
let getSiblingIndex = 21n;

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
        expect(containerResult.lowWitness.lowSiblingPath).toEqual(wsResult.lowLeavesWitnessData![0].siblingPath.toFields());
        expect(containerResult.lowWitness.index).toEqual(wsResult.lowLeavesWitnessData![0].index);
        expect(containerResult.lowWitness.preimage).toEqual(wsResult.lowLeavesWitnessData![0].leafPreimage);
        expect(containerResult.insertionPath).toEqual(wsResult.newSubtreeSiblingPath.toFields());
    }
};

beforeEach(async () => {
    const store = openTmpStore(true);
    worldStateTrees = await MerkleTrees.new(store, new NoopTelemetryClient());
    copyState = await worldStateTrees.fork();

    noteHashes = Array.from({ length: 64 }, (_, i) => new Fr(i));
    // We add 128 since the first 128 leaves are already filled in the indexed trees (nullifier, public data)
    indexedHashes = Array.from({ length: 64 }, (_, i) => new Fr(i + 128));

    slots = Array.from({ length: 64 }, (_, i) => new Fr(i + 128));
    values = Array.from({ length: 64 }, (_, i) => new Fr(i + 256));
});

describe('Simple Note Hash Consistency', () => {
    it('Should do a simple append and check the root starting with empty', async () => {
        const treeId = MerkleTreeId.NOTE_HASH_TREE;
        const treeContainer = await EphemeralTreeContainer.create(copyState);
        for (let i = 0; i < noteHashes.length; i++) {
            await treeContainer.appendNoteHash(noteHashes[i]);
        }
        await worldStateTrees.appendLeaves(treeId, noteHashes);

        const wsRoot = (await worldStateTrees.getTreeInfo(treeId, true)).root;
        const computedRoot = treeContainer.treeMap.get(treeId)!.getRoot();
        expect(computedRoot.toBuffer()).toEqual(wsRoot);

        const wsSiblingPath = await worldStateTrees.getSiblingPath(treeId, getSiblingIndex, true);
        const siblingPath = await treeContainer.getSiblingPath(treeId, getSiblingIndex);
        expect(siblingPath).toEqual(wsSiblingPath.toFields());
    });
    it('Should fork a prefilled tree and check consistency', async () => {
        const treeId = MerkleTreeId.NOTE_HASH_TREE;
        const preInserted = noteHashes.slice(0, 32);
        const postInserted = noteHashes.slice(32);
        await copyState.appendLeaves(treeId, preInserted);
        const treeContainer = await EphemeralTreeContainer.create(copyState);

        for (let i = 0; i < postInserted.length; i++) {
            await treeContainer.appendNoteHash(postInserted[i]);
        }
        await worldStateTrees.appendLeaves(treeId, preInserted.concat(postInserted));

        const wsRoot = (await worldStateTrees.getTreeInfo(treeId, true)).root;
        const computedRoot = treeContainer.treeMap.get(treeId)!.getRoot();
        expect(computedRoot.toBuffer()).toEqual(wsRoot);

        // Pre inserted leaves sibling Path
        let wsSiblingPath = await worldStateTrees.getSiblingPath(treeId, getSiblingIndex, true);
        let siblingPath = await treeContainer.getSiblingPath(treeId, getSiblingIndex);
        expect(siblingPath).toEqual(wsSiblingPath.toFields());

        // Post inserted leaves sibling Path
        getSiblingIndex = 42n;
        wsSiblingPath = await worldStateTrees.getSiblingPath(treeId, getSiblingIndex, true);
        siblingPath = await treeContainer.getSiblingPath(treeId, getSiblingIndex);
        expect(siblingPath).toEqual(wsSiblingPath.toFields());
    });
});

describe('Simple Public Data Consistency', () => {
    it('Should do a simple append and check the root starting with empty', async () => {
        const treeId = MerkleTreeId.PUBLIC_DATA_TREE as IndexedTreeId;
        const treeContainer = await EphemeralTreeContainer.create(copyState);

        const containerInsertionResults: IndexedInsertionResult<PublicDataTreeLeafPreimage>[] = [];
        let worldStateInsertionResults: BatchInsertionResult<typeof PUBLIC_DATA_TREE_HEIGHT, 0>[] = [];
        for (let i = 0; i < slots.length; i++) {
            containerInsertionResults.push(await treeContainer.writePublicStorage(slots[i], values[i]));
            worldStateInsertionResults.push(
                await worldStateTrees.batchInsert(treeId, [new PublicDataTreeLeaf(slots[i], values[i]).toBuffer()], 0),
            );
        }

        const wsRoot = (await worldStateTrees.getTreeInfo(treeId, true)).root;
        const computedRoot = treeContainer.treeMap.get(treeId)!.getRoot();
        expect(computedRoot.toBuffer()).toEqual(wsRoot);

        // Check that all the accumulated insertion results match
        checkEqualityOfInsertionResults(containerInsertionResults, worldStateInsertionResults);

        const wsSiblingPath = await worldStateTrees.getSiblingPath(treeId, getSiblingIndex, true);
        const siblingPath = await treeContainer.getSiblingPath(treeId, getSiblingIndex);
        expect(siblingPath).toEqual(wsSiblingPath.toFields());
    });
    it('Should fork a prefilled tree and check consistency', async () => {
        const treeId = MerkleTreeId.PUBLIC_DATA_TREE as IndexedTreeId;
        const preInsertIndex = 32;
        for (let i = 0; i < preInsertIndex; i++) {
            await copyState.batchInsert(treeId, [new PublicDataTreeLeaf(slots[i], values[i]).toBuffer()], 0);
        }
        const treeContainer = await EphemeralTreeContainer.create(copyState);
        for (let i = preInsertIndex; i < slots.length; i++) {
            await treeContainer.writePublicStorage(slots[i], values[i]);
        }
        for (let i = 0; i < slots.length; i++) {
            await worldStateTrees.batchInsert(treeId, [new PublicDataTreeLeaf(slots[i], values[i]).toBuffer()], 0);
        }
        const wsRoot = (await worldStateTrees.getTreeInfo(treeId, true)).root;
        const computedRoot = treeContainer.treeMap.get(treeId)!.getRoot();
        expect(computedRoot.toBuffer()).toEqual(wsRoot);
    });
});

describe('Simple Nullifier Consistency', () => {
    it('Should do a simple append and check the root starting with empty', async () => {
        const treeId = MerkleTreeId.NULLIFIER_TREE as IndexedTreeId;
        const treeContainer = await EphemeralTreeContainer.create(copyState);

        const containerInsertionResults: IndexedInsertionResult<NullifierLeafPreimage>[] = [];
        const worldStateInsertionResults: BatchInsertionResult<typeof NULLIFIER_TREE_HEIGHT, 0>[] = [];
        for (let i = 0; i < indexedHashes.length; i++) {
            containerInsertionResults.push(await treeContainer.appendNullifier(indexedHashes[i]));
            worldStateInsertionResults.push(await worldStateTrees.batchInsert(treeId, [indexedHashes[i].toBuffer()], 0));
        }

        const wsRoot = (await worldStateTrees.getTreeInfo(treeId, true)).root;
        const computedRoot = treeContainer.treeMap.get(treeId)!.getRoot();
        expect(computedRoot.toBuffer()).toEqual(wsRoot);

        // Check that all the accumulated insertion results match
        checkEqualityOfInsertionResults(containerInsertionResults, worldStateInsertionResults);

        const wsSiblingPath = await worldStateTrees.getSiblingPath(treeId, getSiblingIndex, true);
        const siblingPath = await treeContainer.getSiblingPath(treeId, getSiblingIndex);
        expect(siblingPath).toEqual(wsSiblingPath.toFields());
    });

    it('Should fork a prefilled tree and check consistency', async () => {
        const treeId = MerkleTreeId.NULLIFIER_TREE as IndexedTreeId;
        const preInsertIndex = 32;
        for (let i = 0; i < preInsertIndex; i++) {
            await copyState.batchInsert(treeId, [indexedHashes[i].toBuffer()], 0);
        }
        const treeContainer = await EphemeralTreeContainer.create(copyState);

        const containerInsertionResults: IndexedInsertionResult<NullifierLeafPreimage>[] = [];
        let worldStateInsertionResults: BatchInsertionResult<typeof NULLIFIER_TREE_HEIGHT, 0>[] = [];
        for (let i = preInsertIndex; i < indexedHashes.length; i++) {
            containerInsertionResults.push(await treeContainer.appendNullifier(indexedHashes[i]));
        }
        for (let i = 0; i < indexedHashes.length; i++) {
            worldStateInsertionResults.push(await worldStateTrees.batchInsert(treeId, [indexedHashes[i].toBuffer()], 0));
        }
        worldStateInsertionResults = worldStateInsertionResults.slice(preInsertIndex);
        checkEqualityOfInsertionResults(containerInsertionResults, worldStateInsertionResults);

        const wsRoot = (await worldStateTrees.getTreeInfo(treeId, true)).root;
        const computedRoot = treeContainer.treeMap.get(treeId)!.getRoot();
        expect(computedRoot.toBuffer()).toEqual(wsRoot);
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
        const ENTRY_COUNT = 64;
        shuffleArray(noteHashes);
        shuffleArray(indexedHashes);
        shuffleArray(slots);
        shuffleArray(values);

        const treeContainer = await EphemeralTreeContainer.create(copyState);

        // Insert values ino merkleTrees
        await worldStateTrees.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, noteHashes.slice(0, ENTRY_COUNT));
        for (let i = 0; i < ENTRY_COUNT; i++) {
            await worldStateTrees.batchInsert(MerkleTreeId.NULLIFIER_TREE, [indexedHashes[i].toBuffer()], 0);
            await worldStateTrees.batchInsert(
                MerkleTreeId.PUBLIC_DATA_TREE,
                [new PublicDataTreeLeaf(slots[i], values[i]).toBuffer()],
                0,
            );
            await treeContainer.appendNoteHash(noteHashes[i]);
            await treeContainer.appendNullifier(indexedHashes[i]);
            await treeContainer.writePublicStorage(slots[i], values[i]);
        }

        const wsRoots = [];
        const computedRoots = [];
        for (const treeId of [MerkleTreeId.NOTE_HASH_TREE, MerkleTreeId.NULLIFIER_TREE, MerkleTreeId.PUBLIC_DATA_TREE]) {
            wsRoots.push((await worldStateTrees.getTreeInfo(treeId, true)).root);
            computedRoots.push(treeContainer.treeMap.get(treeId)!.getRoot().toBuffer());
        }
        for (let i = 0; i < wsRoots.length; i++) {
            expect(computedRoots[i]).toEqual(wsRoots[i]);
        }
        // Get a sibling path
        let wsSiblingPath = await worldStateTrees.getSiblingPath(MerkleTreeId.NOTE_HASH_TREE, getSiblingIndex, true);
        let siblingPath = await treeContainer.getSiblingPath(MerkleTreeId.NOTE_HASH_TREE, getSiblingIndex);
        expect(siblingPath).toEqual(wsSiblingPath.toFields());

        wsSiblingPath = await worldStateTrees.getSiblingPath(MerkleTreeId.NULLIFIER_TREE, getSiblingIndex, true);
        siblingPath = await treeContainer.getSiblingPath(MerkleTreeId.NULLIFIER_TREE, getSiblingIndex);
        expect(siblingPath).toEqual(wsSiblingPath.toFields());

        wsSiblingPath = await worldStateTrees.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, getSiblingIndex, true);
        siblingPath = await treeContainer.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, getSiblingIndex);
        expect(siblingPath).toEqual(wsSiblingPath.toFields());
    });
});

describe('Checking forking and merging', () => {
    it('Should check forked results are eventually consistent', async () => {
        const treeId = MerkleTreeId.PUBLIC_DATA_TREE as IndexedTreeId;
        const treeContainer = await EphemeralTreeContainer.create(copyState);
        // Write all but the last value to the container
        for (let i = 0; i < slots.length - 1; i++) {
            await treeContainer.writePublicStorage(slots[i], values[i]);
        }
        // Fork the ephemeral container
        const forkedContainer = treeContainer.fork();
        // Write the last element to the forked container
        await forkedContainer.writePublicStorage(slots[slots.length - 1], values[slots.length - 1]);
        let forkedRoot = forkedContainer.treeMap.get(treeId)!.getRoot();
        let originalRoot = treeContainer.treeMap.get(treeId)!.getRoot();
        // The roots should NOT match
        expect(forkedRoot.toBuffer()).not.toEqual(originalRoot.toBuffer());
        // write the last element to original container
        await treeContainer.writePublicStorage(slots[slots.length - 1], values[slots.length - 1]);
        originalRoot = treeContainer.treeMap.get(treeId)!.getRoot();
        expect(forkedRoot.toBuffer()).toEqual(originalRoot.toBuffer());
    });

    it('Fork-Rollback-Fork-Merge should be consistent', async () => {
        const treeId = MerkleTreeId.PUBLIC_DATA_TREE as IndexedTreeId;
        const treeContainer = await EphemeralTreeContainer.create(copyState);
        await treeContainer.writePublicStorage(slots[0], values[0]);
        // Fork the ephemeral container (simulaing a nested call)
        const forkedInsertionResults = [];
        const forkedContainer = treeContainer.fork();
        forkedInsertionResults.push(await forkedContainer.writePublicStorage(slots[1], values[1]));
        // We add to this fork but we check it doesnt impact other forks (i.e. Rollback)
        const nestedCallFork = forkedContainer.fork();
        nestedCallFork.writePublicStorage(slots[2], values[2]);
        // We add to the fork
        forkedInsertionResults.push(await forkedContainer.writePublicStorage(slots[3], values[3]));

        // Append to the original state tree
        const wsInsertionResults: BatchInsertionResult<typeof PUBLIC_DATA_TREE_HEIGHT, 0>[] = [];
        await worldStateTrees.batchInsert(treeId, [new PublicDataTreeLeaf(slots[0], values[0]).toBuffer()], 0);
        wsInsertionResults.push(
            await worldStateTrees.batchInsert(treeId, [new PublicDataTreeLeaf(slots[1], values[1]).toBuffer()], 0),
        );
        wsInsertionResults.push(
            await worldStateTrees.batchInsert(treeId, [new PublicDataTreeLeaf(slots[3], values[3]).toBuffer()], 0),
        );

        const containerRoot = forkedContainer.treeMap.get(treeId)!.getRoot();
        const wsRoot = (await worldStateTrees.getTreeInfo(treeId, true)).root;
        expect(containerRoot.toBuffer()).toEqual(wsRoot);

        // Check that all the accumulated insertion results
        checkEqualityOfInsertionResults(forkedInsertionResults, wsInsertionResults);
    });
});

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
});
