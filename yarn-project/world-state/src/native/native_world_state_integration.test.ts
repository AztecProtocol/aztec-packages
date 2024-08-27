import {
  type FrTreeId,
  type IndexedTreeId,
  L2Block,
  MerkleTreeId,
  PublicDataWrite,
  TxEffect,
} from '@aztec/circuit-types';
import {
  AppendOnlyTreeSnapshot,
  Fr,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  NULLIFIER_SUBTREE_HEIGHT,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  NullifierLeaf,
  PUBLIC_DATA_SUBTREE_HEIGHT,
  PublicDataTreeLeaf,
} from '@aztec/circuits.js';
import { padArrayEnd } from '@aztec/foundation/collection';
import { elapsed } from '@aztec/foundation/timer';
import { AztecLmdbStore } from '@aztec/kv-store/lmdb';
import { openTmpStore } from '@aztec/kv-store/utils';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { type MerkleTreeDb } from '../world-state-db/merkle_tree_db.js';
import { MerkleTrees } from '../world-state-db/merkle_trees.js';
import { NativeWorldStateService } from './native_world_state.js';

describe('NativeWorldState', () => {
  let nativeDataDir: string;
  let legacyDataDir: string;

  let nativeWS: NativeWorldStateService;
  let legacyWS: MerkleTrees;

  const allTrees = Object.values(MerkleTreeId)
    .filter((x): x is MerkleTreeId => typeof x === 'number')
    .map(x => [MerkleTreeId[x], x] as const);

  beforeAll(async () => {
    nativeDataDir = await mkdtemp(join(tmpdir(), 'native_world_state_test-'));
    legacyDataDir = await mkdtemp(join(tmpdir(), 'js_world_state_test-'));
  });

  afterAll(async () => {
    await rm(nativeDataDir, { recursive: true });
    await rm(legacyDataDir, { recursive: true });
  });

  beforeAll(async () => {
    nativeWS = await NativeWorldStateService.create(nativeDataDir);
    legacyWS = await MerkleTrees.new(AztecLmdbStore.open(legacyDataDir), new NoopTelemetryClient());
  });

  describe('Initial state', () => {
    it.each(
      allTrees.flatMap(t => [
        [...t, false],
        [...t, true],
      ]),
    )('tree %s is the same', async (_, treeId, includeUncommitted) => {
      await assertSameTree(treeId, includeUncommitted);
    });

    it.each([false, true])('includeUncommitted=%s state is the same', async includeUncommitted => {
      await assertSameState(includeUncommitted);
    });
  });

  describe('Uncommitted state', () => {
    afterEach(async () => {
      await Promise.all([nativeWS.rollback(), legacyWS.rollback()]);
    });

    it.each<[string, IndexedTreeId, Buffer[]]>([
      [
        MerkleTreeId[MerkleTreeId.NULLIFIER_TREE],
        MerkleTreeId.NULLIFIER_TREE,
        Array(64).fill(new NullifierLeaf(Fr.ZERO).toBuffer()),
      ],
      [
        MerkleTreeId[MerkleTreeId.PUBLIC_DATA_TREE],
        MerkleTreeId.PUBLIC_DATA_TREE,
        Array(64).fill(new PublicDataTreeLeaf(Fr.ZERO, Fr.ZERO).toBuffer()),
      ],
    ])('inserting 0 leaves into %s', async (_, treeId, leaves) => {
      const height = Math.ceil(Math.log2(leaves.length) | 0);
      const [native, js] = await Promise.all([
        nativeWS.batchInsert(treeId, leaves, height),
        legacyWS.batchInsert(treeId, leaves, height),
      ]);

      expect(native.sortedNewLeaves.map(Fr.fromBuffer)).toEqual(js.sortedNewLeaves.map(Fr.fromBuffer));
      expect(native.sortedNewLeavesIndexes).toEqual(js.sortedNewLeavesIndexes);
      expect(native.newSubtreeSiblingPath.toFields()).toEqual(js.newSubtreeSiblingPath.toFields());
      expect(native.lowLeavesWitnessData).toEqual(js.lowLeavesWitnessData);

      await assertSameTree(treeId, true);
    });

    it.each<[string, FrTreeId, Fr[]]>([
      [MerkleTreeId[MerkleTreeId.NOTE_HASH_TREE], MerkleTreeId.NOTE_HASH_TREE, Array(64).fill(Fr.ZERO)],
      [MerkleTreeId[MerkleTreeId.L1_TO_L2_MESSAGE_TREE], MerkleTreeId.NOTE_HASH_TREE, Array(64).fill(Fr.ZERO)],
    ])('inserting 0 leaves into %s', async (_, treeId, leaves) => {
      await Promise.all([nativeWS.appendLeaves(treeId, leaves), legacyWS.appendLeaves(treeId, leaves)]);

      await assertSameTree(treeId, true);
    });

    it.each<[string, IndexedTreeId, Buffer[]]>([
      [
        MerkleTreeId[MerkleTreeId.NULLIFIER_TREE],
        MerkleTreeId.NULLIFIER_TREE,
        Array(64)
          .fill(0)
          .map(() => new NullifierLeaf(Fr.random()).toBuffer()),
      ],
      [
        MerkleTreeId[MerkleTreeId.PUBLIC_DATA_TREE],
        MerkleTreeId.PUBLIC_DATA_TREE,
        Array(64)
          .fill(0)
          .map(() => new PublicDataTreeLeaf(Fr.random(), Fr.random()).toBuffer()),
      ],
    ])('inserting real leaves into %s', async (_, treeId, leaves) => {
      const height = Math.ceil(Math.log2(leaves.length) | 0);
      const [native, js] = await Promise.all([
        nativeWS.batchInsert(treeId, leaves, height),
        legacyWS.batchInsert(treeId, leaves, height),
      ]);

      expect(native.sortedNewLeaves.map(Fr.fromBuffer)).toEqual(js.sortedNewLeaves.map(Fr.fromBuffer));
      expect(native.sortedNewLeavesIndexes).toEqual(js.sortedNewLeavesIndexes);
      expect(native.newSubtreeSiblingPath.toFields()).toEqual(js.newSubtreeSiblingPath.toFields());
      expect(native.lowLeavesWitnessData).toEqual(js.lowLeavesWitnessData);

      await assertSameTree(treeId, true);
    });

    it.each<[string, FrTreeId, Fr[]]>([
      [MerkleTreeId[MerkleTreeId.NOTE_HASH_TREE], MerkleTreeId.NOTE_HASH_TREE, Array(64).fill(0).map(Fr.random)],
      [MerkleTreeId[MerkleTreeId.L1_TO_L2_MESSAGE_TREE], MerkleTreeId.NOTE_HASH_TREE, Array(64).fill(0).map(Fr.random)],
    ])('inserting real leaves into %s', async (_, treeId, leaves) => {
      await Promise.all([nativeWS.appendLeaves(treeId, leaves), legacyWS.appendLeaves(treeId, leaves)]);

      await assertSameTree(treeId, true);
    });

    it.each<[string, MerkleTreeId, number[]]>([
      [MerkleTreeId[MerkleTreeId.NULLIFIER_TREE], MerkleTreeId.NULLIFIER_TREE, [0, 1, 10, 127, 128, 256]],
      [MerkleTreeId[MerkleTreeId.NOTE_HASH_TREE], MerkleTreeId.NOTE_HASH_TREE, [0, 1, 10, 127, 128, 256]],
      [MerkleTreeId[MerkleTreeId.PUBLIC_DATA_TREE], MerkleTreeId.PUBLIC_DATA_TREE, [0, 1, 10, 127, 128, 256]],
      [MerkleTreeId[MerkleTreeId.L1_TO_L2_MESSAGE_TREE], MerkleTreeId.NOTE_HASH_TREE, [0, 1, 10, 127, 128, 256]],
    ])('sibling paths to initial leaves match', async (_, treeId, leafIndices) => {
      for (const index of leafIndices) {
        const [nativeSB, legacySB] = await Promise.all([
          nativeWS.getSiblingPath(treeId, BigInt(index), true),
          legacyWS.getSiblingPath(treeId, BigInt(index), true),
        ]);
        expect(nativeSB.toFields()).toEqual(legacySB.toFields());
      }
    });

    it.each<[string, IndexedTreeId, Buffer, (b: Buffer) => bigint]>([
      [
        MerkleTreeId[MerkleTreeId.NULLIFIER_TREE],
        MerkleTreeId.NULLIFIER_TREE,
        new NullifierLeaf(Fr.random()).toBuffer(),
        b => NullifierLeaf.fromBuffer(b).getKey(),
      ],
      [
        MerkleTreeId[MerkleTreeId.PUBLIC_DATA_TREE],
        MerkleTreeId.PUBLIC_DATA_TREE,
        new PublicDataTreeLeaf(Fr.random(), Fr.random()).toBuffer(),
        b => PublicDataTreeLeaf.fromBuffer(b).getKey(),
      ],
    ])('inserting real leaves into %s', async (_, treeId, leaf, getKey) => {
      await Promise.all([nativeWS.batchInsert(treeId, [leaf], 0), legacyWS.batchInsert(treeId, [leaf], 0)]);

      const [nativeLeafIndex, legacyLeafIndex] = await Promise.all([
        nativeWS.getPreviousValueIndex(treeId, getKey(leaf), true),
        legacyWS.getPreviousValueIndex(treeId, getKey(leaf), true),
      ]);
      expect(nativeLeafIndex).toEqual(legacyLeafIndex);

      const [nativeSB, legacySB] = await Promise.all([
        nativeWS.getSiblingPath(treeId, nativeLeafIndex!.index, true),
        legacyWS.getSiblingPath(treeId, legacyLeafIndex!.index, true),
      ]);

      expect(nativeSB.toFields()).toEqual(legacySB.toFields());
    });
  });

  describe('Block synch', () => {
    it('syncs a new block from empty state', async () => {
      await assertSameState(false);
      const [_blockMS, { block, messages }] = await elapsed(mockBlock(1));

      const [_nativeMs] = await elapsed(nativeWS.handleL2BlockAndMessages(block, messages));
      const [_legacyMs] = await elapsed(legacyWS.handleL2BlockAndMessages(block, messages));

      // console.log(`Native: ${nativeMs} ms, Legacy: ${legacyMs} ms. Generating mock block took ${blockMS} ms`);

      await assertSameState(false);
    }, 15_000);
  });

  async function assertSameTree(treeId: MerkleTreeId, includeUncommitted = false) {
    const nativeInfo = await nativeWS.getTreeInfo(treeId, includeUncommitted);
    const jsInfo = await legacyWS.getTreeInfo(treeId, includeUncommitted);
    expect(nativeInfo.treeId).toBe(jsInfo.treeId);
    expect(nativeInfo.depth).toBe(jsInfo.depth);
    expect(nativeInfo.size).toBe(jsInfo.size);
    expect(Fr.fromBuffer(nativeInfo.root)).toEqual(Fr.fromBuffer(jsInfo.root));
  }

  async function assertSameState(includeUncommitted = false) {
    const nativeStateRef = await nativeWS.getStateReference(includeUncommitted);
    const legacyStateRef = await legacyWS.getStateReference(includeUncommitted);
    expect(nativeStateRef).toEqual(legacyStateRef);
  }

  async function mockBlock(blockNum = 1, merkleTrees?: MerkleTreeDb) {
    merkleTrees ??= await MerkleTrees.new(openTmpStore(), new NoopTelemetryClient());
    const l2Block = L2Block.random(blockNum, 2); // 2 txs
    const l1ToL2Messages = Array(16).fill(0).map(Fr.random);

    const paddedTxEffects = padArrayEnd(
      l2Block.body.txEffects,
      TxEffect.empty(),
      l2Block.body.numberOfTxsIncludingPadded,
    );

    // Sync the append only trees
    {
      const noteHashesPadded = paddedTxEffects.flatMap(txEffect =>
        padArrayEnd(txEffect.noteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
      );
      await merkleTrees.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, noteHashesPadded);

      const l1ToL2MessagesPadded = padArrayEnd(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
      await merkleTrees.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, l1ToL2MessagesPadded);
    }

    // Sync the indexed trees
    {
      const nullifiersPadded = paddedTxEffects.flatMap(txEffect =>
        padArrayEnd(txEffect.nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX),
      );
      await merkleTrees.batchInsert(
        MerkleTreeId.NULLIFIER_TREE,
        nullifiersPadded.map(nullifier => nullifier.toBuffer()),
        NULLIFIER_SUBTREE_HEIGHT,
      );

      // We insert the public data tree leaves with one batch per tx to avoid updating the same key twice
      for (const txEffect of paddedTxEffects) {
        const publicDataWrites = padArrayEnd(
          txEffect.publicDataWrites,
          PublicDataWrite.empty(),
          MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
        );

        await merkleTrees.batchInsert(
          MerkleTreeId.PUBLIC_DATA_TREE,
          publicDataWrites.map(write => new PublicDataTreeLeaf(write.leafIndex, write.newValue).toBuffer()),
          PUBLIC_DATA_SUBTREE_HEIGHT,
        );
      }
    }

    // await merkleTrees.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, l1ToL2Messages);
    const state = await merkleTrees.getStateReference(true);
    l2Block.header.state = state;
    await merkleTrees.updateArchive(l2Block.header, true);

    const archiveState = await merkleTrees.getTreeInfo(MerkleTreeId.ARCHIVE, true);

    l2Block.archive = new AppendOnlyTreeSnapshot(Fr.fromBuffer(archiveState.root), Number(archiveState.size));

    return {
      block: l2Block,
      messages: l1ToL2Messages,
    };
  }
});
