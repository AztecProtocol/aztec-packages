import {
  ARCHIVE_HEIGHT,
  L1_TO_L2_MSG_TREE_HEIGHT,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  NOTE_HASH_TREE_HEIGHT,
  NULLIFIER_TREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
} from '@aztec/constants';
import { timesAsync } from '@aztec/foundation/collection';
import { randomBytes } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import type { SiblingPath } from '@aztec/foundation/trees';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import type { L2Block } from '@aztec/stdlib/block';
import { DatabaseVersion, DatabaseVersionManager } from '@aztec/stdlib/database-version';
import type { MerkleTreeLeafType, MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import { makeContentCommitment, makeGlobalVariables } from '@aztec/stdlib/testing';
import { AppendOnlyTreeSnapshot, MerkleTreeId, PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import { BlockHeader } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import type { WorldStateTreeMapSizes } from '../synchronizer/factory.js';
import { assertSameState, compareChains, mockBlock, mockEmptyBlock } from '../test/utils.js';
import { INITIAL_NULLIFIER_TREE_SIZE, INITIAL_PUBLIC_DATA_TREE_SIZE } from '../world-state-db/merkle_tree_db.js';
import type { WorldStateStatusSummary } from './message.js';
import { NativeWorldStateService, WORLD_STATE_DB_VERSION, WORLD_STATE_DIR } from './native_world_state.js';

jest.setTimeout(60_000);

describe('NativeWorldState', () => {
  let dataDir: string;
  let backupDir: string | undefined;
  let rollupAddress: EthAddress;
  const defaultDBMapSize = 25 * 1024 * 1024;
  const wsTreeMapSizes: WorldStateTreeMapSizes = {
    archiveTreeMapSizeKb: defaultDBMapSize,
    nullifierTreeMapSizeKb: defaultDBMapSize,
    noteHashTreeMapSizeKb: defaultDBMapSize,
    messageTreeMapSizeKb: defaultDBMapSize,
    publicDataTreeMapSizeKb: defaultDBMapSize,
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
      ({ block, messages } = await mockBlock(1, 2, fork));
      noteHash = block.body.txEffects[0].noteHashes[0];
      await fork.close();

      await ws.handleL2BlockAndMessages(block, messages);
      await ws.close();
    });

    it('correctly restores committed state', async () => {
      const ws = await NativeWorldStateService.new(rollupAddress, dataDir, wsTreeMapSizes);
      await expect(findLeafIndex(block.body.txEffects[0].noteHashes[0], ws)).resolves.toBeDefined();
      const status = await ws.getStatusSummary();
      expect(status.unfinalisedBlockNumber).toBe(1n);
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
      expect(status2.unfinalisedBlockNumber).toBe(1n);
      await expect(findLeafIndex(noteHash, ws2)).resolves.toBeDefined();
      expect((await ws2.getStatusSummary()).unfinalisedBlockNumber).toBe(1n);
      await ws2.close();
    });

    it('blocks writes while copying', async () => {
      backupDir = await mkdtemp(join(tmpdir(), 'world-state-backup-test'));
      const ws = await NativeWorldStateService.new(rollupAddress, dataDir, wsTreeMapSizes);
      const copyPromise = ws.backupTo(join(backupDir, WORLD_STATE_DIR), true);

      await timesAsync(5, async i => {
        const fork = await ws.fork();
        const { block, messages } = await mockBlock(i + 1, 2, fork);
        await ws.handleL2BlockAndMessages(block, messages);
        await fork.close();
      });

      await copyPromise;
      expect((await ws.getStatusSummary()).unfinalisedBlockNumber).toBe(6n);
      await ws.close();

      await writeVersion(backupDir);
      const ws2 = await NativeWorldStateService.new(rollupAddress, backupDir, wsTreeMapSizes);
      await expect(findLeafIndex(block.body.txEffects[0].noteHashes[0], ws2)).resolves.toBeDefined();
      expect((await ws2.getStatusSummary()).unfinalisedBlockNumber).toBe(1n);
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
      expect(status.unfinalisedBlockNumber).toBe(0n);
      await ws.close();
    });

    it('clears the database if the world state version is different', async () => {
      // open ws against the data again
      let ws = await NativeWorldStateService.new(rollupAddress, dataDir, wsTreeMapSizes);
      // db should be empty
      let emptyStatus = await ws.getStatusSummary();
      expect(emptyStatus.unfinalisedBlockNumber).toBe(0n);

      // populate it and then close it
      const fork = await ws.fork();
      ({ block, messages } = await mockBlock(1, 2, fork));
      await fork.close();

      const status = await ws.handleL2BlockAndMessages(block, messages);
      expect(status.summary.unfinalisedBlockNumber).toBe(1n);
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
      expect(emptyStatus.unfinalisedBlockNumber).toBe(0n);
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

      const { block: block1, messages: messages1 } = await mockBlock(1, 8, initialFork);
      const { block: block2, messages: messages2 } = await mockBlock(2, 8, initialFork);
      const { block: block3, messages: messages3 } = await mockBlock(3, 8, initialFork);

      // The first block should succeed
      await expect(ws.handleL2BlockAndMessages(block1, messages1)).resolves.toBeDefined();

      // The trees should be synched at block 1
      const goodSummary = await ws.getStatusSummary();
      expect(goodSummary).toEqual({
        unfinalisedBlockNumber: 1n,
        finalisedBlockNumber: 0n,
        oldestHistoricalBlock: 1n,
        treesAreSynched: true,
      } as WorldStateStatusSummary);

      // The second block should fail
      await expect(ws.handleL2BlockAndMessages(block2, messages2)).rejects.toThrow();

      // The summary should indicate that the unfinalised block number (that of the archive tree) is 2
      // But it should also tell us that the trees are not synched
      const badSummary = await ws.getStatusSummary();
      expect(badSummary).toEqual({
        unfinalisedBlockNumber: 2n,
        finalisedBlockNumber: 0n,
        oldestHistoricalBlock: 1n,
        treesAreSynched: false,
      } as WorldStateStatusSummary);

      // Commits should always fail now, the trees are in an inconsistent state
      await expect(ws.handleL2BlockAndMessages(block2, messages2)).rejects.toThrow('World state trees are out of sync');
      await expect(ws.handleL2BlockAndMessages(block3, messages3)).rejects.toThrow('World state trees are out of sync');

      // Creating another world state instance should fail
      await ws.close();
    });

    it('manually clears the database', async () => {
      const ws = await NativeWorldStateService.new(EthAddress.random(), dataDir, wsTreeMapSizes);
      const initialStatus = await ws.getStatusSummary();
      expect(initialStatus.unfinalisedBlockNumber).toBe(0n);

      // Populate the db
      const fork = await ws.fork();
      ({ block, messages } = await mockBlock(1, 2, fork));
      await fork.close();
      const status = await ws.handleL2BlockAndMessages(block, messages);
      expect(status.summary.unfinalisedBlockNumber).toBe(1n);

      // Clear it
      await ws.clear();
      const emptyStatus = await ws.getStatusSummary();
      expect(emptyStatus.unfinalisedBlockNumber).toBe(0n);
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
        makeContentCommitment(),
        stateReference,
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
        const { block, messages } = await mockBlock(i + 1, 2, initialFork);
        await ws.handleL2BlockAndMessages(block, messages);
      }

      const fork = await ws.fork(3);
      const stateReference = await fork.getStateReference();
      const archiveInfo = await fork.getTreeInfo(MerkleTreeId.ARCHIVE);
      const header = new BlockHeader(
        new AppendOnlyTreeSnapshot(new Fr(archiveInfo.root), Number(archiveInfo.size)),
        makeContentCommitment(),
        stateReference,
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
        const { block, messages } = await mockBlock(blockNumber, 1, fork);
        const status = await ws.handleL2BlockAndMessages(block, messages);

        expect(status.summary.unfinalisedBlockNumber).toBe(BigInt(blockNumber));
      }

      const forkAtZero = await ws.fork(0);
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
        const { block, messages } = await mockBlock(blockNumber, 1, fork);
        const status = await ws.handleL2BlockAndMessages(block, messages);

        expect(status.summary.unfinalisedBlockNumber).toBe(BigInt(blockNumber));
        expect(status.summary.oldestHistoricalBlock).toBe(1n);

        if (provenBlock > 0) {
          const provenStatus = await ws.setFinalised(BigInt(provenBlock));
          expect(provenStatus.unfinalisedBlockNumber).toBe(BigInt(blockNumber));
          expect(provenStatus.finalisedBlockNumber).toBe(BigInt(provenBlock));
          expect(provenStatus.oldestHistoricalBlock).toBe(1n);
        } else {
          expect(status.summary.finalisedBlockNumber).toBe(0n);
        }
      }
    });

    it('can finalise multiple blocks', async () => {
      const fork = await ws.fork();

      for (let i = 0; i < 16; i++) {
        const blockNumber = i + 1;
        const { block, messages } = await mockBlock(blockNumber, 1, fork);
        const status = await ws.handleL2BlockAndMessages(block, messages);

        expect(status.summary.unfinalisedBlockNumber).toBe(BigInt(blockNumber));
        expect(status.summary.oldestHistoricalBlock).toBe(1n);
        expect(status.summary.finalisedBlockNumber).toBe(0n);
      }

      const status = await ws.setFinalised(8n);
      expect(status.unfinalisedBlockNumber).toBe(16n);
      expect(status.oldestHistoricalBlock).toBe(1n);
      expect(status.finalisedBlockNumber).toBe(8n);
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
        const { block, messages } = await mockBlock(blockNumber, 1, fork);
        const status = await ws.handleL2BlockAndMessages(block, messages);

        expect(status.summary.unfinalisedBlockNumber).toBe(BigInt(blockNumber));

        const blockFork = await ws.fork();
        forks.push(blockFork);

        if (provenBlock > 0) {
          const provenStatus = await ws.setFinalised(BigInt(provenBlock));
          expect(provenStatus.finalisedBlockNumber).toBe(BigInt(provenBlock));
        } else {
          expect(status.summary.finalisedBlockNumber).toBe(0n);
        }

        if (prunedBlockNumber > 0) {
          const prunedStatus = await ws.removeHistoricalBlocks(BigInt(prunedBlockNumber + 1));
          expect(prunedStatus.summary.oldestHistoricalBlock).toBe(BigInt(prunedBlockNumber + 1));
        } else {
          expect(status.summary.oldestHistoricalBlock).toBe(1n);
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
        await expect(ws.removeHistoricalBlocks(BigInt(i + 1))).rejects.toThrow(
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
        const { block, messages } = await mockBlock(blockNumber, 1, fork);
        const status = await ws.handleL2BlockAndMessages(block, messages);

        expect(status.summary.unfinalisedBlockNumber).toBe(BigInt(blockNumber));

        const blockFork = await ws.fork();
        forks.push(blockFork);

        if (provenBlock > 0) {
          const provenStatus = await ws.setFinalised(BigInt(provenBlock));
          expect(provenStatus.finalisedBlockNumber).toBe(BigInt(provenBlock));
        } else {
          expect(status.summary.finalisedBlockNumber).toBe(0n);
        }
      }

      ws = await unsyncTrees(ws, ['PublicDataTree', 'NullifierTree'], async (worldState: NativeWorldStateService) => {
        await worldState.removeHistoricalBlocks(5n);
      });

      // Open up the world state again and try removing the first 10 historical blocks
      // We should handle the fact that some trees are at historical block 5 and some are at 1
      const fullStatus = await ws.removeHistoricalBlocks(10n);
      expect(fullStatus.meta.archiveTreeMeta.oldestHistoricBlock).toEqual(10n);
      expect(fullStatus.meta.messageTreeMeta.oldestHistoricBlock).toEqual(10n);
      expect(fullStatus.meta.noteHashTreeMeta.oldestHistoricBlock).toEqual(10n);
      expect(fullStatus.meta.nullifierTreeMeta.oldestHistoricBlock).toEqual(10n);
      expect(fullStatus.meta.publicDataTreeMeta.oldestHistoricBlock).toEqual(10n);
    });

    it('handles finalised block numbers being out of sync', async () => {
      const fork = await ws.fork();
      const provenBlockLag = 12;

      for (let i = 0; i < 16; i++) {
        const blockNumber = i + 1;
        const provenBlock = blockNumber - provenBlockLag;
        const { block, messages } = await mockBlock(blockNumber, 1, fork);
        const status = await ws.handleL2BlockAndMessages(block, messages);

        expect(status.summary.unfinalisedBlockNumber).toBe(BigInt(blockNumber));

        if (provenBlock > 0) {
          const provenStatus = await ws.setFinalised(BigInt(provenBlock));
          expect(provenStatus.finalisedBlockNumber).toBe(BigInt(provenBlock));
        } else {
          expect(status.summary.finalisedBlockNumber).toBe(0n);
        }
      }

      // The finalised block number is 4.
      // We are going to move it forward for some of the trees but not others

      ws = await unsyncTrees(ws, ['PublicDataTree', 'NullifierTree'], async (worldState: NativeWorldStateService) => {
        await worldState.setFinalised(BigInt(8));
      });

      // Open up the world state again and try moving the finalised block to 12
      // We should handle the fact that some trees are at historical block 5 and some are at 1
      const summary = await ws.setFinalised(12n);
      expect(summary.finalisedBlockNumber).toEqual(12n);
      expect(summary.treesAreSynched).toBeTruthy();
    });

    it('handles pending block numbers being out of sync', async () => {
      {
        const fork = await ws.fork();

        for (let i = 0; i < 8; i++) {
          const blockNumber = i + 1;
          const { block, messages } = await mockBlock(blockNumber, 1, fork);
          await ws.handleL2BlockAndMessages(block, messages);
        }
      }

      // The pending block number is 8, we wil now add some blocks to only some of the trees
      ws = await unsyncTrees(ws, ['PublicDataTree', 'NullifierTree'], async (worldState: NativeWorldStateService) => {
        const fork = await worldState.fork();
        for (let i = 8; i < 16; i++) {
          const blockNumber = i + 1;
          const { block, messages } = await mockBlock(blockNumber, 1, fork);
          await worldState.handleL2BlockAndMessages(block, messages);
        }
      });

      {
        const fork = await ws.fork();

        // Open up the world state again and try adding another block
        // We should re-sync the trees so they are at the same (earliest) block
        const summary = await ws.getStatusSummary();
        expect(summary.unfinalisedBlockNumber).toEqual(8n);

        const blockNumber = 9;
        const { block, messages } = await mockBlock(blockNumber, 1, fork);
        const statusFull = await ws.handleL2BlockAndMessages(block, messages);
        expect(statusFull.meta.archiveTreeMeta.unfinalisedBlockHeight).toEqual(9n);
        expect(statusFull.meta.messageTreeMeta.unfinalisedBlockHeight).toEqual(9n);
        expect(statusFull.meta.noteHashTreeMeta.unfinalisedBlockHeight).toEqual(9n);
        expect(statusFull.meta.nullifierTreeMeta.unfinalisedBlockHeight).toEqual(9n);
        expect(statusFull.meta.publicDataTreeMeta.unfinalisedBlockHeight).toEqual(9n);
        expect(statusFull.summary.treesAreSynched).toBeTruthy();
      }
    });

    it('handles all block numbers being out of sync', async () => {
      {
        const fork = await ws.fork();
        const provenBlockLag = 12;

        for (let i = 0; i < 16; i++) {
          const blockNumber = i + 1;
          const { block, messages } = await mockBlock(blockNumber, 1, fork);
          const status = await ws.handleL2BlockAndMessages(block, messages);

          const provenBlock = blockNumber - provenBlockLag;

          if (provenBlock > 0) {
            const provenStatus = await ws.setFinalised(BigInt(provenBlock));
            expect(provenStatus.finalisedBlockNumber).toBe(BigInt(provenBlock));
          } else {
            expect(status.summary.finalisedBlockNumber).toBe(0n);
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
          const { block, messages } = await mockBlock(blockNumber, 1, fork);
          await worldState.handleL2BlockAndMessages(block, messages);
          const provenBlock = blockNumber - provenBlockLag;
          await worldState.setFinalised(BigInt(provenBlock));
        }
        await worldState.removeHistoricalBlocks(4n);
      });

      {
        const fork = await ws.fork();

        // Open up the world state again and try adding another block
        // We should re-sync the trees so they are at the same (earliest) block
        const expectedPendingBlockNumber = 16n;
        const summary = await ws.getStatusSummary();
        expect(summary.unfinalisedBlockNumber).toEqual(expectedPendingBlockNumber);

        const { block, messages } = await mockBlock(Number(expectedPendingBlockNumber + 1n), 1, fork);
        const statusFull = await ws.handleL2BlockAndMessages(block, messages);
        expect(statusFull.summary.treesAreSynched).toBeTruthy();
        expect(statusFull.meta.archiveTreeMeta.unfinalisedBlockHeight).toEqual(expectedPendingBlockNumber + 1n);
        expect(statusFull.meta.messageTreeMeta.unfinalisedBlockHeight).toEqual(expectedPendingBlockNumber + 1n);
        expect(statusFull.meta.noteHashTreeMeta.unfinalisedBlockHeight).toEqual(expectedPendingBlockNumber + 1n);
        expect(statusFull.meta.nullifierTreeMeta.unfinalisedBlockHeight).toEqual(expectedPendingBlockNumber + 1n);
        expect(statusFull.meta.publicDataTreeMeta.unfinalisedBlockHeight).toEqual(expectedPendingBlockNumber + 1n);

        const expectedFinalisedBlockNumber = 8n;
        const expectedHistoricalBlockNumber = 4n;

        expect(statusFull.meta.archiveTreeMeta.finalisedBlockHeight).toEqual(expectedFinalisedBlockNumber);
        expect(statusFull.meta.messageTreeMeta.finalisedBlockHeight).toEqual(expectedFinalisedBlockNumber);
        expect(statusFull.meta.noteHashTreeMeta.finalisedBlockHeight).toEqual(expectedFinalisedBlockNumber);
        expect(statusFull.meta.nullifierTreeMeta.finalisedBlockHeight).toEqual(expectedFinalisedBlockNumber);
        expect(statusFull.meta.publicDataTreeMeta.finalisedBlockHeight).toEqual(expectedFinalisedBlockNumber);

        expect(statusFull.meta.archiveTreeMeta.oldestHistoricBlock).toEqual(expectedHistoricalBlockNumber);
        expect(statusFull.meta.messageTreeMeta.oldestHistoricBlock).toEqual(expectedHistoricalBlockNumber);
        expect(statusFull.meta.noteHashTreeMeta.oldestHistoricBlock).toEqual(expectedHistoricalBlockNumber);
        expect(statusFull.meta.nullifierTreeMeta.oldestHistoricBlock).toEqual(expectedHistoricalBlockNumber);
        expect(statusFull.meta.publicDataTreeMeta.oldestHistoricBlock).toEqual(expectedHistoricalBlockNumber);

        const finalisedStatus = await ws.setFinalised(expectedFinalisedBlockNumber + 1n);
        expect(finalisedStatus.finalisedBlockNumber).toEqual(expectedFinalisedBlockNumber + 1n);
        expect(finalisedStatus.treesAreSynched).toBeTruthy();

        const fullStatus = await ws.removeHistoricalBlocks(expectedHistoricalBlockNumber + 1n);
        expect(fullStatus.meta.archiveTreeMeta.oldestHistoricBlock).toEqual(expectedHistoricalBlockNumber + 1n);
        expect(fullStatus.meta.messageTreeMeta.oldestHistoricBlock).toEqual(expectedHistoricalBlockNumber + 1n);
        expect(fullStatus.meta.noteHashTreeMeta.oldestHistoricBlock).toEqual(expectedHistoricalBlockNumber + 1n);
        expect(fullStatus.meta.nullifierTreeMeta.oldestHistoricBlock).toEqual(expectedHistoricalBlockNumber + 1n);
        expect(fullStatus.meta.publicDataTreeMeta.oldestHistoricBlock).toEqual(expectedHistoricalBlockNumber + 1n);
        expect(fullStatus.summary.treesAreSynched).toBeTruthy();
      }
    });

    it.each([
      ['1-tx blocks', (blockNumber: number, fork: MerkleTreeWriteOperations) => mockBlock(blockNumber, 1, fork)],
      ['empty blocks', (blockNumber: number, fork: MerkleTreeWriteOperations) => mockEmptyBlock(blockNumber, fork)],
    ])('can re-org %s', async (_, genBlock) => {
      const nonReorgState = await NativeWorldStateService.tmp();
      const sequentialReorgState = await NativeWorldStateService.tmp();
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
        const unwindStatus = await sequentialReorgState.unwindBlocks(BigInt(blockNumber - 1));
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
      await ws.unwindBlocks(8n);

      // check that it is not possible to re-org blocks that were already reorged.
      await expect(ws.unwindBlocks(10n)).rejects.toThrow(
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
        const { block, messages } = await mockBlock(blockNumber, 1, fork);
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
        const nonReorgSnapshot = nonReorgState.getSnapshot(blockNumber);
        const reorgSnapshot = ws.getSnapshot(blockNumber);
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
        const { block, messages } = await mockBlock(blockNumber, 1, fork);
        const status = await ws.handleL2BlockAndMessages(block, messages);
        blockStats.push(status);
        const blockFork = await ws.fork();
        blockForks.push(blockFork);
        const treeInfo = await ws.getCommitted().getTreeInfo(MerkleTreeId.NULLIFIER_TREE);
        blockTreeInfos.push(treeInfo);
        const siblingPath = await ws.getCommitted().getSiblingPath(MerkleTreeId.NULLIFIER_TREE, 0n);
        siblingPaths.push(siblingPath);
      }

      await ws.unwindBlocks(8n);

      for (let i = 0; i < 16; i++) {
        if (i < 8) {
          expect(await blockForks[i].getSiblingPath(MerkleTreeId.NULLIFIER_TREE, 0n)).toEqual(siblingPaths[i]);
        } else {
          await expect(blockForks[i].getSiblingPath(MerkleTreeId.NULLIFIER_TREE, 0n)).rejects.toThrow('Fork not found');
        }
      }
    });
  });

  describe('Finding leaves', () => {
    let block: L2Block;
    let messages: Fr[];

    it('retrieves leaf indices', async () => {
      const ws = await NativeWorldStateService.new(rollupAddress, dataDir, wsTreeMapSizes);
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
        ({ block, messages } = await mockBlock(1, txsPerBlock, fork));
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
      const ws = await NativeWorldStateService.new(rollupAddress, dataDir, wsTreeMapSizes);
      const numBlocks = 2;
      const txsPerBlock = 2;
      const noteHashes: Fr[] = [];
      const nullifiers: Buffer[] = [];
      const publicWrites: Buffer[] = [];
      for (let i = 0; i < numBlocks; i++) {
        const fork = await ws.fork();
        ({ block, messages } = await mockBlock(1, txsPerBlock, fork));
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
      const ws = await NativeWorldStateService.new(rollupAddress, dataDir, wsTreeMapSizes);
      const statuses = [];
      const numBlocks = 2;
      const txsPerBlock = 2;
      for (let i = 0; i < numBlocks; i++) {
        const fork = await ws.fork();
        ({ block, messages } = await mockBlock(1, txsPerBlock, fork));
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
        expect(blockNumbers).toEqual([blockNumber, blockNumber, blockNumber + 1].map(x => BigInt(x)));
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
      expect(blockNumbers).toEqual([2, 2, undefined].map(x => (x == undefined ? x : BigInt(x))));
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
        ({ block, messages } = await mockBlock(1, 2, fork));
        await fork.close();
        const status = await ws.handleL2BlockAndMessages(block, messages);
        statuses.push(status);

        expect(status.summary).toEqual({
          unfinalisedBlockNumber: BigInt(i + 1),
          finalisedBlockNumber: 0n,
          oldestHistoricalBlock: 1n,
          treesAreSynched: true,
        } as WorldStateStatusSummary);

        expect(status.meta.archiveTreeMeta).toMatchObject({
          depth: ARCHIVE_HEIGHT,
          size: BigInt(i + 2),
          committedSize: BigInt(i + 2),
          initialSize: BigInt(1),
          oldestHistoricBlock: 1n,
          unfinalisedBlockHeight: BigInt(i + 1),
          finalisedBlockHeight: 0n,
        });

        expect(status.meta.noteHashTreeMeta).toMatchObject({
          depth: NOTE_HASH_TREE_HEIGHT,
          size: BigInt(2 * MAX_NOTE_HASHES_PER_TX * (i + 1)),
          committedSize: BigInt(2 * MAX_NOTE_HASHES_PER_TX * (i + 1)),
          initialSize: BigInt(0),
          oldestHistoricBlock: 1n,
          unfinalisedBlockHeight: BigInt(i + 1),
          finalisedBlockHeight: 0n,
        });

        expect(status.meta.nullifierTreeMeta).toMatchObject({
          depth: NULLIFIER_TREE_HEIGHT,
          size: BigInt(2 * MAX_NULLIFIERS_PER_TX * (i + 1) + INITIAL_NULLIFIER_TREE_SIZE),
          committedSize: BigInt(2 * MAX_NULLIFIERS_PER_TX * (i + 1) + INITIAL_NULLIFIER_TREE_SIZE),
          initialSize: BigInt(INITIAL_NULLIFIER_TREE_SIZE),
          oldestHistoricBlock: 1n,
          unfinalisedBlockHeight: BigInt(i + 1),
          finalisedBlockHeight: 0n,
        });

        expect(status.meta.publicDataTreeMeta).toMatchObject({
          depth: PUBLIC_DATA_TREE_HEIGHT,
          size: BigInt(2 * (MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX + 1) * (i + 1) + INITIAL_PUBLIC_DATA_TREE_SIZE),
          committedSize: BigInt(
            2 * (MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX + 1) * (i + 1) + INITIAL_PUBLIC_DATA_TREE_SIZE,
          ),
          initialSize: BigInt(INITIAL_PUBLIC_DATA_TREE_SIZE),
          oldestHistoricBlock: 1n,
          unfinalisedBlockHeight: BigInt(i + 1),
          finalisedBlockHeight: 0n,
        });

        expect(status.meta.messageTreeMeta).toMatchObject({
          depth: L1_TO_L2_MSG_TREE_HEIGHT,
          size: BigInt(2 * MAX_L2_TO_L1_MSGS_PER_TX * (i + 1)),
          committedSize: BigInt(2 * MAX_L2_TO_L1_MSGS_PER_TX * (i + 1)),
          initialSize: BigInt(0),
          oldestHistoricBlock: 1n,
          unfinalisedBlockHeight: BigInt(i + 1),
          finalisedBlockHeight: 0n,
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

      const mapSizeBytes = BigInt(1024 * defaultDBMapSize);
      expect(statuses[0].dbStats.archiveTreeStats.mapSize).toBe(mapSizeBytes);
      expect(statuses[0].dbStats.messageTreeStats.mapSize).toBe(mapSizeBytes);
      expect(statuses[0].dbStats.nullifierTreeStats.mapSize).toBe(mapSizeBytes);
      expect(statuses[0].dbStats.noteHashTreeStats.mapSize).toBe(mapSizeBytes);
      expect(statuses[0].dbStats.publicDataTreeStats.mapSize).toBe(mapSizeBytes);

      await ws.close();
    });
  });

  describe('Initialization args', () => {
    it('initializes with prefilled public data', async () => {
      // Without prefilled.
      const ws = await NativeWorldStateService.new(EthAddress.random(), dataDir, wsTreeMapSizes);
      const { state: initialState, ...initialRest } = ws.getInitialHeader();

      // With prefilled.
      const prefilledPublicData = [
        new PublicDataTreeLeaf(new Fr(1000), new Fr(2000)),
        new PublicDataTreeLeaf(new Fr(3000), new Fr(4000)),
      ];
      const wsPrefilled = await NativeWorldStateService.new(
        EthAddress.random(),
        dataDir,
        wsTreeMapSizes,
        prefilledPublicData,
      );
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

      const { block: block1, messages } = await mockBlock(1, 8, setupFork);
      const { block: block2 } = await mockBlock(2, 8, setupFork);
      const { block: block3 } = await mockBlock(3, 8, setupFork);

      await ws.handleL2BlockAndMessages(block1, messages);

      const testFork = await ws.fork();
      const commitmentDb = ws.getCommitted();

      const committedPath = await commitmentDb.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, 0n);

      await testFork.sequentialInsert(
        MerkleTreeId.PUBLIC_DATA_TREE,
        block2.body.txEffects.map(write => {
          return write.toBuffer();
        }),
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
        block3.body.txEffects.map(write => {
          return write.toBuffer();
        }),
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
      const { block, messages } = await mockBlock(1, 2, fork);
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
        ].map(x => fork.getSiblingPath(x, 0n)),
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
      await fork.createCheckpoint();

      await compareState(fork, siblingPathsBefore, true);

      const numCommits = 10;
      let siblingPathsAfter: SiblingPath<number>[] = [];

      for (let i = 0; i < numCommits; i++) {
        await fork.createCheckpoint();
        siblingPathsAfter = await advanceState(fork);
      }

      await compareState(fork, siblingPathsAfter, true);
      await compareState(fork, siblingPathsBefore, false);

      await fork.commitAllCheckpoints();
      await compareState(fork, siblingPathsAfter, true);
      await compareState(fork, siblingPathsBefore, false);

      await fork.close();
    });

    it('can revert all checkpoints', async () => {
      const fork = await ws.fork();
      await advanceState(fork);
      const siblingPathsBefore = await getSiblingPaths(fork);
      await fork.createCheckpoint();

      await compareState(fork, siblingPathsBefore, true);

      const numCommits = 10;
      let siblingPathsAfter: SiblingPath<number>[] = [];

      for (let i = 0; i < numCommits; i++) {
        await fork.createCheckpoint();
        siblingPathsAfter = await advanceState(fork);
      }

      await compareState(fork, siblingPathsAfter, true);
      await compareState(fork, siblingPathsBefore, false);

      await fork.revertAllCheckpoints();
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
  });
});
