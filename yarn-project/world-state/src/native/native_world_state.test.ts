import {
  ARCHIVE_HEIGHT,
  L1_TO_L2_MSG_TREE_HEIGHT,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  NOTE_HASH_TREE_HEIGHT,
  NULLIFIER_TREE_HEIGHT,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  PUBLIC_DATA_TREE_HEIGHT,
} from '@aztec/constants';
import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { randomBytes } from '@aztec/foundation/crypto/random';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { retryUntil } from '@aztec/foundation/retry';
import type { SiblingPath } from '@aztec/foundation/trees';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import { L2Block } from '@aztec/stdlib/block';
import { DatabaseVersionManager } from '@aztec/stdlib/database-version/manager';
import { DatabaseVersion } from '@aztec/stdlib/database-version/version';
import type { MerkleTreeLeafType, MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import { makeGlobalVariables } from '@aztec/stdlib/testing';
import { AppendOnlyTreeSnapshot, MerkleTreeId, PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import { BlockHeader } from '@aztec/stdlib/tx';
import type { GenesisData } from '@aztec/stdlib/world-state';

import { jest } from '@jest/globals';
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import type { WorldStateTreeMapSizes } from '../synchronizer/factory.js';
import { assertSameState, compareChains, mockBlock, mockEmptyBlock, updateBlockState } from '../test/utils.js';
import { INITIAL_NULLIFIER_TREE_SIZE, INITIAL_PUBLIC_DATA_TREE_SIZE } from '../world-state-db/merkle_tree_db.js';
import type { WorldStateStatusSummary } from './message.js';
import { NativeWorldStateService, WORLD_STATE_DB_VERSION, WORLD_STATE_DIR } from './native_world_state.js';

jest.setTimeout(60_000);

describe('NativeWorldState', () => {
  let dataDir: string;
  let backupDir: string | undefined;
  let rollupAddress: EthAddress;
  const defaultDBMapSize = 128 * 1024 * 1024; // 128 GB
  const tbMapSize = 1024 * 1024 * 1024; // 1 TB
  const wsTreeMapSizes: WorldStateTreeMapSizes = {
    archiveTreeMapSizeKb: defaultDBMapSize,
    nullifierTreeMapSizeKb: tbMapSize,
    noteHashTreeMapSizeKb: tbMapSize,
    messageTreeMapSizeKb: defaultDBMapSize,
    publicDataTreeMapSizeKb: tbMapSize,
  };

  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'world-state-test'));
    rollupAddress = EthAddress.random();
  });

  afterAll(async () => {
    await rm(dataDir, { recursive: true, maxRetries: 3 });
    if (backupDir) {
      await rm(backupDir, { recursive: true, maxRetries: 3 });
    }
  });

  describe('Padding', () => {
    let ws: NativeWorldStateService;
    let fork: MerkleTreeWriteOperations;

    beforeEach(async () => {
      ws = await NativeWorldStateService.tmp();
      fork = await ws.fork();
    });

    afterEach(async () => {
      await fork.close();
      await ws.close();
    });

    it('pads messages, note hashes, nullifiers correctly for first block', async () => {
      const isFirstBlock = true;
      const txsPerBlock = 2;
      const maxEffects = 1;
      const numMessages = 2;
      const { block, messages } = await mockBlock(
        BlockNumber(1),
        txsPerBlock,
        fork,
        maxEffects,
        numMessages,
        isFirstBlock,
      );

      const status = await ws.handleL2BlockAndMessages(block, messages);

      expect(status.meta.messageTreeMeta.size).toBe(BigInt(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP));

      const expectedNoteHashCount = txsPerBlock * MAX_NOTE_HASHES_PER_TX;
      expect(status.meta.noteHashTreeMeta.size).toBe(BigInt(expectedNoteHashCount));

      const expectedNullifierCount = txsPerBlock * MAX_NULLIFIERS_PER_TX;
      expect(status.meta.nullifierTreeMeta.size).toBe(BigInt(INITIAL_NULLIFIER_TREE_SIZE + expectedNullifierCount));

      // Public data writes are never padded.
      const expectedPublicDataCount = txsPerBlock * maxEffects;
      expect(status.meta.publicDataTreeMeta.size).toBe(BigInt(INITIAL_PUBLIC_DATA_TREE_SIZE + expectedPublicDataCount));
    });

    it('pads everything except for l1 to l2 messages for non-first block', async () => {
      const isFirstBlock = false;
      const txsPerBlock = 2;
      const maxEffects = 1;
      const numMessages = 0;
      const { block, messages } = await mockBlock(
        BlockNumber(1),
        txsPerBlock,
        fork,
        maxEffects,
        numMessages,
        isFirstBlock,
      );

      const status = await ws.handleL2BlockAndMessages(block, messages);

      // L1 to L2 messages should NOT grow for non-first blocks
      expect(status.meta.messageTreeMeta.size).toBe(0n);

      // Note hashes should be padded.
      const expectedNoteHashCount = txsPerBlock * MAX_NOTE_HASHES_PER_TX;
      expect(status.meta.noteHashTreeMeta.size).toBe(BigInt(expectedNoteHashCount));

      // Nullifiers should be padded.
      const expectedNullifierCount = txsPerBlock * MAX_NULLIFIERS_PER_TX;
      expect(status.meta.nullifierTreeMeta.size).toBe(BigInt(INITIAL_NULLIFIER_TREE_SIZE + expectedNullifierCount));

      // Public data writes are never padded.
      const expectedPublicDataCount = txsPerBlock * maxEffects;
      expect(status.meta.publicDataTreeMeta.size).toBe(BigInt(INITIAL_PUBLIC_DATA_TREE_SIZE + expectedPublicDataCount));
    });

    it('pads empty messages array for first block', async () => {
      const isFirstBlock = true;
      const numMessages = 0;
      const { block, messages } = await mockBlock(BlockNumber(1), 1, fork, 1, numMessages, isFirstBlock);

      const status = await ws.handleL2BlockAndMessages(block, messages);
      expect(status.meta.messageTreeMeta.size).toBe(BigInt(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP));
    });

    it('throws error if messages are provided for non-first block', async () => {
      const isFirstBlock = false;
      const numMessages = 1;
      const { block, messages } = await mockBlock(BlockNumber(1), 1, fork, 1, numMessages, isFirstBlock);

      await expect(ws.handleL2BlockAndMessages(block, messages)).rejects.toThrow(
        'L1 to L2 messages must be empty for non-first blocks',
      );
    });
  });

  describe('Persistence', () => {
    let block: L2Block;
    let messages: Fr[];
    let noteHash: Fr;

    const findLeafIndex = async (leaf: Fr, ws: NativeWorldStateService) => {
      const indices = await ws.getCommitted().findLeafIndices(MerkleTreeId.NOTE_HASH_TREE, [leaf]);
      if (indices.length === 0) {
        return undefined;
      }
      return indices[0];
    };

    const writeVersion = (baseDir: string) =>
      DatabaseVersionManager.writeVersion(
        new DatabaseVersion(WORLD_STATE_DB_VERSION, rollupAddress),
        join(baseDir, WORLD_STATE_DIR),
      );

    beforeAll(async () => {
      const ws = await NativeWorldStateService.new(rollupAddress, dataDir, wsTreeMapSizes);
      const fork = await ws.fork();
      ({ block, messages } = await mockBlock(BlockNumber(1), 2, fork));
      noteHash = block.body.txEffects[0].noteHashes[0];
      await fork.close();

      await ws.handleL2BlockAndMessages(block, messages);
      await ws.close();
    });

    it('correctly restores committed state', async () => {
      const ws = await NativeWorldStateService.new(rollupAddress, dataDir, wsTreeMapSizes);
      await expect(findLeafIndex(block.body.txEffects[0].noteHashes[0], ws)).resolves.toBeDefined();
      const status = await ws.getStatusSummary();
      expect(status.unfinalizedBlockNumber).toBe(1);
      await ws.close();
    });

    it('copies and restores committed state', async () => {
      backupDir = await mkdtemp(join(tmpdir(), 'world-state-backup-test'));
      const ws = await NativeWorldStateService.new(rollupAddress, dataDir, wsTreeMapSizes);
      await expect(findLeafIndex(noteHash, ws)).resolves.toBeDefined();
      await ws.backupTo(join(backupDir, WORLD_STATE_DIR), true);
      await ws.close();

      await writeVersion(backupDir);
      const ws2 = await NativeWorldStateService.new(rollupAddress, backupDir, wsTreeMapSizes);
      const status2 = await ws2.getStatusSummary();
      expect(status2.unfinalizedBlockNumber).toBe(1);
      await expect(findLeafIndex(noteHash, ws2)).resolves.toBeDefined();
      expect((await ws2.getStatusSummary()).unfinalizedBlockNumber).toBe(1);
      await ws2.close();
    });

    it('blocks writes while copying', async () => {
      backupDir = await mkdtemp(join(tmpdir(), 'world-state-backup-test'));
      const ws = await NativeWorldStateService.new(rollupAddress, dataDir, wsTreeMapSizes);
      const copyPromise = ws.backupTo(join(backupDir, WORLD_STATE_DIR), true);

      await timesAsync(5, async i => {
        const fork = await ws.fork();
        const { block, messages } = await mockBlock(BlockNumber(i + 1), 2, fork);
        await ws.handleL2BlockAndMessages(block, messages);
        await fork.close();
      });

      await copyPromise;
      expect((await ws.getStatusSummary()).unfinalizedBlockNumber).toBe(6);
      await ws.close();

      await writeVersion(backupDir);
      const ws2 = await NativeWorldStateService.new(rollupAddress, backupDir, wsTreeMapSizes);
      await expect(findLeafIndex(block.body.txEffects[0].noteHashes[0], ws2)).resolves.toBeDefined();
      expect((await ws2.getStatusSummary()).unfinalizedBlockNumber).toBe(1);
      await ws2.close();
    });

    it('clears the database if the rollup is different', async () => {
      // open ws against the same data dir but a different rollup
      let ws = await NativeWorldStateService.new(EthAddress.random(), dataDir, wsTreeMapSizes);
      // db should be empty
      await expect(findLeafIndex(block.body.txEffects[0].noteHashes[0], ws)).resolves.toBeUndefined();

      await ws.close();

      // later on, open ws against the original rollup and same data dir
      // db should be empty because we wiped all its files earlier
      ws = await NativeWorldStateService.new(rollupAddress, dataDir, wsTreeMapSizes);
      await expect(findLeafIndex(block.body.txEffects[0].noteHashes[0], ws)).resolves.toBeUndefined();
      const status = await ws.getStatusSummary();
      expect(status.unfinalizedBlockNumber).toBe(0);
      await ws.close();
    });

    it('clears the database if the world state version is different', async () => {
      // open ws against the data again
      let ws = await NativeWorldStateService.new(rollupAddress, dataDir, wsTreeMapSizes);
      // db should be empty
      let emptyStatus = await ws.getStatusSummary();
      expect(emptyStatus.unfinalizedBlockNumber).toBe(0);

      // populate it and then close it
      const fork = await ws.fork();
      ({ block, messages } = await mockBlock(BlockNumber(1), 2, fork));
      await fork.close();

      const status = await ws.handleL2BlockAndMessages(block, messages);
      expect(status.summary.unfinalizedBlockNumber).toBe(1);
      await ws.close();
      // we open up the version file that was created and modify the version to be older
      const fullPath = join(dataDir, 'world_state', DatabaseVersionManager.VERSION_FILE);
      const storedWorldStateVersion = DatabaseVersion.fromBuffer(await readFile(fullPath));
      expect(storedWorldStateVersion).toBeDefined();
      const modifiedVersion = new DatabaseVersion(
        storedWorldStateVersion!.schemaVersion - 1,
        storedWorldStateVersion!.rollupAddress,
      );
      await writeFile(fullPath, modifiedVersion.toBuffer());

      // Open the world state again and it should be empty
      ws = await NativeWorldStateService.new(rollupAddress, dataDir, wsTreeMapSizes);
      // db should be empty
      emptyStatus = await ws.getStatusSummary();
      expect(emptyStatus.unfinalizedBlockNumber).toBe(0);
      await ws.close();
    });

    it('fails to sync further blocks if trees are out of sync', async () => {
      // open ws against the same data dir but a different rollup and with a small max db size
      const rollupAddress = EthAddress.random();
      const wsTreeMapSizes: WorldStateTreeMapSizes = {
        archiveTreeMapSizeKb: 1024,
        nullifierTreeMapSizeKb: 1024,
        noteHashTreeMapSizeKb: 1024,
        messageTreeMapSizeKb: 1024,
        publicDataTreeMapSizeKb: 1024,
      };
      const ws = await NativeWorldStateService.new(rollupAddress, dataDir, wsTreeMapSizes);
      const initialFork = await ws.fork();

      const { block: block1, messages: messages1 } = await mockBlock(BlockNumber(1), 8, initialFork);
      const { block: block2, messages: messages2 } = await mockBlock(BlockNumber(2), 8, initialFork);
      const { block: block3, messages: messages3 } = await mockBlock(BlockNumber(3), 8, initialFork);

      // The first block should succeed
      await expect(ws.handleL2BlockAndMessages(block1, messages1)).resolves.toBeDefined();

      // The trees should be synched at block 1
      const goodSummary = await ws.getStatusSummary();
      expect(goodSummary).toEqual({
        unfinalizedBlockNumber: BlockNumber(1),
        finalizedBlockNumber: BlockNumber(0),
        oldestHistoricalBlock: BlockNumber(1),
        treesAreSynched: true,
      } as WorldStateStatusSummary);

      // The second block should fail
      await expect(ws.handleL2BlockAndMessages(block2, messages2)).rejects.toThrow();

      // The summary should indicate that the unfinalized block number (that of the archive tree) is 2
      // But it should also tell us that the trees are not synched
      const badSummary = await ws.getStatusSummary();
      expect(badSummary).toEqual({
        unfinalizedBlockNumber: BlockNumber(2),
        finalizedBlockNumber: BlockNumber(0),
        oldestHistoricalBlock: BlockNumber(1),
        treesAreSynched: false,
      } as WorldStateStatusSummary);

      // Commits should always fail now, the trees are in an inconsistent state
      await expect(ws.handleL2BlockAndMessages(block2, messages2)).rejects.toThrow('World state trees are out of sync');
      await expect(ws.handleL2BlockAndMessages(block3, messages3)).rejects.toThrow('World state trees are out of sync');

      // Creating another world state instance should fail
      await ws.close();
    });

    it('manually clears the database', async () => {
      await using ws = await NativeWorldStateService.new(EthAddress.random(), dataDir, wsTreeMapSizes);
      const initialStatus = await ws.getStatusSummary();
      expect(initialStatus.unfinalizedBlockNumber).toBe(0);

      // Populate the db
      const fork = await ws.fork();
      ({ block, messages } = await mockBlock(BlockNumber(1), 2, fork));
      await fork.close();
      const status = await ws.handleL2BlockAndMessages(block, messages);
      expect(status.summary.unfinalizedBlockNumber).toBe(1);

      // Clear it
      await ws.clear();
      const emptyStatus = await ws.getStatusSummary();
      expect(emptyStatus.unfinalizedBlockNumber).toBe(0);
    });
  });

  describe('Forks', () => {
    let ws: NativeWorldStateService;

    beforeEach(async () => {
      ws = await NativeWorldStateService.new(EthAddress.random(), dataDir, wsTreeMapSizes);
    }, 30_000);

    afterEach(async () => {
      await ws.close();
    });

    it('creates a fork', async () => {
      const initialHeader = ws.getInitialHeader();
      const fork = await ws.fork();
      await assertSameState(fork, ws.getCommitted());

      expect(fork.getInitialHeader()).toEqual(initialHeader);

      const stateReference = await fork.getStateReference();
      const archiveInfo = await fork.getTreeInfo(MerkleTreeId.ARCHIVE);
      const header = new BlockHeader(
        new AppendOnlyTreeSnapshot(new Fr(archiveInfo.root), Number(archiveInfo.size)),
        stateReference,
        Fr.random(), // spongeBlobHash
        Fr.random(), // txEffectsTreeRoot
        makeGlobalVariables(),
        Fr.ZERO,
        Fr.ZERO,
      );

      await fork.updateArchive(header);

      expect(await fork.getTreeInfo(MerkleTreeId.ARCHIVE)).not.toEqual(archiveInfo);
      expect(await ws.getCommitted().getTreeInfo(MerkleTreeId.ARCHIVE)).toEqual(archiveInfo);

      // initial header should still work as before
      expect(fork.getInitialHeader()).toEqual(initialHeader);

      await fork.close();
    });

    it('creates a fork at a block number', async () => {
      const initialFork = await ws.fork();
      for (let i = 0; i < 5; i++) {
        const { block, messages } = await mockBlock(BlockNumber(i + 1), 2, initialFork);
        await ws.handleL2BlockAndMessages(block, messages);
      }

      const fork = await ws.fork(BlockNumber(3));
      const stateReference = await fork.getStateReference();
      const archiveInfo = await fork.getTreeInfo(MerkleTreeId.ARCHIVE);
      const header = new BlockHeader(
        new AppendOnlyTreeSnapshot(new Fr(archiveInfo.root), Number(archiveInfo.size)),
        stateReference,
        Fr.random(), // spongeBlobHash
        Fr.random(), // txEffectsTreeRoot
        makeGlobalVariables(),
        Fr.ZERO,
        Fr.ZERO,
      );

      await fork.updateArchive(header);

      expect(await fork.getTreeInfo(MerkleTreeId.ARCHIVE)).not.toEqual(archiveInfo);

      await fork.close();
    });

    it('can create a fork at block 0 when not latest', async () => {
      const fork = await ws.fork();
      const forkAtGenesis = await ws.fork();

      for (let i = 0; i < 5; i++) {
        const blockNumber = i + 1;
        const { block, messages } = await mockBlock(BlockNumber(blockNumber), 1, fork);
        const status = await ws.handleL2BlockAndMessages(block, messages);

        expect(status.summary.unfinalizedBlockNumber).toBe(blockNumber);
      }

      const forkAtZero = await ws.fork(BlockNumber.ZERO);
      await compareChains(forkAtGenesis, forkAtZero);
    });
  });

  describe('Pending and Proven chain', () => {
    let ws: NativeWorldStateService;
    let rollupAddress!: EthAddress;

    beforeEach(async () => {
      rollupAddress = EthAddress.random();
      ws = await NativeWorldStateService.new(rollupAddress, dataDir, wsTreeMapSizes);
    });

    afterEach(async () => {
      await ws.close();
    });

    it('tracks pending and proven chains', async () => {
      const fork = await ws.fork();

      for (let i = 0; i < 16; i++) {
        const blockNumber = i + 1;
        const provenBlock = blockNumber - 4;
        const { block, messages } = await mockBlock(BlockNumber(blockNumber), 1, fork);
        const status = await ws.handleL2BlockAndMessages(block, messages);

        expect(status.summary.unfinalizedBlockNumber).toBe(blockNumber);
        expect(status.summary.oldestHistoricalBlock).toBe(1);

        if (provenBlock > 0) {
          const provenStatus = await ws.setFinalized(BlockNumber(provenBlock));
          expect(provenStatus.unfinalizedBlockNumber).toBe(blockNumber);
          expect(provenStatus.finalizedBlockNumber).toBe(provenBlock);
          expect(provenStatus.oldestHistoricalBlock).toBe(1);
        } else {
          expect(status.summary.finalizedBlockNumber).toBe(0);
        }
      }
    });

    it('can finalize multiple blocks', async () => {
      const fork = await ws.fork();

      for (let i = 0; i < 16; i++) {
        const blockNumber = i + 1;
        const { block, messages } = await mockBlock(BlockNumber(blockNumber), 1, fork);
        const status = await ws.handleL2BlockAndMessages(block, messages);

        expect(status.summary.unfinalizedBlockNumber).toBe(blockNumber);
        expect(status.summary.oldestHistoricalBlock).toBe(1);
        expect(status.summary.finalizedBlockNumber).toBe(0);
      }

      const status = await ws.setFinalized(BlockNumber.fromBigInt(8n));
      expect(status.unfinalizedBlockNumber).toBe(16);
      expect(status.oldestHistoricalBlock).toBe(1);
      expect(status.finalizedBlockNumber).toBe(8);
    });

    it('can prune historic blocks', async () => {
      const fork = await ws.fork();
      const forks = [];
      const provenBlockLag = 4;
      const prunedBlockLag = 8;

      for (let i = 0; i < 16; i++) {
        const blockNumber = i + 1;
        const provenBlock = blockNumber - provenBlockLag;
        const prunedBlockNumber = blockNumber - prunedBlockLag;
        const { block, messages } = await mockBlock(BlockNumber(blockNumber), 1, fork);
        const status = await ws.handleL2BlockAndMessages(block, messages);

        expect(status.summary.unfinalizedBlockNumber).toBe(blockNumber);

        const blockFork = await ws.fork();
        forks.push(blockFork);

        if (provenBlock > 0) {
          const provenStatus = await ws.setFinalized(BlockNumber(provenBlock));
          expect(provenStatus.finalizedBlockNumber).toBe(provenBlock);
        } else {
          expect(status.summary.finalizedBlockNumber).toBe(0);
        }

        if (prunedBlockNumber > 0) {
          const prunedStatus = await ws.removeHistoricalBlocks(BlockNumber(prunedBlockNumber + 1));
          expect(prunedStatus.summary.oldestHistoricalBlock).toBe(prunedBlockNumber + 1);
        } else {
          expect(status.summary.oldestHistoricalBlock).toBe(1);
        }
      }

      const highestPrunedBlockNumber = 16 - prunedBlockLag;
      for (let i = 0; i < 16; i++) {
        const blockNumber = i + 1;
        if (blockNumber > highestPrunedBlockNumber) {
          await expect(forks[i].getSiblingPath(MerkleTreeId.NULLIFIER_TREE, 0n)).resolves.toBeDefined();
        } else {
          await expect(forks[i].getSiblingPath(MerkleTreeId.NULLIFIER_TREE, 0n)).rejects.toThrow('Fork not found');
        }
      }

      //can't prune what has already been pruned
      for (let i = 0; i <= highestPrunedBlockNumber; i++) {
        await expect(ws.removeHistoricalBlocks(BlockNumber(i + 1))).rejects.toThrow(
          `Unable to remove historical blocks to block number ${BigInt(
            i + 1,
          )}, blocks not found. Current oldest block: ${highestPrunedBlockNumber + 1}`,
        );
      }
    });

    const unsyncTrees = async (
      ws: NativeWorldStateService,
      treeDirectories: string[],
      unsyncFunction: (ws: NativeWorldStateService) => Promise<void>,
    ) => {
      const copyFiles = async (source: string, dest: string) => {
        const contents = await readdir(source);
        const isFile = async (fileName: string) => {
          return (await lstat(fileName)).isFile();
        };
        for (const file of contents) {
          const fullSourceFile = join(source, file);
          const isAFile = await isFile(fullSourceFile);
          if (!isAFile) {
            continue;
          }
          await copyFile(fullSourceFile, join(dest, file));
        }
      };

      const tempDirectory = await mkdtemp(join(tmpdir(), randomBytes(8).toString('hex')));

      // Close the world state before we run the un-sync operation
      await ws.close();

      for (let i = 0; i < treeDirectories.length; i++) {
        const dir = treeDirectories[i];
        const sourceDirectory = join(dataDir, 'world_state', dir);
        const destDirectory = join(tempDirectory, dir);
        await mkdir(destDirectory, { recursive: true });
        await copyFiles(sourceDirectory, destDirectory);
      }

      // Open up the world state again
      const newWorldState = await NativeWorldStateService.new(rollupAddress, dataDir, wsTreeMapSizes);
      await unsyncFunction(newWorldState);

      // Now, close down the world state and reinstate the nullifier and public data trees
      await newWorldState.close();

      for (let i = 0; i < treeDirectories.length; i++) {
        const dir = treeDirectories[i];
        const sourceDirectory = join(dataDir, 'world_state', dir);
        const destDirectory = join(tempDirectory, dir);
        await copyFiles(destDirectory, sourceDirectory);
      }
      await rm(tempDirectory, { recursive: true, force: true });
      return await NativeWorldStateService.new(rollupAddress, dataDir, wsTreeMapSizes);
    };

    it('handles historic block numbers being out of sync', async () => {
      const fork = await ws.fork();
      const forks = [];
      const provenBlockLag = 4;

      for (let i = 0; i < 16; i++) {
        const blockNumber = i + 1;
        const provenBlock = blockNumber - provenBlockLag;
        const { block, messages } = await mockBlock(BlockNumber(blockNumber), 1, fork);
        const status = await ws.handleL2BlockAndMessages(block, messages);

        expect(status.summary.unfinalizedBlockNumber).toBe(blockNumber);

        const blockFork = await ws.fork();
        forks.push(blockFork);

        if (provenBlock > 0) {
          const provenStatus = await ws.setFinalized(BlockNumber(provenBlock));
          expect(provenStatus.finalizedBlockNumber).toBe(provenBlock);
        } else {
          expect(status.summary.finalizedBlockNumber).toBe(0);
        }
      }

      ws = await unsyncTrees(ws, ['PublicDataTree', 'NullifierTree'], async (worldState: NativeWorldStateService) => {
        await worldState.removeHistoricalBlocks(BlockNumber.fromBigInt(5n));
      });

      // Open up the world state again and try removing the first 10 historical blocks
      // We should handle the fact that some trees are at historical block 5 and some are at 1
      const fullStatus = await ws.removeHistoricalBlocks(BlockNumber.fromBigInt(10n));
      expect(fullStatus.meta.archiveTreeMeta.oldestHistoricBlock).toEqual(10);
      expect(fullStatus.meta.messageTreeMeta.oldestHistoricBlock).toEqual(10);
      expect(fullStatus.meta.noteHashTreeMeta.oldestHistoricBlock).toEqual(10);
      expect(fullStatus.meta.nullifierTreeMeta.oldestHistoricBlock).toEqual(10);
      expect(fullStatus.meta.publicDataTreeMeta.oldestHistoricBlock).toEqual(10);
    });

    it('handles finalized block numbers being out of sync', async () => {
      const fork = await ws.fork();
      const provenBlockLag = 12;

      for (let i = 0; i < 16; i++) {
        const blockNumber = i + 1;
        const provenBlock = blockNumber - provenBlockLag;
        const { block, messages } = await mockBlock(BlockNumber(blockNumber), 1, fork);
        const status = await ws.handleL2BlockAndMessages(block, messages);

        expect(status.summary.unfinalizedBlockNumber).toBe(blockNumber);

        if (provenBlock > 0) {
          const provenStatus = await ws.setFinalized(BlockNumber(provenBlock));
          expect(provenStatus.finalizedBlockNumber).toBe(provenBlock);
        } else {
          expect(status.summary.finalizedBlockNumber).toBe(0);
        }
      }

      // The finalized block number is 4.
      // We are going to move it forward for some of the trees but not others

      ws = await unsyncTrees(ws, ['PublicDataTree', 'NullifierTree'], async (worldState: NativeWorldStateService) => {
        await worldState.setFinalized(BlockNumber(8));
      });

      // Open up the world state again and try moving the finalized block to 12
      // We should handle the fact that some trees are at historical block 5 and some are at 1
      const summary = await ws.setFinalized(BlockNumber.fromBigInt(12n));
      expect(summary.finalizedBlockNumber).toEqual(12);
      expect(summary.treesAreSynched).toBeTruthy();
    });

    it('handles pending block numbers being out of sync', async () => {
      {
        const fork = await ws.fork();

        for (let i = 0; i < 8; i++) {
          const blockNumber = i + 1;
          const { block, messages } = await mockBlock(BlockNumber(blockNumber), 1, fork);
          await ws.handleL2BlockAndMessages(block, messages);
        }
      }

      // The pending block number is 8, we wil now add some blocks to only some of the trees
      ws = await unsyncTrees(ws, ['PublicDataTree', 'NullifierTree'], async (worldState: NativeWorldStateService) => {
        const fork = await worldState.fork();
        for (let i = 8; i < 16; i++) {
          const blockNumber = i + 1;
          const { block, messages } = await mockBlock(BlockNumber(blockNumber), 1, fork);
          await worldState.handleL2BlockAndMessages(block, messages);
        }
      });

      {
        const fork = await ws.fork();

        // Open up the world state again and try adding another block
        // We should re-sync the trees so they are at the same (earliest) block
        const summary = await ws.getStatusSummary();
        expect(summary.unfinalizedBlockNumber).toEqual(8);

        const blockNumber = 9;
        const { block, messages } = await mockBlock(BlockNumber(blockNumber), 1, fork);
        const statusFull = await ws.handleL2BlockAndMessages(block, messages);
        expect(statusFull.meta.archiveTreeMeta.unfinalizedBlockHeight).toEqual(9);
        expect(statusFull.meta.messageTreeMeta.unfinalizedBlockHeight).toEqual(9);
        expect(statusFull.meta.noteHashTreeMeta.unfinalizedBlockHeight).toEqual(9);
        expect(statusFull.meta.nullifierTreeMeta.unfinalizedBlockHeight).toEqual(9);
        expect(statusFull.meta.publicDataTreeMeta.unfinalizedBlockHeight).toEqual(9);
        expect(statusFull.summary.treesAreSynched).toBeTruthy();
      }
    });

    it('handles all block numbers being out of sync', async () => {
      {
        const fork = await ws.fork();
        const provenBlockLag = 12;

        for (let i = 0; i < 16; i++) {
          const blockNumber = i + 1;
          const { block, messages } = await mockBlock(BlockNumber(blockNumber), 1, fork);
          const status = await ws.handleL2BlockAndMessages(block, messages);

          const provenBlock = blockNumber - provenBlockLag;

          if (provenBlock > 0) {
            const provenStatus = await ws.setFinalized(BlockNumber(provenBlock));
            expect(provenStatus.finalizedBlockNumber).toBe(provenBlock);
          } else {
            expect(status.summary.finalizedBlockNumber).toBe(0);
          }
        }
      }

      // The pending block number is 16, we wil now add some blocks to only some of the trees
      // In addition, the proven block will move to 8
      // We also set the historical block number to 4
      ws = await unsyncTrees(ws, ['PublicDataTree', 'NullifierTree'], async (worldState: NativeWorldStateService) => {
        const fork = await worldState.fork();
        const provenBlockLag = 12;
        for (let i = 16; i < 20; i++) {
          const blockNumber = i + 1;
          const { block, messages } = await mockBlock(BlockNumber(blockNumber), 1, fork);
          await worldState.handleL2BlockAndMessages(block, messages);
          const provenBlock = blockNumber - provenBlockLag;
          await worldState.setFinalized(BlockNumber(provenBlock));
        }
        await worldState.removeHistoricalBlocks(BlockNumber(4));
      });

      {
        const fork = await ws.fork();

        // Open up the world state again and try adding another block
        // We should re-sync the trees so they are at the same (earliest) block
        const expectedPendingBlockNumber = 16;
        const summary = await ws.getStatusSummary();
        expect(summary.unfinalizedBlockNumber).toEqual(expectedPendingBlockNumber);

        const { block, messages } = await mockBlock(BlockNumber(expectedPendingBlockNumber + 1), 1, fork);
        const statusFull = await ws.handleL2BlockAndMessages(block, messages);
        expect(statusFull.summary.treesAreSynched).toBeTruthy();
        expect(statusFull.meta.archiveTreeMeta.unfinalizedBlockHeight).toEqual(expectedPendingBlockNumber + 1);
        expect(statusFull.meta.messageTreeMeta.unfinalizedBlockHeight).toEqual(expectedPendingBlockNumber + 1);
        expect(statusFull.meta.noteHashTreeMeta.unfinalizedBlockHeight).toEqual(expectedPendingBlockNumber + 1);
        expect(statusFull.meta.nullifierTreeMeta.unfinalizedBlockHeight).toEqual(expectedPendingBlockNumber + 1);
        expect(statusFull.meta.publicDataTreeMeta.unfinalizedBlockHeight).toEqual(expectedPendingBlockNumber + 1);

        const expectedFinalizedBlockNumber = 8;
        const expectedHistoricalBlockNumber = 4;

        expect(statusFull.meta.archiveTreeMeta.finalizedBlockHeight).toEqual(expectedFinalizedBlockNumber);
        expect(statusFull.meta.messageTreeMeta.finalizedBlockHeight).toEqual(expectedFinalizedBlockNumber);
        expect(statusFull.meta.noteHashTreeMeta.finalizedBlockHeight).toEqual(expectedFinalizedBlockNumber);
        expect(statusFull.meta.nullifierTreeMeta.finalizedBlockHeight).toEqual(expectedFinalizedBlockNumber);
        expect(statusFull.meta.publicDataTreeMeta.finalizedBlockHeight).toEqual(expectedFinalizedBlockNumber);

        expect(statusFull.meta.archiveTreeMeta.oldestHistoricBlock).toEqual(expectedHistoricalBlockNumber);
        expect(statusFull.meta.messageTreeMeta.oldestHistoricBlock).toEqual(expectedHistoricalBlockNumber);
        expect(statusFull.meta.noteHashTreeMeta.oldestHistoricBlock).toEqual(expectedHistoricalBlockNumber);
        expect(statusFull.meta.nullifierTreeMeta.oldestHistoricBlock).toEqual(expectedHistoricalBlockNumber);
        expect(statusFull.meta.publicDataTreeMeta.oldestHistoricBlock).toEqual(expectedHistoricalBlockNumber);

        const finalizedStatus = await ws.setFinalized(BlockNumber.fromBigInt(BigInt(expectedFinalizedBlockNumber + 1)));
        expect(finalizedStatus.finalizedBlockNumber).toEqual(expectedFinalizedBlockNumber + 1);
        expect(finalizedStatus.treesAreSynched).toBeTruthy();

        const fullStatus = await ws.removeHistoricalBlocks(
          BlockNumber.fromBigInt(BigInt(expectedHistoricalBlockNumber + 1)),
        );
        expect(fullStatus.meta.archiveTreeMeta.oldestHistoricBlock).toEqual(expectedHistoricalBlockNumber + 1);
        expect(fullStatus.meta.messageTreeMeta.oldestHistoricBlock).toEqual(expectedHistoricalBlockNumber + 1);
        expect(fullStatus.meta.noteHashTreeMeta.oldestHistoricBlock).toEqual(expectedHistoricalBlockNumber + 1);
        expect(fullStatus.meta.nullifierTreeMeta.oldestHistoricBlock).toEqual(expectedHistoricalBlockNumber + 1);
        expect(fullStatus.meta.publicDataTreeMeta.oldestHistoricBlock).toEqual(expectedHistoricalBlockNumber + 1);
        expect(fullStatus.summary.treesAreSynched).toBeTruthy();
      }
    });

    it.each([
      [
        '1-tx blocks',
        (blockNumber: number, fork: MerkleTreeWriteOperations) => mockBlock(BlockNumber(blockNumber), 1, fork),
      ],
      [
        'empty blocks',
        (blockNumber: number, fork: MerkleTreeWriteOperations) => mockEmptyBlock(BlockNumber(blockNumber), fork),
      ],
    ])('can re-org %s', async (_, genBlock) => {
      await using nonReorgState = await NativeWorldStateService.tmp();
      await using sequentialReorgState = await NativeWorldStateService.tmp();
      let fork = await ws.fork();

      const blockForks = [];
      const blockTreeInfos = [];
      const blockStats = [];
      const siblingPaths = [];

      // advance 3 chains by 8 blocks, 2 of the chains go to 16 blocks
      for (let i = 0; i < 16; i++) {
        const blockNumber = i + 1;
        const { block, messages } = await genBlock(blockNumber, fork);
        const status = await ws.handleL2BlockAndMessages(block, messages);
        blockStats.push(status);
        const blockFork = await ws.fork();
        blockForks.push(blockFork);
        const treeInfo = await ws.getCommitted().getTreeInfo(MerkleTreeId.NULLIFIER_TREE);
        blockTreeInfos.push(treeInfo);
        const siblingPath = await ws.getCommitted().getSiblingPath(MerkleTreeId.NULLIFIER_TREE, 0n);
        siblingPaths.push(siblingPath);

        if (blockNumber < 9) {
          const statusNonReorg = await nonReorgState.handleL2BlockAndMessages(block, messages);
          expect(status.summary).toEqual(statusNonReorg.summary);

          const treeInfoNonReorg = await nonReorgState.getCommitted().getTreeInfo(MerkleTreeId.NULLIFIER_TREE);
          expect(treeInfo).toEqual(treeInfoNonReorg);
        }

        await sequentialReorgState.handleL2BlockAndMessages(block, messages);
      }

      // unwind 1 chain by a single block at a time
      for (let blockNumber = 16; blockNumber > 8; blockNumber--) {
        const unwindStatus = await sequentialReorgState.unwindBlocks(BlockNumber(blockNumber - 1));
        const unwindFork = await sequentialReorgState.fork();
        const unwindTreeInfo = await sequentialReorgState.getCommitted().getTreeInfo(MerkleTreeId.NULLIFIER_TREE);
        const unwindSiblingPath = await sequentialReorgState
          .getCommitted()
          .getSiblingPath(MerkleTreeId.NULLIFIER_TREE, 0n);

        expect(unwindTreeInfo).toEqual(blockTreeInfos[blockNumber - 2]);
        expect(unwindStatus.summary).toEqual(blockStats[blockNumber - 2].summary);
        expect(await unwindFork.getTreeInfo(MerkleTreeId.NULLIFIER_TREE)).toEqual(
          await blockForks[blockNumber - 2].getTreeInfo(MerkleTreeId.NULLIFIER_TREE),
        );
        expect(unwindSiblingPath).toEqual(siblingPaths[blockNumber - 2]);
      }

      // unwind the other 16 block chain by a full 8 blocks in one go
      await ws.unwindBlocks(BlockNumber.fromBigInt(8n));

      // check that it is not possible to re-org blocks that were already reorged.
      await expect(ws.unwindBlocks(BlockNumber.fromBigInt(10n))).rejects.toThrow(
        'Unable to unwind blocks to block number 10, current pending block 8',
      );

      await compareChains(ws.getCommitted(), sequentialReorgState.getCommitted());

      const unwoundFork = await ws.fork();
      const unwoundTreeInfo = await ws.getCommitted().getTreeInfo(MerkleTreeId.NULLIFIER_TREE);
      const unwoundStatus = await ws.getStatusSummary();
      const unwoundSiblingPath = await ws.getCommitted().getSiblingPath(MerkleTreeId.NULLIFIER_TREE, 0n);

      expect(unwoundStatus).toEqual(blockStats[7].summary);
      expect(unwoundTreeInfo).toEqual(blockTreeInfos[7]);
      expect(await ws.getCommitted().getTreeInfo(MerkleTreeId.NULLIFIER_TREE)).toEqual(blockTreeInfos[7]);
      expect(await unwoundFork.getTreeInfo(MerkleTreeId.NULLIFIER_TREE)).toEqual(blockTreeInfos[7]);
      expect(unwoundSiblingPath).toEqual(siblingPaths[7]);

      fork = await ws.fork();

      // now advance both the un-reorged chain and one of the reorged chains to 16 blocks
      for (let i = 8; i < 16; i++) {
        const blockNumber = i + 1;
        const { block, messages } = await mockBlock(BlockNumber(blockNumber), 1, fork);
        const status = await ws.handleL2BlockAndMessages(block, messages);
        blockStats[i] = status;
        const blockFork = await ws.fork();
        blockForks[i] = blockFork;
        const treeInfo = await ws.getCommitted().getTreeInfo(MerkleTreeId.NULLIFIER_TREE);
        blockTreeInfos[i] = treeInfo;
        const siblingPath = await ws.getCommitted().getSiblingPath(MerkleTreeId.NULLIFIER_TREE, 0n);
        siblingPaths[i] = siblingPath;

        const statusNonReorg = await nonReorgState.handleL2BlockAndMessages(block, messages);
        expect(status.summary).toEqual(statusNonReorg.summary);
      }

      // compare snapshot across the chains
      for (let i = 0; i < 16; i++) {
        const blockNumber = i + 1;
        const nonReorgSnapshot = nonReorgState.getSnapshot(BlockNumber(blockNumber));
        const reorgSnapshot = ws.getSnapshot(BlockNumber(blockNumber));
        await compareChains(reorgSnapshot, nonReorgSnapshot);
      }

      await compareChains(ws.getCommitted(), nonReorgState.getCommitted());
    });

    it('forks are deleted during a re-org', async () => {
      const fork = await ws.fork();

      const blockForks = [];
      const blockTreeInfos = [];
      const blockStats = [];
      const siblingPaths = [];

      for (let i = 0; i < 16; i++) {
        const blockNumber = i + 1;
        const { block, messages } = await mockBlock(BlockNumber(blockNumber), 1, fork);
        const status = await ws.handleL2BlockAndMessages(block, messages);
        blockStats.push(status);
        const blockFork = await ws.fork();
        blockForks.push(blockFork);
        const treeInfo = await ws.getCommitted().getTreeInfo(MerkleTreeId.NULLIFIER_TREE);
        blockTreeInfos.push(treeInfo);
        const siblingPath = await ws.getCommitted().getSiblingPath(MerkleTreeId.NULLIFIER_TREE, 0n);
        siblingPaths.push(siblingPath);
      }

      await ws.unwindBlocks(BlockNumber.fromBigInt(8n));

      for (let i = 0; i < 16; i++) {
        if (i < 8) {
          expect(await blockForks[i].getSiblingPath(MerkleTreeId.NULLIFIER_TREE, 0n)).toEqual(siblingPaths[i]);
        } else {
          await expect(blockForks[i].getSiblingPath(MerkleTreeId.NULLIFIER_TREE, 0n)).rejects.toThrow('Fork not found');
        }
      }
    });

    // Regression test for A-1055: a delayed-close fork that the C++ side has already destroyed (via
    // remove_forks_for_block on an unwind or historical prune) must dispose silently rather than logging a
    // warning.
    it('does not fail when a delayed-close fork is destroyed by a reorg before its close fires', async () => {
      const baseFork = await ws.fork();
      for (let i = 0; i < 3; i++) {
        const { block, messages } = await mockBlock(BlockNumber(i + 1), 1, baseFork);
        await ws.handleL2BlockAndMessages(block, messages);
      }
      await baseFork.close();

      const closeDelayMs = 1000;
      const delayedFork = await ws.fork(undefined, { closeDelayMs });
      const warnSpy = jest.spyOn((delayedFork as any).log, 'warn');

      await (delayedFork as any)[Symbol.asyncDispose]();

      await ws.unwindBlocks(BlockNumber.fromBigInt(2n));
      await expect(delayedFork.getSiblingPath(MerkleTreeId.NULLIFIER_TREE, 0n)).rejects.toThrow('Fork not found');

      // The fork was disposed with a closeDelayMs, so its close fires asynchronously after the delay. Wait for
      // that delayed close to be scheduled and to settle so the "Fork not found" swallow path has actually run
      // before asserting it did not warn.
      await retryUntil(() => (delayedFork as any).closePromise !== undefined, 'delayed fork close scheduled', 30, 0.1);
      await (delayedFork as any).closePromise.catch(() => {});

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('Invalid Blocks', () => {
    let ws: NativeWorldStateService;
    let rollupAddress!: EthAddress;

    beforeEach(async () => {
      rollupAddress = EthAddress.random();
      ws = await NativeWorldStateService.new(rollupAddress, dataDir, wsTreeMapSizes);
    });

    afterEach(async () => {
      await ws.close();
    });

    it('handles invalid blocks', async () => {
      const fork = await ws.fork();

      // Insert a few blocks
      for (let i = 0; i < 4; i++) {
        const blockNumber = i + 1;
        const provenBlock = blockNumber - 2;
        const { block, messages } = await mockBlock(BlockNumber(blockNumber), 1, fork);
        const status = await ws.handleL2BlockAndMessages(block, messages);

        expect(status.summary.unfinalizedBlockNumber).toBe(blockNumber);
        expect(status.summary.oldestHistoricalBlock).toBe(1);

        if (provenBlock > 0) {
          const provenStatus = await ws.setFinalized(BlockNumber(provenBlock));
          expect(provenStatus.unfinalizedBlockNumber).toBe(blockNumber);
          expect(provenStatus.finalizedBlockNumber).toBe(provenBlock);
          expect(provenStatus.oldestHistoricalBlock).toBe(1);
        } else {
          expect(status.summary.finalizedBlockNumber).toBe(0);
        }
      }

      // Now build an invalid block, see that it is rejected and that we can then insert the correct block
      {
        const { block: block, messages } = await mockBlock(BlockNumber(5), 1, fork);
        const invalidBlock = L2Block.fromBuffer(block.toBuffer());
        invalidBlock.header.state.partial.nullifierTree.root = Fr.random();

        await expect(ws.handleL2BlockAndMessages(invalidBlock, messages)).rejects.toThrow(
          "Can't synch block: block state does not match world state",
        );

        // Accepts the correct block
        await expect(ws.handleL2BlockAndMessages(block, messages)).resolves.toBeDefined();

        const summary = await ws.getStatusSummary();
        expect(summary.unfinalizedBlockNumber).toBe(5);
        expect(summary.finalizedBlockNumber).toBe(2);
        expect(summary.oldestHistoricalBlock).toBe(1);
      }

      // Now we push another invalid block, see that it is rejected and check we can unwind to the last proven block
      {
        const { block: block, messages } = await mockBlock(BlockNumber(6), 1, fork);
        const invalidBlock = L2Block.fromBuffer(block.toBuffer());
        invalidBlock.header.state.partial.nullifierTree.root = Fr.random();

        await expect(ws.handleL2BlockAndMessages(invalidBlock, messages)).rejects.toThrow(
          "Can't synch block: block state does not match world state",
        );

        // Now we want to unwind to the last proven block
        const unwindStatus = await ws.unwindBlocks(BlockNumber.fromBigInt(2n));
        expect(unwindStatus.summary.unfinalizedBlockNumber).toBe(2);
        expect(unwindStatus.summary.finalizedBlockNumber).toBe(2);
        expect(unwindStatus.summary.oldestHistoricalBlock).toBe(1);
      }
    });
  });

  describe('Archive root divergence on empty blocks', () => {
    let ws: NativeWorldStateService;

    beforeEach(async () => {
      ws = await NativeWorldStateService.new(EthAddress.random(), dataDir, wsTreeMapSizes);
    });

    afterEach(async () => {
      await ws.close();
    });

    const emptyMessages = () => Array(16).fill(0).map(Fr.zero);

    // A *different* empty block at height 1: the same (empty) contents as the canonical block, but a different slot,
    // so a different block-header hash — the proposer-race orphan from A-1235, not a tampered block.
    const buildDifferentBlockOne = async (slotNumber: number) => {
      const fork = await ws.fork();
      const block = L2Block.empty();
      block.header.globalVariables.blockNumber = BlockNumber(1);
      block.header.globalVariables.slotNumber = SlotNumber(slotNumber);
      const messages = emptyMessages();
      await updateBlockState(block, messages, fork);
      await fork.close();
      return { block, messages };
    };

    // The canonical chain L1 finalized: block 1, then block 2 chained onto it (block 2's lastArchive == block 1's
    // archive root). Built on a throwaway fork so it never touches the world state under test.
    const buildCanonicalChain = async () => {
      const fork = await ws.fork();
      const { block: canonicalOne } = await mockEmptyBlock(BlockNumber(1), fork);
      const { block: canonicalTwo, messages: canonicalTwoMessages } = await mockEmptyBlock(BlockNumber(2), fork);
      await fork.close();
      return { canonicalOne, canonicalTwo, canonicalTwoMessages };
    };

    // The core blind spot: two empty blocks at the same height with different headers are indistinguishable to the
    // four-tree state reference, yet they are different blocks with different archive roots.
    it('two empty blocks at the same height with different headers share a state reference but not an archive root', async () => {
      const { canonicalOne } = await buildCanonicalChain();
      const { block: orphanOne } = await buildDifferentBlockOne(99);

      // The four non-archive trees are identical (empty blocks insert no leaves), so is_same_state_reference cannot
      // tell the two blocks apart...
      expect(orphanOne.header.state).toEqual(canonicalOne.header.state);
      // ...yet they are genuinely different blocks, with different header hashes and different archive roots.
      expect((await orphanOne.hash()).equals(await canonicalOne.hash())).toBe(false);
      expect(orphanOne.archive.root.equals(canonicalOne.archive.root)).toBe(false);
    });

    // The seeding step: a self-consistent orphan block passes every check, so world state takes the wrong block and
    // ends up on the orphan fork — it has no way, from this block alone, to know it is not the canonical block 1.
    it('silently accepts a different empty block at the same height (how the wrong block gets in)', async () => {
      const { canonicalOne } = await buildCanonicalChain();
      const { block: orphanOne, messages: orphanMessages } = await buildDifferentBlockOne(99);

      await expect(ws.handleL2BlockAndMessages(orphanOne, orphanMessages)).resolves.toBeDefined();

      // World state is now on the orphan fork: its committed archive root is the orphan's, not canonical block 1's.
      const archive = await ws.getCommitted().getTreeInfo(MerkleTreeId.ARCHIVE);
      expect(Fr.fromBuffer(archive.root).equals(orphanOne.archive.root)).toBe(true);
      expect(Fr.fromBuffer(archive.root).equals(canonicalOne.archive.root)).toBe(false);
    });

    // The fix: once world state has taken the orphan, the canonical successor (which chains off the real block 1)
    // no longer matches world state's committed archive root, and the pre-append guard rejects it before committing.
    it('rejects the canonical successor of a wrongly-synced orphan, catching the archive divergence (the fix)', async () => {
      const { canonicalTwo, canonicalTwoMessages } = await buildCanonicalChain();
      const { block: orphanOne, messages: orphanMessages } = await buildDifferentBlockOne(99);

      // The orphan commits cleanly (it is a self-consistent block 1).
      await expect(ws.handleL2BlockAndMessages(orphanOne, orphanMessages)).resolves.toBeDefined();
      const archiveBefore = await ws.getCommitted().getTreeInfo(MerkleTreeId.ARCHIVE);

      // canonicalTwo.lastArchive == canonicalOne's archive root, which no longer matches world state's committed
      // (orphan) archive root, so the pre-append guard throws before committing.
      await expect(ws.handleL2BlockAndMessages(canonicalTwo, canonicalTwoMessages)).rejects.toThrow(
        /diverged from the canonical chain/,
      );

      // Clean rollback: the archive tree is untouched.
      const archiveAfter = await ws.getCommitted().getTreeInfo(MerkleTreeId.ARCHIVE);
      expect(archiveAfter.root).toEqual(archiveBefore.root);
      expect(archiveAfter.size).toEqual(archiveBefore.size);
    });
  });

  describe('Finding leaves', () => {
    let block: L2Block;
    let messages: Fr[];

    it('retrieves leaf indices', async () => {
      await using ws = await NativeWorldStateService.new(rollupAddress, dataDir, wsTreeMapSizes);
      const numBlocks = 2;
      const txsPerBlock = 2;
      const noteHashes: Fr[] = [];
      const nullifiers: Buffer[] = [];
      const publicWrites: Buffer[] = [];
      const initialNullifierTreeInfo = await ws.getCommitted().getTreeInfo(MerkleTreeId.NULLIFIER_TREE);
      const initialNoteHashTreeInfo = await ws.getCommitted().getTreeInfo(MerkleTreeId.NOTE_HASH_TREE);
      const initialPublicTreeInfo = await ws.getCommitted().getTreeInfo(MerkleTreeId.PUBLIC_DATA_TREE);
      for (let i = 0; i < numBlocks; i++) {
        const fork = await ws.fork();
        ({ block, messages } = await mockBlock(BlockNumber(1), txsPerBlock, fork));
        noteHashes.push(...block.body.txEffects.flatMap(x => x.noteHashes.flatMap(x => x)));
        nullifiers.push(...block.body.txEffects.flatMap(x => x.nullifiers.flatMap(x => x.toBuffer())));
        publicWrites.push(...block.body.txEffects.flatMap(x => x.publicDataWrites.flatMap(x => x.toBuffer())));
        await fork.close();
        await ws.handleL2BlockAndMessages(block, messages);
      }

      const testQuery = async (
        initialTreeSize: bigint,
        leaves: MerkleTreeLeafType<MerkleTreeId>[],
        treeId: MerkleTreeId,
        makeRandom: () => MerkleTreeLeafType<MerkleTreeId>,
      ) => {
        const leavesToRequest: MerkleTreeLeafType<MerkleTreeId>[] = [
          leaves[0],
          makeRandom(),
          leaves[45],
          leaves[89],
          makeRandom(),
          leaves[102],
        ];
        const expectedIndices = [0n, undefined, 45n, 89n, undefined, 102n].map(x =>
          x === undefined ? undefined : x + initialTreeSize,
        );
        const indices = await ws.getCommitted().findLeafIndices(treeId, leavesToRequest);
        expect(indices).toEqual(expectedIndices);

        const expectedIndicesAfter = [undefined, undefined, undefined, 89n, undefined, 102n].map(x =>
          x === undefined ? undefined : x + initialTreeSize,
        );
        const indicesAfter = await ws
          .getCommitted()
          .findLeafIndicesAfter(treeId, leavesToRequest, 89n + initialTreeSize);
        expect(indicesAfter).toEqual(expectedIndicesAfter);
      };
      await testQuery(initialNoteHashTreeInfo.size, noteHashes, MerkleTreeId.NOTE_HASH_TREE, Fr.random);
      await testQuery(initialNullifierTreeInfo.size, nullifiers, MerkleTreeId.NULLIFIER_TREE, () =>
        Fr.random().toBuffer(),
      );
      await testQuery(initialPublicTreeInfo.size, publicWrites, MerkleTreeId.PUBLIC_DATA_TREE, () =>
        PublicDataWrite.random().toBuffer(),
      );
    });
  });

  describe('Finding sibling paths', () => {
    let block: L2Block;
    let messages: Fr[];

    it('retrieves leaf sibling paths', async () => {
      await using ws = await NativeWorldStateService.new(rollupAddress, dataDir, wsTreeMapSizes);
      const numBlocks = 2;
      const txsPerBlock = 2;
      const noteHashes: Fr[] = [];
      const nullifiers: Buffer[] = [];
      const publicWrites: Buffer[] = [];
      for (let i = 0; i < numBlocks; i++) {
        const fork = await ws.fork();
        ({ block, messages } = await mockBlock(BlockNumber(1), txsPerBlock, fork));
        noteHashes.push(...block.body.txEffects.flatMap(x => x.noteHashes.flatMap(x => x)));
        nullifiers.push(...block.body.txEffects.flatMap(x => x.nullifiers.flatMap(x => x.toBuffer())));
        publicWrites.push(...block.body.txEffects.flatMap(x => x.publicDataWrites.flatMap(x => x.toBuffer())));
        await fork.close();
        await ws.handleL2BlockAndMessages(block, messages);
      }

      const testQuery = async (
        leaves: MerkleTreeLeafType<MerkleTreeId>[],
        treeId: MerkleTreeId,
        makeRandom: () => MerkleTreeLeafType<MerkleTreeId>,
      ) => {
        const leavesToRequest: MerkleTreeLeafType<MerkleTreeId>[] = [
          leaves[0],
          makeRandom(),
          leaves[45],
          leaves[89],
          makeRandom(),
          leaves[102],
        ];
        const indices = await ws.getCommitted().findLeafIndices(treeId, leavesToRequest);
        const readOps = ws.getCommitted();
        const expectedPaths = [
          await readOps.getSiblingPath(treeId, indices[0]!),
          undefined,
          await readOps.getSiblingPath(treeId, indices[2]!),
          await readOps.getSiblingPath(treeId, indices[3]!),
          undefined,
          await readOps.getSiblingPath(treeId, indices[5]!),
        ];
        const expectedIndices = [indices[0], undefined, indices[2], indices[3], undefined, indices[5]];
        const paths = await readOps.findSiblingPaths(treeId, leavesToRequest);
        expect(paths.length).toBe(expectedPaths.length);
        for (let i = 0; i < paths.length; i++) {
          expect(paths[i]?.path).toEqual(expectedPaths[i]);
          expect(paths[i]?.index).toEqual(expectedIndices[i]);
        }
      };
      await testQuery(noteHashes, MerkleTreeId.NOTE_HASH_TREE, Fr.random);
      await testQuery(nullifiers, MerkleTreeId.NULLIFIER_TREE, () => Fr.random().toBuffer());
      await testQuery(publicWrites, MerkleTreeId.PUBLIC_DATA_TREE, () => PublicDataWrite.random().toBuffer());
    });
  });

  describe('Block numbers for indices', () => {
    let block: L2Block;
    let messages: Fr[];
    let noteHashes: number;
    let nullifiers: number;
    let publicTree: number;

    beforeAll(async () => {
      await rm(dataDir, { recursive: true, maxRetries: 3 });
    });

    it('correctly reports block numbers', async () => {
      await using ws = await NativeWorldStateService.new(rollupAddress, dataDir, wsTreeMapSizes);
      const statuses = [];
      const numBlocks = 2;
      const txsPerBlock = 2;
      for (let i = 0; i < numBlocks; i++) {
        const fork = await ws.fork();
        ({ block, messages } = await mockBlock(BlockNumber(1), txsPerBlock, fork));
        noteHashes = block.body.txEffects[0].noteHashes.length;
        nullifiers = block.body.txEffects[0].nullifiers.length;
        publicTree = block.body.txEffects[0].publicDataWrites.length;
        await fork.close();
        const status = await ws.handleL2BlockAndMessages(block, messages);
        statuses.push(status);
      }

      const checkTree = async (
        treeId: MerkleTreeId,
        itemsLength: number,
        blockNumber: number,
        initialSize: number,
        numPerBlock: number,
      ) => {
        const before = initialSize + itemsLength * blockNumber * numPerBlock - 2;
        const on = before + 1;
        const after = on + 1;
        const blockNumbers = await ws.getCommitted().getBlockNumbersForLeafIndices(
          treeId,
          [before, on, after].map(x => BigInt(x)),
        );
        expect(blockNumbers).toEqual([blockNumber, blockNumber, blockNumber + 1].map(x => BlockNumber(x)));
      };

      for (let i = 0; i < numBlocks - 1; i++) {
        await checkTree(MerkleTreeId.NOTE_HASH_TREE, noteHashes, i + 1, 0, 2);
        await checkTree(MerkleTreeId.NULLIFIER_TREE, nullifiers, i + 1, 128, 2);
        await checkTree(MerkleTreeId.PUBLIC_DATA_TREE, publicTree, i + 1, 128, 2);
        await checkTree(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, messages.length, i + 1, 0, 1);
      }

      const lastStatus = statuses[statuses.length - 1];
      const before = Number(lastStatus.meta.noteHashTreeMeta.committedSize) - 2;
      const blockNumbers = await ws.getCommitted().getBlockNumbersForLeafIndices(
        MerkleTreeId.NOTE_HASH_TREE,
        [before, before + 1, before + 2].map(x => BigInt(x)),
      );
      expect(blockNumbers).toEqual([2, 2, undefined].map(x => (x == undefined ? x : BlockNumber(x))));
    });
  });

  describe('Status reporting', () => {
    let block: L2Block;
    let messages: Fr[];

    beforeAll(async () => {
      await rm(dataDir, { recursive: true, maxRetries: 3 });
    });

    it('correctly reports status', async () => {
      const ws = await NativeWorldStateService.new(rollupAddress, dataDir, wsTreeMapSizes);
      const statuses = [];
      for (let i = 0; i < 2; i++) {
        const fork = await ws.fork();
        ({ block, messages } = await mockBlock(BlockNumber(1), 2, fork));
        await fork.close();
        const status = await ws.handleL2BlockAndMessages(block, messages);
        statuses.push(status);

        expect(status.summary).toEqual({
          unfinalizedBlockNumber: BlockNumber(i + 1),
          finalizedBlockNumber: BlockNumber.fromBigInt(0n),
          oldestHistoricalBlock: BlockNumber.fromBigInt(1n),
          treesAreSynched: true,
        } as WorldStateStatusSummary);

        expect(status.meta.archiveTreeMeta).toMatchObject({
          depth: ARCHIVE_HEIGHT,
          size: BigInt(i + 2),
          committedSize: BigInt(i + 2),
          initialSize: BigInt(1),
          oldestHistoricBlock: 1,
          unfinalizedBlockHeight: i + 1,
          finalizedBlockHeight: 0,
        });

        expect(status.meta.noteHashTreeMeta).toMatchObject({
          depth: NOTE_HASH_TREE_HEIGHT,
          size: BigInt(2 * MAX_NOTE_HASHES_PER_TX * (i + 1)),
          committedSize: BigInt(2 * MAX_NOTE_HASHES_PER_TX * (i + 1)),
          initialSize: BigInt(0),
          oldestHistoricBlock: 1,
          unfinalizedBlockHeight: i + 1,
          finalizedBlockHeight: 0,
        });

        expect(status.meta.nullifierTreeMeta).toMatchObject({
          depth: NULLIFIER_TREE_HEIGHT,
          size: BigInt(2 * MAX_NULLIFIERS_PER_TX * (i + 1) + INITIAL_NULLIFIER_TREE_SIZE),
          committedSize: BigInt(2 * MAX_NULLIFIERS_PER_TX * (i + 1) + INITIAL_NULLIFIER_TREE_SIZE),
          initialSize: BigInt(INITIAL_NULLIFIER_TREE_SIZE),
          oldestHistoricBlock: 1,
          unfinalizedBlockHeight: i + 1,
          finalizedBlockHeight: 0,
        });

        expect(status.meta.publicDataTreeMeta).toMatchObject({
          depth: PUBLIC_DATA_TREE_HEIGHT,
          size: BigInt(2 * (MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX + 1) * (i + 1) + INITIAL_PUBLIC_DATA_TREE_SIZE),
          committedSize: BigInt(
            2 * (MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX + 1) * (i + 1) + INITIAL_PUBLIC_DATA_TREE_SIZE,
          ),
          initialSize: BigInt(INITIAL_PUBLIC_DATA_TREE_SIZE),
          oldestHistoricBlock: 1,
          unfinalizedBlockHeight: i + 1,
          finalizedBlockHeight: 0,
        });

        expect(status.meta.messageTreeMeta).toMatchObject({
          depth: L1_TO_L2_MSG_TREE_HEIGHT,
          size: BigInt(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP * (i + 1)),
          committedSize: BigInt(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP * (i + 1)),
          initialSize: BigInt(0),
          oldestHistoricBlock: 1,
          unfinalizedBlockHeight: i + 1,
          finalizedBlockHeight: 0,
        });
      }

      expect(statuses[1].dbStats.archiveTreeStats.nodesDBStats.numDataItems).toBeGreaterThan(
        statuses[0].dbStats.archiveTreeStats.nodesDBStats.numDataItems,
      );
      expect(statuses[1].dbStats.archiveTreeStats.blocksDBStats.numDataItems).toBeGreaterThan(
        statuses[0].dbStats.archiveTreeStats.blocksDBStats.numDataItems,
      );
      expect(statuses[1].dbStats.messageTreeStats.nodesDBStats.numDataItems).toBeGreaterThan(
        statuses[0].dbStats.messageTreeStats.nodesDBStats.numDataItems,
      );
      expect(statuses[1].dbStats.messageTreeStats.blocksDBStats.numDataItems).toBeGreaterThan(
        statuses[0].dbStats.messageTreeStats.blocksDBStats.numDataItems,
      );
      expect(statuses[1].dbStats.noteHashTreeStats.nodesDBStats.numDataItems).toBeGreaterThan(
        statuses[0].dbStats.noteHashTreeStats.nodesDBStats.numDataItems,
      );
      expect(statuses[1].dbStats.noteHashTreeStats.blocksDBStats.numDataItems).toBeGreaterThan(
        statuses[0].dbStats.noteHashTreeStats.blocksDBStats.numDataItems,
      );
      expect(statuses[1].dbStats.nullifierTreeStats.nodesDBStats.numDataItems).toBeGreaterThan(
        statuses[0].dbStats.nullifierTreeStats.nodesDBStats.numDataItems,
      );
      expect(statuses[1].dbStats.nullifierTreeStats.blocksDBStats.numDataItems).toBeGreaterThan(
        statuses[0].dbStats.nullifierTreeStats.blocksDBStats.numDataItems,
      );
      expect(statuses[1].dbStats.publicDataTreeStats.nodesDBStats.numDataItems).toBeGreaterThan(
        statuses[0].dbStats.publicDataTreeStats.nodesDBStats.numDataItems,
      );
      expect(statuses[1].dbStats.publicDataTreeStats.blocksDBStats.numDataItems).toBeGreaterThan(
        statuses[0].dbStats.publicDataTreeStats.blocksDBStats.numDataItems,
      );

      const defaultMapSizeBytes = BigInt(1024 * defaultDBMapSize);
      const tbMapSizeBytes = BigInt(1024 * tbMapSize);
      expect(statuses[0].dbStats.archiveTreeStats.mapSize).toBe(defaultMapSizeBytes);
      expect(statuses[0].dbStats.messageTreeStats.mapSize).toBe(defaultMapSizeBytes);
      expect(statuses[0].dbStats.nullifierTreeStats.mapSize).toBe(tbMapSizeBytes);
      expect(statuses[0].dbStats.noteHashTreeStats.mapSize).toBe(tbMapSizeBytes);
      expect(statuses[0].dbStats.publicDataTreeStats.mapSize).toBe(tbMapSizeBytes);

      await ws.close();
    });
  });

  describe('Initialization args', () => {
    it('initializes with prefilled public data', async () => {
      // Without prefilled.
      const ws = await NativeWorldStateService.new(EthAddress.random(), dataDir, wsTreeMapSizes);
      const { state: initialState, ...initialRest } = ws.getInitialHeader();

      // With prefilled.
      const genesis: GenesisData = {
        prefilledPublicData: [
          new PublicDataTreeLeaf(new Fr(1000), new Fr(2000)),
          new PublicDataTreeLeaf(new Fr(3000), new Fr(4000)),
        ],
        genesisTimestamp: 0n,
      };
      const wsPrefilled = await NativeWorldStateService.new(EthAddress.random(), dataDir, wsTreeMapSizes, genesis);
      const { state: prefilledState, ...prefilledRest } = wsPrefilled.getInitialHeader();

      // The root of the public data tree has changed.
      expect(initialState.partial.publicDataTree.root).not.toEqual(prefilledState.partial.publicDataTree.root);

      // The rest of the values are the same.
      expect(initialRest).toEqual(prefilledRest);
      expect(initialState.l1ToL2MessageTree).toEqual(prefilledState.l1ToL2MessageTree);
      expect(initialState.partial.noteHashTree).toEqual(prefilledState.partial.noteHashTree);
      expect(initialState.partial.nullifierTree).toEqual(prefilledState.partial.nullifierTree);
      expect(initialState.partial.publicDataTree.nextAvailableLeafIndex).toEqual(
        prefilledState.partial.publicDataTree.nextAvailableLeafIndex,
      );

      await ws.close();
      await wsPrefilled.close();
    });
  });

  describe('Map size validation', () => {
    it('rejects zero map size', async () => {
      const invalidSizes: WorldStateTreeMapSizes = {
        archiveTreeMapSizeKb: 0,
        nullifierTreeMapSizeKb: 1024,
        noteHashTreeMapSizeKb: 1024,
        messageTreeMapSizeKb: 1024,
        publicDataTreeMapSizeKb: 1024,
      };
      await expect(NativeWorldStateService.new(EthAddress.random(), dataDir, invalidSizes)).rejects.toThrow(
        'Map size must be a positive number',
      );
    });

    it('rejects negative map size', async () => {
      const invalidSizes: WorldStateTreeMapSizes = {
        archiveTreeMapSizeKb: 1024,
        nullifierTreeMapSizeKb: -1,
        noteHashTreeMapSizeKb: 1024,
        messageTreeMapSizeKb: 1024,
        publicDataTreeMapSizeKb: 1024,
      };
      await expect(NativeWorldStateService.new(EthAddress.random(), dataDir, invalidSizes)).rejects.toThrow(
        'Map size must be a positive number',
      );
    });
  });

  describe('Concurrent requests', () => {
    let ws: NativeWorldStateService;

    beforeEach(async () => {
      ws = await NativeWorldStateService.tmp();
    });

    afterEach(async () => {
      await ws.close();
    });

    it('mutating and non-mutating requests are correctly queued', async () => {
      const numReads = 64;
      const setupFork = await ws.fork();

      const { block: block1, messages } = await mockBlock(BlockNumber(1), 8, setupFork);
      const { block: block2 } = await mockBlock(BlockNumber(2), 8, setupFork);
      const { block: block3 } = await mockBlock(BlockNumber(3), 8, setupFork);

      await ws.handleL2BlockAndMessages(block1, messages);

      const testFork = await ws.fork();
      const commitmentDb = ws.getCommitted();

      const committedPath = await commitmentDb.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, 0n);

      await testFork.sequentialInsert(
        MerkleTreeId.PUBLIC_DATA_TREE,
        block2.body.txEffects.flatMap(tx => tx.publicDataWrites.map(w => w.toBuffer())),
      );

      const initialPath = await testFork.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, 0n);

      const firstReadsUncommitted = Array.from({ length: numReads }, () =>
        testFork.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, 0n),
      );
      const firstReadsCommitted = Array.from({ length: numReads }, () =>
        commitmentDb.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, 0n),
      );
      const write = testFork.sequentialInsert(
        MerkleTreeId.PUBLIC_DATA_TREE,
        block3.body.txEffects.flatMap(tx => tx.publicDataWrites.map(w => w.toBuffer())),
      );
      const secondReadsUncommitted = Array.from({ length: numReads }, () =>
        testFork.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, 0n),
      );
      const secondReadsCommitted = Array.from({ length: numReads }, () =>
        commitmentDb.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, 0n),
      );
      await Promise.all([
        ...firstReadsUncommitted,
        ...firstReadsCommitted,
        write,
        ...secondReadsUncommitted,
        ...secondReadsCommitted,
      ]);

      const finalPath = await testFork.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, 0n);

      for (let i = 0; i < numReads; i++) {
        const firstPathUncommitted = await firstReadsUncommitted[i];
        const secondPathUncommitted = await secondReadsUncommitted[i];
        expect(firstPathUncommitted).toEqual(initialPath);
        expect(secondPathUncommitted).toEqual(finalPath);

        const firstPathCommitted = await firstReadsCommitted[i];
        const secondPathCommitted = await secondReadsCommitted[i];
        expect(firstPathCommitted).toEqual(committedPath);
        expect(secondPathCommitted).toEqual(committedPath);
      }

      await Promise.all([setupFork.close(), testFork.close()]);
    }, 30_000);
  });

  describe('Checkpoints', () => {
    let ws: NativeWorldStateService;

    beforeEach(async () => {
      ws = await NativeWorldStateService.tmp();
      const fork = await ws.fork();
      const { block, messages } = await mockBlock(BlockNumber(1), 2, fork);
      await fork.close();

      await ws.handleL2BlockAndMessages(block, messages);
    });

    afterEach(async () => {
      await ws.close();
    });

    const getSiblingPaths = async (fork: MerkleTreeWriteOperations) => {
      return await Promise.all(
        [
          MerkleTreeId.L1_TO_L2_MESSAGE_TREE,
          MerkleTreeId.NOTE_HASH_TREE,
          MerkleTreeId.NULLIFIER_TREE,
          MerkleTreeId.PUBLIC_DATA_TREE,
        ].map(x => fork.getSiblingPath(x, 0n) as Promise<SiblingPath<number>>),
      );
    };

    const advanceState = async (fork: MerkleTreeWriteOperations) => {
      await Promise.all([
        fork.appendLeaves(
          MerkleTreeId.L1_TO_L2_MESSAGE_TREE,
          Array.from({ length: 8 }, () => Fr.random()),
        ),
        fork.appendLeaves(
          MerkleTreeId.NOTE_HASH_TREE,
          Array.from({ length: 8 }, () => Fr.random()),
        ),
        fork.sequentialInsert(
          MerkleTreeId.PUBLIC_DATA_TREE,
          Array.from({ length: 8 }, () => PublicDataWrite.random().toBuffer()),
        ),
        fork.batchInsert(
          MerkleTreeId.NULLIFIER_TREE,
          Array.from({ length: 8 }, () => Fr.random().toBuffer()),
          0,
        ),
      ]);
      return getSiblingPaths(fork);
    };

    const compareState = async (
      fork: MerkleTreeWriteOperations,
      pathsToCheck: SiblingPath<number>[],
      expectedEqual: boolean,
    ) => {
      const siblingPaths = await getSiblingPaths(fork);

      if (expectedEqual) {
        expect(siblingPaths).toEqual(pathsToCheck);
      } else {
        expect(siblingPaths).not.toEqual(pathsToCheck);
      }
      return siblingPaths;
    };

    it('can checkpoint and revert', async () => {
      const fork = await ws.fork();
      await fork.createCheckpoint();

      const siblingPathsBefore = await getSiblingPaths(fork);

      await advanceState(fork);

      await compareState(fork, siblingPathsBefore, false);

      await fork.revertCheckpoint();

      await compareState(fork, siblingPathsBefore, true);

      await fork.close();
    });

    it('can checkpoint and commit', async () => {
      const fork = await ws.fork();
      await fork.createCheckpoint();

      const siblingPathsBefore = await getSiblingPaths(fork);

      const siblingPathsAfter = await advanceState(fork);

      await compareState(fork, siblingPathsBefore, false);

      await fork.commitCheckpoint();

      await compareState(fork, siblingPathsAfter, true);

      await fork.close();
    });

    it('can checkpoint from committed', async () => {
      const fork = await ws.fork();
      await fork.createCheckpoint();

      const siblingPathsBefore = await getSiblingPaths(fork);

      const siblingPathsAfter = await advanceState(fork);

      await compareState(fork, siblingPathsBefore, false);

      await fork.commitCheckpoint();

      await compareState(fork, siblingPathsAfter, true);

      await fork.createCheckpoint();

      await advanceState(fork);

      await fork.commitCheckpoint();

      await compareState(fork, siblingPathsAfter, false);

      await fork.close();
    });

    it('can checkpoint from reverted', async () => {
      const fork = await ws.fork();
      await fork.createCheckpoint();

      const siblingPathsBefore = await getSiblingPaths(fork);

      const siblingPathsAfter = await advanceState(fork);

      await compareState(fork, siblingPathsBefore, false);

      await fork.commitCheckpoint();

      await compareState(fork, siblingPathsAfter, true);

      await fork.createCheckpoint();

      await advanceState(fork);

      await fork.commitCheckpoint();

      await compareState(fork, siblingPathsAfter, false);

      await fork.close();
    });

    it('can commit all checkpoints', async () => {
      const fork = await ws.fork();
      await advanceState(fork);
      const siblingPathsBefore = await getSiblingPaths(fork);
      const checkpointDepth = await fork.createCheckpoint();
      expect(checkpointDepth).toEqual(1);

      await compareState(fork, siblingPathsBefore, true);

      const numCommits = 10;
      let siblingPathsAfter: SiblingPath<number>[] = [];

      for (let i = 0; i < numCommits; i++) {
        await fork.createCheckpoint();
        siblingPathsAfter = await advanceState(fork);
      }

      await compareState(fork, siblingPathsAfter, true);
      await compareState(fork, siblingPathsBefore, false);

      await fork.commitAllCheckpointsTo(checkpointDepth - 1);
      await compareState(fork, siblingPathsAfter, true);
      await compareState(fork, siblingPathsBefore, false);

      await fork.close();
    });

    it('can revert all checkpoints', async () => {
      const fork = await ws.fork();
      await advanceState(fork);
      const siblingPathsBefore = await getSiblingPaths(fork);
      const checkpointDepth = await fork.createCheckpoint();
      expect(checkpointDepth).toEqual(1);

      await compareState(fork, siblingPathsBefore, true);

      const numCommits = 10;
      let siblingPathsAfter: SiblingPath<number>[] = [];

      for (let i = 0; i < numCommits; i++) {
        const newCheckpointDepth = await fork.createCheckpoint();
        expect(newCheckpointDepth).toEqual(checkpointDepth + i + 1);
        siblingPathsAfter = await advanceState(fork);
      }

      await compareState(fork, siblingPathsAfter, true);
      await compareState(fork, siblingPathsBefore, false);

      await fork.revertAllCheckpointsTo(checkpointDepth - 1);
      await compareState(fork, siblingPathsAfter, false);
      await compareState(fork, siblingPathsBefore, true);

      await fork.close();
    });

    it('can revert all deeper commits', async () => {
      const fork = await ws.fork();
      const siblingPathsBefore = await getSiblingPaths(fork);

      // This is the base checkpoint, this will revert all of the others
      await fork.createCheckpoint();
      await advanceState(fork);

      const numCommits = 10;

      for (let i = 0; i < numCommits; i++) {
        await fork.createCheckpoint();
        await advanceState(fork);
      }

      // now commit all of these, and also advance each committed state further
      for (let i = 0; i < numCommits; i++) {
        await fork.commitCheckpoint();
        await advanceState(fork);
      }

      // check we still have the same state
      // now revert the base checkpoint
      await fork.revertCheckpoint();

      await compareState(fork, siblingPathsBefore, true);

      await fork.close();
    });

    it('can checkpoint many levels', async () => {
      const fork = await ws.fork();

      const stackDepth = 20;

      const siblingsAtEachLevel = [];

      let index = 0;

      for (; index < stackDepth - 1; index++) {
        siblingsAtEachLevel[index] = await advanceState(fork);
        await fork.createCheckpoint();
      }

      // Add one more depth
      siblingsAtEachLevel[index] = await advanceState(fork);

      await compareState(fork, siblingsAtEachLevel[stackDepth - 1], true);

      let checkpointIndex = index;

      // Alternate committing and reverting half the levels
      for (; index > stackDepth / 2; index--) {
        if (index % 2 == 0) {
          // Here we change the checkpoint index
          await fork.revertCheckpoint();
          checkpointIndex = index - 1;
        } else {
          // We don't change the checkpoint index
          await fork.commitCheckpoint();
        }
        await compareState(fork, siblingsAtEachLevel[checkpointIndex], true);
      }

      // Now go down the stack again
      for (; index < stackDepth - 1; index++) {
        siblingsAtEachLevel[index] = await advanceState(fork);
        await fork.createCheckpoint();
      }

      // Add one more depth
      siblingsAtEachLevel[index] = await advanceState(fork);

      await compareState(fork, siblingsAtEachLevel[stackDepth - 1], true);

      checkpointIndex = index;

      // Alternate committing and reverting all the levels
      for (; index > 0; index--) {
        if (index % 2 == 0) {
          // Here we change the checkpoint index
          await fork.revertCheckpoint();
          checkpointIndex = index - 1;
        } else {
          // We don't change the checkpoint index
          await fork.commitCheckpoint();
        }
        await compareState(fork, siblingsAtEachLevel[checkpointIndex], true);
      }

      await fork.close();
    });

    it('can commit and revert', async () => {
      const fork = await ws.fork();

      const getLeaf = async (index: bigint) => {
        const leaf = await fork.getLeafValue(MerkleTreeId.NULLIFIER_TREE, index);
        return Fr.fromBuffer(leaf!);
      };

      const getPath = async (index: bigint) => {
        return await fork.getSiblingPath(MerkleTreeId.NULLIFIER_TREE, index);
      };

      await fork.createCheckpoint();

      const siblingPaths = [];
      let size = (await fork.getTreeInfo(MerkleTreeId.NULLIFIER_TREE)).size;
      let index = 0;
      const initialSize = size;
      const initialLeaf = await getLeaf(size - 1n);
      const initialPath = await getPath(size - 1n);

      const nullifiers: Fr[] = [];
      nullifiers[index] = Fr.random();
      await fork.batchInsert(MerkleTreeId.NULLIFIER_TREE, [nullifiers[index].toBuffer()], 0);
      size = (await fork.getTreeInfo(MerkleTreeId.NULLIFIER_TREE)).size;

      siblingPaths[index] = await fork.getSiblingPath(MerkleTreeId.NULLIFIER_TREE, size - 1n);
      expect(await getLeaf(size - 1n)).toEqual(nullifiers[index]);

      await fork.createCheckpoint();
      index++;

      nullifiers[index] = Fr.random();
      await fork.batchInsert(MerkleTreeId.NULLIFIER_TREE, [nullifiers[index].toBuffer()], 0);
      size = (await fork.getTreeInfo(MerkleTreeId.NULLIFIER_TREE)).size;

      siblingPaths[index] = await fork.getSiblingPath(MerkleTreeId.NULLIFIER_TREE, size - 1n);
      expect(await getLeaf(size - 1n)).toEqual(nullifiers[index]);

      await fork.revertCheckpoint();
      index--;

      size = (await fork.getTreeInfo(MerkleTreeId.NULLIFIER_TREE)).size;
      expect(await getLeaf(size - 1n)).toEqual(nullifiers[index]);
      expect(await getPath(size - 1n)).toEqual(siblingPaths[index]);

      index++;

      nullifiers[index] = Fr.random();
      await fork.batchInsert(MerkleTreeId.NULLIFIER_TREE, [nullifiers[index].toBuffer()], 0);
      size = (await fork.getTreeInfo(MerkleTreeId.NULLIFIER_TREE)).size;

      siblingPaths[index] = await fork.getSiblingPath(MerkleTreeId.NULLIFIER_TREE, size - 1n);
      expect(await getLeaf(size - 1n)).toEqual(nullifiers[index]);

      await fork.createCheckpoint();
      index++;

      nullifiers[index] = Fr.random();
      await fork.batchInsert(MerkleTreeId.NULLIFIER_TREE, [nullifiers[index].toBuffer()], 0);
      size = (await fork.getTreeInfo(MerkleTreeId.NULLIFIER_TREE)).size;

      siblingPaths[index] = await fork.getSiblingPath(MerkleTreeId.NULLIFIER_TREE, size - 1n);
      expect(await getLeaf(size - 1n)).toEqual(nullifiers[index]);

      await fork.revertCheckpoint();
      index--;

      size = (await fork.getTreeInfo(MerkleTreeId.NULLIFIER_TREE)).size;
      expect(await getLeaf(size - 1n)).toEqual(nullifiers[index]);
      expect(await getPath(size - 1n)).toEqual(siblingPaths[index]);

      index++;

      nullifiers[index] = Fr.random();
      await fork.batchInsert(MerkleTreeId.NULLIFIER_TREE, [nullifiers[index].toBuffer()], 0);
      size = (await fork.getTreeInfo(MerkleTreeId.NULLIFIER_TREE)).size;

      siblingPaths[index] = await fork.getSiblingPath(MerkleTreeId.NULLIFIER_TREE, size - 1n);
      expect(await getLeaf(size - 1n)).toEqual(nullifiers[index]);

      index++;

      nullifiers[index] = Fr.random();
      await fork.batchInsert(MerkleTreeId.NULLIFIER_TREE, [nullifiers[index].toBuffer()], 0);
      size = (await fork.getTreeInfo(MerkleTreeId.NULLIFIER_TREE)).size;

      siblingPaths[index] = await fork.getSiblingPath(MerkleTreeId.NULLIFIER_TREE, size - 1n);
      expect(await getLeaf(size - 1n)).toEqual(nullifiers[index]);

      await fork.createCheckpoint();
      index++;

      nullifiers[index] = Fr.random();
      await fork.batchInsert(MerkleTreeId.NULLIFIER_TREE, [nullifiers[index].toBuffer()], 0);
      size = (await fork.getTreeInfo(MerkleTreeId.NULLIFIER_TREE)).size;

      siblingPaths[index] = await fork.getSiblingPath(MerkleTreeId.NULLIFIER_TREE, size - 1n);
      expect(await getLeaf(size - 1n)).toEqual(nullifiers[index]);

      await fork.commitCheckpoint();

      size = (await fork.getTreeInfo(MerkleTreeId.NULLIFIER_TREE)).size;
      expect(await getLeaf(size - 1n)).toEqual(nullifiers[index]);
      expect(await getPath(size - 1n)).toEqual(siblingPaths[index]);

      await fork.revertCheckpoint();

      index = 0;
      size = (await fork.getTreeInfo(MerkleTreeId.NULLIFIER_TREE)).size;
      expect(size).toBe(initialSize);
      expect(await getLeaf(size - 1n)).toEqual(initialLeaf);
      expect(await getPath(size - 1n)).toEqual(initialPath);

      await fork.close();
    });

    it('createCheckpoint returns depth', async () => {
      const fork = await ws.fork();
      expect(await fork.createCheckpoint()).toBe(1);
      expect(await fork.createCheckpoint()).toBe(2);
      expect(await fork.createCheckpoint()).toBe(3);
      await fork.close();
    });

    it('can commit all to depth', async () => {
      const fork = await ws.fork();

      // Create 3 checkpoints with state changes between each
      const initialPaths = await getSiblingPaths(fork);

      await fork.createCheckpoint(); // depth 1
      await advanceState(fork);

      await fork.createCheckpoint(); // depth 2
      await advanceState(fork);

      await fork.createCheckpoint(); // depth 3
      const afterDepth3Paths = await advanceState(fork);

      // Commit depths 3 and 2 into depth 1, leaving depth at 1
      await fork.commitAllCheckpointsTo(1);

      // State should reflect all changes
      await compareState(fork, afterDepth3Paths, true);

      // Revert depth 1 — should go back to initial state
      await fork.revertCheckpoint();
      await compareState(fork, initialPaths, true);

      await fork.close();
    });

    it('can revert all to depth', async () => {
      const fork = await ws.fork();

      await fork.createCheckpoint(); // depth 1
      const afterDepth1Paths = await advanceState(fork);

      await fork.createCheckpoint(); // depth 2
      await advanceState(fork);

      await fork.createCheckpoint(); // depth 3
      await advanceState(fork);

      // Revert depths 3 and 2, leaving depth at 1
      await fork.revertAllCheckpointsTo(1);

      // Should be back to after depth 1 state
      await compareState(fork, afterDepth1Paths, true);

      // Depth 1 still active — commit it
      await fork.commitCheckpoint();
      await compareState(fork, afterDepth1Paths, true);

      await fork.close();
    });

    it('revert to depth preserves lower checkpoints', async () => {
      const fork = await ws.fork();

      await fork.createCheckpoint(); // depth 1
      await advanceState(fork);

      await fork.createCheckpoint(); // depth 2
      await advanceState(fork);

      // Revert depth 2 only, leaving depth at 1
      await fork.revertAllCheckpointsTo(1);

      // Create new checkpoint at depth 2 with different changes
      await fork.createCheckpoint(); // depth 2 again
      const newDepth2Paths = await advanceState(fork);

      // Commit depth 2
      await fork.commitCheckpoint();

      // Commit depth 1
      await fork.commitCheckpoint();

      // Final state should include the new depth 2 changes
      await compareState(fork, newDepth2Paths, true);

      await fork.close();
    });

    it('commit all with depth 0 commits everything', async () => {
      const fork = await ws.fork();

      await fork.createCheckpoint(); // depth 1
      await advanceState(fork);

      await fork.createCheckpoint(); // depth 2
      const finalPaths = await advanceState(fork);

      // depth 0 commits all checkpoints
      await fork.commitAllCheckpointsTo(0);

      // State should reflect all changes
      await compareState(fork, finalPaths, true);

      await fork.close();
    });

    it('revert all with depth 0 reverts everything', async () => {
      const fork = await ws.fork();
      const initialPaths = await getSiblingPaths(fork);

      await fork.createCheckpoint(); // depth 1
      await advanceState(fork);

      await fork.createCheckpoint(); // depth 2
      await advanceState(fork);

      // depth 0 reverts all checkpoints
      await fork.revertAllCheckpointsTo(0);

      // Should be back to initial state
      await compareState(fork, initialPaths, true);

      await fork.close();
    });

    it('depth is consistent across multiple checkpoint cycles', async () => {
      const fork = await ws.fork();

      // Create checkpoint depth 1
      expect(await fork.createCheckpoint()).toBe(1);
      const afterDepth1Paths = await advanceState(fork);

      // Create checkpoint depth 2
      expect(await fork.createCheckpoint()).toBe(2);
      await advanceState(fork);

      // Revert depth 2, leaving depth at 1
      await fork.revertAllCheckpointsTo(1);
      await compareState(fork, afterDepth1Paths, true);

      // Create new depth 2
      expect(await fork.createCheckpoint()).toBe(2);
      const newDepth2Paths = await advanceState(fork);

      // Commit depth 2
      await fork.commitCheckpoint();
      await compareState(fork, newDepth2Paths, true);

      // Commit depth 1
      await fork.commitCheckpoint();
      await compareState(fork, newDepth2Paths, true);

      await fork.close();
    });
  });
});
