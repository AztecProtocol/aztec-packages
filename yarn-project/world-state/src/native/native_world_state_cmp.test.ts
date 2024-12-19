import {
  type FrTreeId,
  type IndexedTreeId,
  MerkleTreeId,
  type MerkleTreeReadOperations,
  type MerkleTreeWriteOperations,
} from '@aztec/circuit-types';
import { EthAddress, Fr, GENESIS_ARCHIVE_ROOT, NullifierLeaf, PublicDataTreeLeaf } from '@aztec/circuits.js';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { elapsed } from '@aztec/foundation/timer';
import { type AztecKVStore } from '@aztec/kv-store';
import { AztecLmdbStore } from '@aztec/kv-store/lmdb';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { jest } from '@jest/globals';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { WorldStateInstrumentation } from '../instrumentation/instrumentation.js';
import { mockBlock } from '../test/utils.js';
import { MerkleTrees } from '../world-state-db/merkle_trees.js';
import { NativeWorldStateService } from './native_world_state.js';

jest.setTimeout(60_000);

describe('NativeWorldState', () => {
  let nativeDataDir: string;
  let legacyDataDir: string;

  let nativeWS: NativeWorldStateService;
  let legacyWS: MerkleTrees;

  let log: Logger;

  let legacyStore: AztecKVStore;

  const allTrees = Object.values(MerkleTreeId)
    .filter((x): x is MerkleTreeId => typeof x === 'number')
    .map(x => [MerkleTreeId[x], x] as const);

  beforeAll(async () => {
    nativeDataDir = await mkdtemp(join(tmpdir(), 'native_world_state_test-'));
    legacyDataDir = await mkdtemp(join(tmpdir(), 'js_world_state_test-'));

    log = createLogger('world-state:test:native_world_state_cmp');
  });

  afterAll(async () => {
    await legacyStore.delete();
    await rm(nativeDataDir, { recursive: true });
  });

  beforeAll(async () => {
    legacyStore = AztecLmdbStore.open(legacyDataDir);
    nativeWS = await NativeWorldStateService.new(
      EthAddress.random(),
      nativeDataDir,
      1024 * 1024,
      new WorldStateInstrumentation(new NoopTelemetryClient()),
    );
    legacyWS = await MerkleTrees.new(legacyStore, new NoopTelemetryClient());
  });

  it('has to expected genesis archive tree root', async () => {
    const archive = await nativeWS.getCommitted().getTreeInfo(MerkleTreeId.ARCHIVE);
    expect(new Fr(archive.root)).toEqual(new Fr(GENESIS_ARCHIVE_ROOT));
  });

  describe('Initial state', () => {
    it.each(allTrees)('tree %s is the same', async (_, treeId) => {
      await assertSameTree(treeId, nativeWS.getCommitted(), legacyWS.getCommitted());
    });

    it('initial state is the same', async () => {
      await assertSameState(nativeWS.getCommitted(), legacyWS.getCommitted());
    });
  });

  describe('Uncommitted state', () => {
    let nativeFork: MerkleTreeWriteOperations;
    let legacyLatest: MerkleTreeWriteOperations;

    beforeEach(async () => {
      nativeFork = await nativeWS.fork();
      legacyLatest = await legacyWS.getLatest();
    });

    afterEach(async () => {
      await Promise.all([nativeFork.close(), legacyWS.rollback()]);
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
        nativeFork.batchInsert(treeId, leaves, height),
        legacyLatest.batchInsert(treeId, leaves, height),
      ]);

      expect(native.sortedNewLeaves.map(Fr.fromBuffer)).toEqual(js.sortedNewLeaves.map(Fr.fromBuffer));
      expect(native.sortedNewLeavesIndexes).toEqual(js.sortedNewLeavesIndexes);
      expect(native.newSubtreeSiblingPath.toFields()).toEqual(js.newSubtreeSiblingPath.toFields());
      expect(native.lowLeavesWitnessData).toEqual(js.lowLeavesWitnessData);

      await assertSameTree(treeId, nativeFork, legacyLatest);
    });

    it.each<[string, FrTreeId, Fr[]]>([
      [MerkleTreeId[MerkleTreeId.NOTE_HASH_TREE], MerkleTreeId.NOTE_HASH_TREE, Array(64).fill(Fr.ZERO)],
      [MerkleTreeId[MerkleTreeId.L1_TO_L2_MESSAGE_TREE], MerkleTreeId.NOTE_HASH_TREE, Array(64).fill(Fr.ZERO)],
    ])('inserting 0 leaves into %s', async (_, treeId, leaves) => {
      await Promise.all([nativeFork.appendLeaves(treeId, leaves), legacyLatest.appendLeaves(treeId, leaves)]);
      await assertSameTree(treeId, nativeFork, legacyLatest);
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
        nativeFork.batchInsert(treeId, leaves, height),
        legacyLatest.batchInsert(treeId, leaves, height),
      ]);

      expect(native.sortedNewLeaves.map(Fr.fromBuffer)).toEqual(js.sortedNewLeaves.map(Fr.fromBuffer));
      expect(native.sortedNewLeavesIndexes).toEqual(js.sortedNewLeavesIndexes);
      expect(native.newSubtreeSiblingPath.toFields()).toEqual(js.newSubtreeSiblingPath.toFields());
      expect(native.lowLeavesWitnessData).toEqual(js.lowLeavesWitnessData);

      await assertSameTree(treeId, nativeFork, legacyLatest);
    });

    it.each<[string, FrTreeId, Fr[]]>([
      [MerkleTreeId[MerkleTreeId.NOTE_HASH_TREE], MerkleTreeId.NOTE_HASH_TREE, Array(64).fill(0).map(Fr.random)],
      [MerkleTreeId[MerkleTreeId.L1_TO_L2_MESSAGE_TREE], MerkleTreeId.NOTE_HASH_TREE, Array(64).fill(0).map(Fr.random)],
    ])('inserting real leaves into %s', async (_, treeId, leaves) => {
      await Promise.all([nativeFork.appendLeaves(treeId, leaves), legacyLatest.appendLeaves(treeId, leaves)]);

      await assertSameTree(treeId, nativeFork, legacyLatest);
    });

    it.each<[string, MerkleTreeId, number[]]>([
      [MerkleTreeId[MerkleTreeId.NULLIFIER_TREE], MerkleTreeId.NULLIFIER_TREE, [0, 1, 10, 127, 128, 256]],
      [MerkleTreeId[MerkleTreeId.NOTE_HASH_TREE], MerkleTreeId.NOTE_HASH_TREE, [0, 1, 10, 127, 128, 256]],
      [MerkleTreeId[MerkleTreeId.PUBLIC_DATA_TREE], MerkleTreeId.PUBLIC_DATA_TREE, [0, 1, 10, 127, 128, 256]],
      [MerkleTreeId[MerkleTreeId.L1_TO_L2_MESSAGE_TREE], MerkleTreeId.NOTE_HASH_TREE, [0, 1, 10, 127, 128, 256]],
    ])('sibling paths to initial leaves match', async (_, treeId, leafIndices) => {
      for (const index of leafIndices) {
        const [nativeSB, legacySB] = await Promise.all([
          nativeFork.getSiblingPath(treeId, BigInt(index)),
          legacyLatest.getSiblingPath(treeId, BigInt(index)),
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
      await Promise.all([nativeFork.batchInsert(treeId, [leaf], 0), legacyLatest.batchInsert(treeId, [leaf], 0)]);

      const [nativeLeafIndex, legacyLeafIndex] = await Promise.all([
        nativeFork.getPreviousValueIndex(treeId, getKey(leaf)),
        legacyLatest.getPreviousValueIndex(treeId, getKey(leaf)),
      ]);
      expect(nativeLeafIndex).toEqual(legacyLeafIndex);

      const [nativeSB, legacySB] = await Promise.all([
        nativeFork.getSiblingPath(treeId, nativeLeafIndex!.index),
        legacyLatest.getSiblingPath(treeId, legacyLeafIndex!.index),
      ]);

      expect(nativeSB.toFields()).toEqual(legacySB.toFields());
    });
  });

  describe('Block synch', () => {
    it('syncs a new block from empty state', async () => {
      await assertSameState(nativeWS.getCommitted(), legacyWS.getCommitted());
      const tempFork = await nativeWS.fork();
      const numBlocks = 1;
      const numTxs = 32;
      const blocks = [];
      const messagesArray = [];
      for (let i = 0; i < numBlocks; i++) {
        const [_blockMS, { block, messages }] = await elapsed(mockBlock(1 + i, numTxs, tempFork));
        blocks.push(block);
        messagesArray.push(messages);
      }

      await tempFork.close();

      for (let i = 0; i < numBlocks; i++) {
        const [_nativeMs] = await elapsed(nativeWS.handleL2BlockAndMessages(blocks[i], messagesArray[i]));
        const [_legacyMs] = await elapsed(legacyWS.handleL2BlockAndMessages(blocks[i], messagesArray[i]));
        log.info(`Native: ${_nativeMs} ms, Legacy: ${_legacyMs} ms.`);
      }

      await assertSameTree(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, nativeWS.getCommitted(), legacyWS.getCommitted());
      await assertSameTree(MerkleTreeId.NOTE_HASH_TREE, nativeWS.getCommitted(), legacyWS.getCommitted());
      await assertSameTree(MerkleTreeId.PUBLIC_DATA_TREE, nativeWS.getCommitted(), legacyWS.getCommitted());
      await assertSameTree(MerkleTreeId.NULLIFIER_TREE, nativeWS.getCommitted(), legacyWS.getCommitted());
      await assertSameTree(MerkleTreeId.ARCHIVE, nativeWS.getCommitted(), legacyWS.getCommitted());
    }, 86400_000);
  });

  async function assertSameTree(
    treeId: MerkleTreeId,
    forkA: MerkleTreeReadOperations,
    forkB: MerkleTreeReadOperations,
  ) {
    const nativeInfo = await forkA.getTreeInfo(treeId);
    const jsInfo = await forkB.getTreeInfo(treeId);
    expect(nativeInfo.treeId).toBe(jsInfo.treeId);
    expect(nativeInfo.depth).toBe(jsInfo.depth);
    expect(nativeInfo.size).toBe(jsInfo.size);
    expect(Fr.fromBuffer(nativeInfo.root)).toEqual(Fr.fromBuffer(jsInfo.root));
  }

  async function assertSameState(forkA: MerkleTreeReadOperations, forkB: MerkleTreeReadOperations) {
    const nativeStateRef = await forkA.getStateReference();
    const nativeArchive = await forkA.getTreeInfo(MerkleTreeId.ARCHIVE);
    const legacyStateRef = await forkB.getStateReference();
    const legacyArchive = await forkB.getTreeInfo(MerkleTreeId.ARCHIVE);

    expect(nativeStateRef).toEqual(legacyStateRef);
    expect(nativeArchive).toEqual(legacyArchive);
  }
});
