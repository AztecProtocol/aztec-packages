import { type L2Block, MerkleTreeId } from '@aztec/circuit-types';
import { AppendOnlyTreeSnapshot, EthAddress, Fr, Header } from '@aztec/circuits.js';
import { makeContentCommitment, makeGlobalVariables } from '@aztec/circuits.js/testing';

import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertSameState, compareChains, mockBlock } from '../test/utils.js';
import { NativeWorldStateService } from './native_world_state.js';

describe('NativeWorldState', () => {
  let dataDir: string;
  let rollupAddress: EthAddress;

  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'world-state-test'));
    rollupAddress = EthAddress.random();
  });

  afterAll(async () => {
    await rm(dataDir, { recursive: true });
  });

  describe('persistence', () => {
    let block: L2Block;
    let messages: Fr[];

    beforeAll(async () => {
      const ws = await NativeWorldStateService.new(rollupAddress, dataDir);
      const fork = await ws.fork();
      ({ block, messages } = await mockBlock(1, 2, fork));
      await fork.close();

      await ws.handleL2BlockAndMessages(block, messages);
      await ws.close();
    }, 30_000);

    it('correctly restores committed state', async () => {
      const ws = await NativeWorldStateService.new(rollupAddress, dataDir);
      await expect(
        ws.getCommitted().findLeafIndex(MerkleTreeId.NOTE_HASH_TREE, block.body.txEffects[0].noteHashes[0]),
      ).resolves.toBeDefined();
      await ws.close();
    });

    it('clears the database if the rollup is different', async () => {
      // open ws against the same data dir but a different rollup
      let ws = await NativeWorldStateService.new(EthAddress.random(), dataDir);
      // db should be empty
      await expect(
        ws.getCommitted().findLeafIndex(MerkleTreeId.NOTE_HASH_TREE, block.body.txEffects[0].noteHashes[0]),
      ).resolves.toBeUndefined();

      await ws.close();

      // later on, open ws against the original rollup and same data dir
      // db should be empty because we wiped all its files earlier
      ws = await NativeWorldStateService.new(rollupAddress, dataDir);
      await expect(
        ws.getCommitted().findLeafIndex(MerkleTreeId.NOTE_HASH_TREE, block.body.txEffects[0].noteHashes[0]),
      ).resolves.toBeUndefined();
      await ws.close();
    });
  });

  describe('Forks', () => {
    let ws: NativeWorldStateService;

    beforeEach(async () => {
      ws = await NativeWorldStateService.new(EthAddress.random(), dataDir);
    });

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
      const header = new Header(
        new AppendOnlyTreeSnapshot(new Fr(archiveInfo.root), Number(archiveInfo.size)),
        makeContentCommitment(),
        stateReference,
        makeGlobalVariables(),
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
      const header = new Header(
        new AppendOnlyTreeSnapshot(new Fr(archiveInfo.root), Number(archiveInfo.size)),
        makeContentCommitment(),
        stateReference,
        makeGlobalVariables(),
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

        expect(status.unfinalisedBlockNumber).toBe(blockNumber);
      }

      const forkAtZero = await ws.fork(0);
      await compareChains(forkAtGenesis, forkAtZero);
    }, 30_000);
  });

  describe('Pending and Proven chain', () => {
    let ws: NativeWorldStateService;

    beforeEach(async () => {
      ws = await NativeWorldStateService.tmp();
    });

    afterEach(async () => {
      await ws.close();
    });

    it('Tracks pending and proven chains', async () => {
      const fork = await ws.fork();

      for (let i = 0; i < 16; i++) {
        const blockNumber = i + 1;
        const provenBlock = blockNumber - 4;
        const { block, messages } = await mockBlock(blockNumber, 1, fork);
        const status = await ws.handleL2BlockAndMessages(block, messages);

        expect(status.unfinalisedBlockNumber).toBe(blockNumber);
        expect(status.oldestHistoricalBlock).toBe(1);

        if (provenBlock > 0) {
          const provenStatus = await ws.setFinalised(BigInt(provenBlock));
          expect(provenStatus.unfinalisedBlockNumber).toBe(blockNumber);
          expect(provenStatus.finalisedBlockNumber).toBe(provenBlock);
          expect(provenStatus.oldestHistoricalBlock).toBe(1);
        } else {
          expect(status.finalisedBlockNumber).toBe(0);
        }
      }
    }, 30_000);

    it('Can finalise multiple blocks', async () => {
      const fork = await ws.fork();

      for (let i = 0; i < 16; i++) {
        const blockNumber = i + 1;
        const { block, messages } = await mockBlock(blockNumber, 1, fork);
        const status = await ws.handleL2BlockAndMessages(block, messages);

        expect(status.unfinalisedBlockNumber).toBe(blockNumber);
        expect(status.oldestHistoricalBlock).toBe(1);
        expect(status.finalisedBlockNumber).toBe(0);
      }

      const status = await ws.setFinalised(8n);
      expect(status.unfinalisedBlockNumber).toBe(16);
      expect(status.oldestHistoricalBlock).toBe(1);
      expect(status.finalisedBlockNumber).toBe(8);
    }, 30_000);

    it('Can prune historic blocks', async () => {
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

        expect(status.unfinalisedBlockNumber).toBe(blockNumber);

        const blockFork = await ws.fork();
        forks.push(blockFork);

        if (provenBlock > 0) {
          const provenStatus = await ws.setFinalised(BigInt(provenBlock));
          expect(provenStatus.finalisedBlockNumber).toBe(provenBlock);
        } else {
          expect(status.finalisedBlockNumber).toBe(0);
        }

        if (prunedBlockNumber > 0) {
          const prunedStatus = await ws.removeHistoricalBlocks(BigInt(prunedBlockNumber + 1));
          expect(prunedStatus.oldestHistoricalBlock).toBe(prunedBlockNumber + 1);
        } else {
          expect(status.oldestHistoricalBlock).toBe(1);
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
      for (let i = 0; i < highestPrunedBlockNumber; i++) {
        await expect(ws.removeHistoricalBlocks(BigInt(i + 1))).rejects.toThrow(
          'Unable to remove historical block, block not found',
        );
      }
    }, 30_000);

    it('Can re-org', async () => {
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
        const { block, messages } = await mockBlock(blockNumber, 1, fork);
        const status = await ws.handleL2BlockAndMessages(block, messages);
        blockStats.push(status);
        const blockFork = await ws.fork();
        blockForks.push(blockFork);
        const treeInfo = await ws.getCommitted().getTreeInfo(MerkleTreeId.NULLIFIER_TREE);
        blockTreeInfos.push(treeInfo);
        const siblingPath = await ws.getCommitted().getSiblingPath(MerkleTreeId.NULLIFIER_TREE, 0n);
        siblingPaths.push(siblingPath);

        if (blockNumber < 9) {
          await nonReorgState.handleL2BlockAndMessages(block, messages);

          const statusNonReorg = await nonReorgState.handleL2BlockAndMessages(block, messages);
          expect(status).toEqual(statusNonReorg);

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
        expect(unwindStatus).toEqual(blockStats[blockNumber - 2]);
        expect(await unwindFork.getTreeInfo(MerkleTreeId.NULLIFIER_TREE)).toEqual(
          await blockForks[blockNumber - 2].getTreeInfo(MerkleTreeId.NULLIFIER_TREE),
        );
        expect(unwindSiblingPath).toEqual(siblingPaths[blockNumber - 2]);
      }

      // unwind the other 16 block chain by a full 8 blocks in one go
      await ws.unwindBlocks(8n);

      // check that it is not possible to re-org blocks that were already reorged.
      await expect(ws.unwindBlocks(10n)).rejects.toThrow('Unable to unwind block, block not found');

      await compareChains(ws.getCommitted(), sequentialReorgState.getCommitted());

      const unwoundFork = await ws.fork();
      const unwoundTreeInfo = await ws.getCommitted().getTreeInfo(MerkleTreeId.NULLIFIER_TREE);
      const unwoundStatus = await ws.getStatus();
      const unwoundSiblingPath = await ws.getCommitted().getSiblingPath(MerkleTreeId.NULLIFIER_TREE, 0n);

      expect(unwoundStatus).toEqual(blockStats[7]);
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
        expect(status).toEqual(statusNonReorg);
      }

      // compare snapshot across the chains
      for (let i = 0; i < 16; i++) {
        const blockNumber = i + 1;
        const nonReorgSnapshot = nonReorgState.getSnapshot(blockNumber);
        const reorgSnaphsot = ws.getSnapshot(blockNumber);
        await compareChains(reorgSnaphsot, nonReorgSnapshot);
      }

      await compareChains(ws.getCommitted(), nonReorgState.getCommitted());
    }, 30_000);

    it('Forks are deleted during a re-org', async () => {
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
    }, 30_000);
  });
});
