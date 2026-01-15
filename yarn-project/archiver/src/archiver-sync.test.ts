import type { BlobClientInterface } from '@aztec/blob-client/client';
import { makeRandomBlob } from '@aztec/blob-lib/testing';
import { GENESIS_ARCHIVE_ROOT } from '@aztec/constants';
import type { EpochCache, EpochCommitteeInfo } from '@aztec/epoch-cache';
import { DefaultL1ContractsConfig } from '@aztec/ethereum/config';
import { BlockTagTooOldError, type InboxContract, type RollupContract } from '@aztec/ethereum/contracts';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { sum, times } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { TestDateProvider } from '@aztec/foundation/timer';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { L2BlockSourceEvents } from '@aztec/stdlib/block';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { computeInHashFromL1ToL2Messages } from '@aztec/stdlib/messaging';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { jest } from '@jest/globals';
import assert from 'assert';
import { EventEmitter } from 'events';
import { type MockProxy, mock } from 'jest-mock-extended';
import type { GetBlockReturnType } from 'viem';

import { Archiver, type ArchiverEmitter } from './archiver.js';
import type { ArchiverInstrumentation } from './modules/instrumentation.js';
import { ArchiverL1Synchronizer } from './modules/l1_synchronizer.js';
import { KVArchiverDataStore } from './store/kv_archiver_store.js';
import { FakeL1State, type FakeL1StateConfig } from './test/fake_l1_state.js';

describe('Archiver Sync', () => {
  const rollupAddress = EthAddress.random();
  const inboxAddress = EthAddress.random();
  const registryAddress = EthAddress.random();
  const governanceProposerAddress = EthAddress.random();
  const slashFactoryAddress = EthAddress.random();
  const slashingProposerAddress = EthAddress.random();

  let fake: FakeL1State;
  let publicClient: MockProxy<ViemPublicClient>;
  let blobClient: MockProxy<BlobClientInterface>;
  let epochCache: MockProxy<EpochCache>;
  let rollupContract: MockProxy<RollupContract>;
  let inboxContract: MockProxy<InboxContract>;
  let instrumentation: MockProxy<ArchiverInstrumentation>;
  let dateProvider: TestDateProvider;
  let archiverStore: KVArchiverDataStore;
  let l1Constants: L1RollupConstants & { l1StartBlockHash: Buffer32; genesisArchiveRoot: Fr };
  let archiver: Archiver;
  let synchronizer: ArchiverL1Synchronizer;
  let logger: Logger;
  let syncLogger: Logger;
  let now: number;

  const GENESIS_ROOT = new Fr(GENESIS_ARCHIVE_ROOT);
  const ETHEREUM_SLOT_DURATION = BigInt(DefaultL1ContractsConfig.ethereumSlotDuration);

  beforeEach(async () => {
    logger = createLogger('archiver:sync:test');
    syncLogger = createLogger('archiver:l1-sync:test');
    now = Math.floor(Date.now() / 1000);
    dateProvider = new TestDateProvider();

    // Create fake L1 state
    const fakeConfig: FakeL1StateConfig = {
      genesisArchiveRoot: GENESIS_ROOT,
      l1StartBlock: 0n,
      l1GenesisTime: BigInt(now),
      ethereumSlotDuration: Number(ETHEREUM_SLOT_DURATION),
      rollupAddress,
      inboxAddress,
    };
    fake = new FakeL1State(fakeConfig);

    // Create mock clients from the fake
    publicClient = fake.createMockPublicClient();
    blobClient = fake.createMockBlobClient();

    // Create epoch cache mock (separate from fake)
    epochCache = mock<EpochCache>();
    epochCache.getCommitteeForEpoch.mockResolvedValue({ committee: [] as EthAddress[] } as EpochCommitteeInfo);

    // Create instrumentation mock
    const tracer = getTelemetryClient().getTracer('');
    instrumentation = mock<ArchiverInstrumentation>({ isEnabled: () => true, tracer });

    // Create archiver store
    archiverStore = new KVArchiverDataStore(await openTmpStore('archiver_sync_test'), 1000);

    // L1 constants
    l1Constants = {
      l1GenesisTime: BigInt(now),
      l1StartBlock: 0n,
      l1StartBlockHash: Buffer32.random(),
      epochDuration: 4,
      slotDuration: 24,
      ethereumSlotDuration: 12,
      proofSubmissionEpochs: 1,
      genesisArchiveRoot: GENESIS_ROOT,
    };

    const contractAddresses = {
      registryAddress,
      governanceProposerAddress,
      slashFactoryAddress,
      slashingProposerAddress,
    };

    // Create mock contracts from the fake
    rollupContract = fake.createMockRollupContract(publicClient);
    inboxContract = fake.createMockInboxContract(publicClient);

    const config = {
      pollingIntervalMs: 1000,
      batchSize: 1000,
      maxAllowedEthClientDriftSeconds: 300,
      ethereumAllowNoDebugHosts: true,
    };

    // Create event emitter shared by archiver and synchronizer
    const events = new EventEmitter() as ArchiverEmitter;

    // Create the L1 synchronizer
    synchronizer = new ArchiverL1Synchronizer(
      publicClient,
      publicClient,
      rollupContract,
      inboxContract,
      contractAddresses,
      archiverStore,
      config,
      blobClient,
      epochCache,
      dateProvider,
      instrumentation,
      l1Constants,
      events,
      instrumentation.tracer,
      syncLogger,
    );

    archiver = new Archiver(
      publicClient,
      publicClient,
      rollupContract,
      contractAddresses,
      archiverStore,
      config,
      blobClient,
      instrumentation,
      l1Constants,
      synchronizer,
      events,
    );
  });

  afterEach(async () => {
    await archiver?.stop();
  });

  describe('basic sync', () => {
    it('syncs l1 to l2 messages and checkpoints', async () => {
      expect(await archiver.getSynchedCheckpointNumber()).toEqual(CheckpointNumber(0));

      // Add first checkpoint (creates messages automatically, L1 block 98 for messages, 101 for checkpoint)
      const { checkpoint: cp1, messages: msgs1 } = await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 101n,
        messagesL1BlockNumber: 98n,
        numL1ToL2Messages: 3,
      });

      // Add second checkpoint (creates messages automatically, L1 block 2504 for messages, 2507 for checkpoint)
      const { checkpoint: cp2, messages: msgs2 } = await fake.addCheckpoint(CheckpointNumber(2), {
        l1BlockNumber: 2507n,
        messagesL1BlockNumber: 2504n,
        numL1ToL2Messages: 3,
      });

      // Add third checkpoint (creates messages automatically, L1 block 2511 for messages, 2515 for checkpoint)
      const { checkpoint: cp3, messages: msgs3 } = await fake.addCheckpoint(CheckpointNumber(3), {
        l1BlockNumber: 2515n,
        messagesL1BlockNumber: 2511n,
        numL1ToL2Messages: 3,
      });

      // First sync: only checkpoint 1 visible (L1 block 2500)
      fake.setL1BlockNumber(2500n);
      expect(fake.getRollupStatus().pendingCheckpointNumber).toEqual(CheckpointNumber(1));

      logger.warn('Expecting checkpoint 1');
      await archiver.syncImmediate();
      expect(await archiver.getSynchedCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Verify messages for checkpoint 1
      expect(await archiver.getL1ToL2Messages(CheckpointNumber(1))).toEqual(msgs1);

      // Mark checkpoint 1 as proven
      fake.markCheckpointAsProven(CheckpointNumber(1));

      // Second sync: checkpoints 2 and 3 visible (L1 block 2520)
      fake.setL1BlockNumber(2520n);
      expect(fake.getRollupStatus().pendingCheckpointNumber).toEqual(CheckpointNumber(3));

      logger.warn('Expecting checkpoint 3');
      await archiver.syncImmediate();
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(3));

      // Verify messages for all checkpoints
      expect(await archiver.getL1ToL2Messages(CheckpointNumber(1))).toEqual(msgs1);
      expect(await archiver.getL1ToL2Messages(CheckpointNumber(2))).toEqual(msgs2);
      expect(await archiver.getL1ToL2Messages(CheckpointNumber(3))).toEqual(msgs3);

      // Verify logs for each block in the checkpoints
      for (const checkpoint of [cp1, cp2, cp3]) {
        for (const block of checkpoint.blocks) {
          const blockNumber = block.number;
          const expectedTotalNumLogs = (name: 'private' | 'public' | 'contractClass') =>
            sum(block.body.txEffects.map(txEffect => txEffect[`${name}Logs`].length));

          const privateLogs = (await archiver.getBlock(blockNumber))!.toL2Block().getPrivateLogs();
          expect(privateLogs.length).toBe(expectedTotalNumLogs('private'));

          const publicLogs = (await archiver.getPublicLogs({ fromBlock: blockNumber, toBlock: blockNumber + 1 })).logs;
          expect(publicLogs.length).toBe(expectedTotalNumLogs('public'));

          const contractClassLogs = await archiver.getContractClassLogs({
            fromBlock: blockNumber,
            toBlock: blockNumber + 1,
          });
          expect(contractClassLogs.logs.length).toBe(expectedTotalNumLogs('contractClass'));
        }
      }

      // Check proven checkpoint number
      expect(await archiver.getProvenCheckpointNumber()).toBe(CheckpointNumber(1));

      // Get published checkpoints
      expect((await archiver.getPublishedCheckpoints(CheckpointNumber(1), 100)).map(b => b.checkpoint.number)).toEqual([
        1, 2, 3,
      ]);
    }, 30_000);

    it('ignores checkpoint 3 because it has been pruned', async () => {
      const loggerSpy = jest.spyOn(syncLogger, 'warn');

      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

      // Add three checkpoints
      await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 70n,
        messagesL1BlockNumber: 50n,
        numL1ToL2Messages: 3,
      });

      const { checkpoint: cp2 } = await fake.addCheckpoint(CheckpointNumber(2), {
        l1BlockNumber: 80n,
        messagesL1BlockNumber: 60n,
        numL1ToL2Messages: 3,
      });

      const { checkpoint: cp3 } = await fake.addCheckpoint(CheckpointNumber(3), {
        l1BlockNumber: 90n,
        messagesL1BlockNumber: 66n,
        numL1ToL2Messages: 3,
      });

      // Mark checkpoint 3 as pruned - the event will still exist but archiveAt(3)
      // will return checkpoint 2's archive, causing a mismatch
      fake.markCheckpointAsPruned(CheckpointNumber(3));

      // Set L1 block to see all checkpoints
      fake.setL1BlockNumber(102n);

      // Sync - should process checkpoints 1 and 2 but ignore 3
      await archiver.syncImmediate();

      // Should only have synced up to checkpoint 2
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(2));

      // Should have logged a warning about archive root mismatch
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringMatching(/archive root mismatch/i),
        expect.objectContaining({
          actual: cp3.archive.root.toString(),
          expected: cp2.archive.root.toString(),
        }),
      );
    });

    it('stop processing if one of the checkpoints has a mismatch inHash', async () => {
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

      // Add checkpoint 1 and 2 with all messages visible
      await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 70n,
        messagesL1BlockNumber: 50n,
        numL1ToL2Messages: 3,
      });

      await fake.addCheckpoint(CheckpointNumber(2), {
        l1BlockNumber: 80n,
        messagesL1BlockNumber: 60n,
        numL1ToL2Messages: 3,
      });

      // Add checkpoint 3 with 3 messages at L1 block 100n
      const { checkpoint: cp3, messages: msgs3 } = await fake.addCheckpoint(CheckpointNumber(3), {
        l1BlockNumber: 90n,
        messagesL1BlockNumber: 100n,
        numL1ToL2Messages: 3,
      });

      // Move last 2 messages of checkpoint 3 to L1 block 103n (beyond current L1 block)
      // This simulates partial message visibility
      const totalMessages = 3 + 3 + 3; // 9 messages total
      fake.moveMessageAtIndexToL1Block(totalMessages - 1, 103n); // Move last message
      fake.moveMessageAtIndexToL1Block(totalMessages - 2, 103n); // Move second to last

      // Set current L1 block to 102n - only 1 message from checkpoint 3 will be visible
      fake.setL1BlockNumber(102n);

      // The archiver will compute inHash from only the first message,
      // which won't match the checkpoint's inHash (computed from all 3 messages)
      const visibleMessages = msgs3.slice(0, 1);
      const computedInHash = computeInHashFromL1ToL2Messages(visibleMessages);

      // Run archiver (expect failure)
      await expect(() => archiver.syncImmediate()).rejects.toThrow(
        new RegExp(`mismatch inHash for checkpoint 3.*${computedInHash}.*${cp3.header.inHash}`, 'i'),
      );

      // Should still be at checkpoint 0 since the error prevents checkpoint processing
      // (checkpoints 1 and 2 also fail because they're in the same batch)
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));
    }, 10_000);

    it('skip event search if no changes found', async () => {
      const loggerSpy = jest.spyOn(syncLogger, 'debug');

      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

      // First sync with no checkpoints on chain
      fake.setL1BlockNumber(50n);
      await archiver.syncImmediate();

      // Should log that there are no checkpoints to retrieve
      expect(loggerSpy).toHaveBeenCalledWith(`No checkpoints to retrieve from 1 to 50, no checkpoints on chain`);

      // Add checkpoints at L1 blocks 70 and 80
      await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 70n,
        messagesL1BlockNumber: 60n,
        numL1ToL2Messages: 3,
      });

      await fake.addCheckpoint(CheckpointNumber(2), {
        l1BlockNumber: 80n,
        messagesL1BlockNumber: 66n,
        numL1ToL2Messages: 3,
      });

      // Advance L1 block so checkpoints are visible
      fake.setL1BlockNumber(100n);
      await archiver.syncImmediate();

      // Should now have synced up to checkpoint 2
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(2));
    });

    it('stop processing checkpoint if blob fields are not encoded correctly', async () => {
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

      // Add a checkpoint
      await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 70n,
        messagesL1BlockNumber: 60n,
        numL1ToL2Messages: 3,
      });

      // Create a random blob that doesn't match the checkpoint
      const randomBlob = makeRandomBlob(3);

      // Override blob client to return the random blob instead of the correct one
      blobClient.getBlobSidecar.mockResolvedValue([randomBlob]);

      // Set L1 block to see the checkpoint
      fake.setL1BlockNumber(100n);

      // Start archiver
      await expect(() => archiver.syncImmediate()).rejects.toThrow(/incorrect encoding of blob fields/i);

      // Should still be at checkpoint 0 since the blob processing failed
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));
    }, 10_000);

    it('can process checkpoint containing multiple blobs', async () => {
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

      // Create a checkpoint with large blob data that requires multiple blobs
      // Using txsPerBlock: 10 and maxEffects: 200 to generate enough data for multiple blobs
      const { checkpoint } = await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 70n,
        messagesL1BlockNumber: 60n,
        numBlocks: 1,
        txsPerBlock: 10,
        maxEffects: 200,
        numL1ToL2Messages: 3,
      });

      // Verify we got multiple blobs (the test is meaningful only if we have >1 blob)
      const blobs = fake.getCheckpointBlobs(CheckpointNumber(1));
      expect(blobs.length).toBeGreaterThan(1);
      logger.info(`Created checkpoint with ${blobs.length} blobs`);

      // Set L1 block to see the checkpoint
      fake.setL1BlockNumber(100n);

      await archiver.syncImmediate();

      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Verify the checkpoint was synced successfully
      const syncedCheckpoints = await archiver.getPublishedCheckpoints(CheckpointNumber(1), 1);
      expect(syncedCheckpoints).toBeDefined();
      expect(syncedCheckpoints.length).toBeGreaterThan(0);
      expect(syncedCheckpoints[0]).toBeDefined();
      expect(syncedCheckpoints[0].checkpoint.blocks.length).toBe(1);

      // The tx effects should be decoded correctly from the blobs
      expect(syncedCheckpoints[0].checkpoint.blocks.map(b => b.body.txEffects)).toEqual(
        checkpoint.blocks.map(b => b.body.txEffects),
      );
    }, 15_000);

    it('does not sync if L1 did not advance', async () => {
      // Initial sync
      fake.setL1BlockNumber(100n);
      logger.warn('Initial sync');
      await archiver.syncImmediate();

      expect(inboxContract.getState).toHaveBeenCalledTimes(1);
      expect(rollupContract.status).toHaveBeenCalledTimes(1);
      inboxContract.getState.mockClear();
      rollupContract.status.mockClear();

      // We sync again, but since chain didn't move, no new calls should be expected
      logger.warn('Sync with no L1 advancement');
      await archiver.syncImmediate();
      expect(inboxContract.getState).toHaveBeenCalledTimes(0);
      expect(rollupContract.status).toHaveBeenCalledTimes(0);

      // Advance the chain and we should see calls again
      fake.setL1BlockNumber(150n);
      logger.warn('Sync after L1 advancement');
      await archiver.syncImmediate();
      expect(inboxContract.getState).toHaveBeenCalledTimes(1);
      expect(rollupContract.status).toHaveBeenCalledTimes(1);
    });
  });

  describe('epoch completion', () => {
    it('reports an epoch as pending if the current checkpoint is not in the last slot of the epoch', async () => {
      // L1 constants from setup: epochDuration=4, slotDuration=24, ethereumSlotDuration=12
      // L1 blocks per L2 slot = 24/12 = 2
      // Last slot in epoch 0 is slot 3 (0, 1, 2, 3)
      // L1 block for slot 2 = l1StartBlock + (2 * 24 / 12) = 0 + 4 = 4
      const notLastSlotInEpoch = SlotNumber(2);
      const l1BlockForSlot2 = 4n;

      // Add checkpoint in slot 2 (not the last slot of epoch 0)
      await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: l1BlockForSlot2,
        messagesL1BlockNumber: 1n,
        numL1ToL2Messages: 3,
        slotNumber: notLastSlotInEpoch,
      });

      // Set L1 block to where checkpoint is mined (within epoch, not at end)
      fake.setL1BlockNumber(l1BlockForSlot2);
      await archiver.syncImmediate();

      // Checkpoint 1 should be synced
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Epoch 0 should not be complete (checkpoint is in slot 2, not slot 3)
      expect(await archiver.isEpochComplete(EpochNumber(0))).toBe(false);
    });

    it('reports an epoch as complete if the current checkpoint is in the last slot of the epoch', async () => {
      // Last slot in epoch 0 is slot 3
      // L1 block for slot 3 = l1StartBlock + (3 * 24 / 12) = 0 + 6 = 6
      const lastSlotInEpoch = SlotNumber(3);
      const l1BlockForSlot3 = 6n;

      // Add checkpoint in slot 3 (the last slot of epoch 0)
      await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: l1BlockForSlot3,
        messagesL1BlockNumber: 1n,
        numL1ToL2Messages: 3,
        slotNumber: lastSlotInEpoch,
      });

      fake.setL1BlockNumber(l1BlockForSlot3);
      await archiver.syncImmediate();

      // Checkpoint 1 should be synced
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Epoch 0 should be complete (checkpoint is in last slot)
      expect(await archiver.isEpochComplete(EpochNumber(0))).toBe(true);
    });

    it('reports an epoch as pending if the current L1 block is not the last one on the epoch and no checkpoint landed', async () => {
      // L1 blocks per epoch = epochDuration * slotDuration / ethereumSlotDuration = 4 * 24 / 12 = 8
      // Last L1 block for epoch 0 is l1StartBlock + 7 = 7 (since l1StartBlock=0)
      const notLastL1Block = 6n;

      fake.setL1BlockNumber(notLastL1Block);
      await archiver.syncImmediate();

      // No checkpoints synced
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

      // Epoch should not be complete
      expect(await archiver.isEpochComplete(EpochNumber(0))).toBe(false);
    });

    it('reports an epoch as complete if the current L1 block is the last one on the epoch and no L2 block landed', async () => {
      // Last L1 block for epoch 0 is l1StartBlock + 7 = 7
      const lastL1BlockForEpoch = 7n;

      fake.setL1BlockNumber(lastL1BlockForEpoch);
      await archiver.syncImmediate();

      // No checkpoints synced
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

      // Epoch should be complete due to timestamp
      expect(await archiver.isEpochComplete(EpochNumber(0))).toBe(true);
    });

    // Regression for https://github.com/AztecProtocol/aztec-packages/issues/12631
    it('reports an epoch complete due to timestamp only once all its checkpoints have been synced', async () => {
      // L1 constants from setup: epochDuration=4, slotDuration=24, ethereumSlotDuration=12
      // Checkpoint on slot 1 (not the last slot of epoch 0)
      // L1 block for slot 1 = l1StartBlock + (1 * 24 / 12) = 0 + 2 = 2
      // Last L1 block for epoch 0 = l1StartBlock + (4 * 24 / 12) - 1 = 7
      const slotForCheckpoint = SlotNumber(1);
      const l1BlockForCheckpoint = 2n;
      const lastL1BlockForEpoch = 7n;

      // Add checkpoint in slot 1 (not the last slot of epoch 0)
      await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: l1BlockForCheckpoint,
        messagesL1BlockNumber: 1n,
        numL1ToL2Messages: 3,
        slotNumber: slotForCheckpoint,
      });

      // Set L1 block to last block of epoch 0
      fake.setL1BlockNumber(lastL1BlockForEpoch);

      // Before syncing, epoch should not be complete (no checkpoints synced yet)
      // Start archiver (async)
      await archiver.start(false);

      // Initially epoch is not complete because we haven't synced the checkpoint yet
      expect(await archiver.isEpochComplete(EpochNumber(0))).toBe(false);

      // Wait until epoch becomes complete
      while (!(await archiver.isEpochComplete(EpochNumber(0)))) {
        // Spin-wait - archiver is syncing in background
      }

      // Once epoch is flagged as complete, checkpoint number must be 1
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));
      expect(await archiver.isEpochComplete(EpochNumber(0))).toBe(true);
    });
  });

  describe('L1 sync handling', () => {
    it('throws if ethereum node is not synced at startup', async () => {
      const maxAllowedDelay = 300; // maxAllowedEthClientDriftSeconds from config
      const currentTime = BigInt(dateProvider.nowInSeconds());
      const oldBlockTimestamp = currentTime - BigInt(maxAllowedDelay + 100); // Block is too old

      // Mock getBlock to return a block with an old timestamp
      publicClient.getBlock.mockResolvedValueOnce({
        number: 1000n,
        timestamp: oldBlockTimestamp,
        hash: Buffer32.random().toString(),
      } as GetBlockReturnType);

      await expect(archiver.start(false)).rejects.toThrow(/Ethereum node is out of sync/);
    });

    it('initial sync does not complete until archiver catches up with latest L1 block', async () => {
      // Add a checkpoint
      await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 70n,
        messagesL1BlockNumber: 60n,
        numL1ToL2Messages: 3,
      });
      fake.setL1BlockNumber(100n);

      // We track how many times getBlockNumber is called to simulate L1 advancing *during* sync
      publicClient.getBlockNumber.mockClear().mockResolvedValueOnce(100n).mockResolvedValue(103n);

      // Sync first checkpoint
      await archiver.syncImmediate();
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Initial sync should not be complete yet because L1 advanced during sync
      // The check is: currentL1BlockNumber + 1n >= getBlockNumber()
      // We synced up to 100, but latest is 103, so 100 + 1 >= 103 is false
      expect(archiver.isInitialSyncComplete()).toBe(false);

      await archiver.syncImmediate();

      // Now initial sync should be complete (103 + 1 >= 103)
      await retryUntil(() => Promise.resolve(archiver.isInitialSyncComplete()), 'initial sync complete', 10, 0.1);
      expect(archiver.isInitialSyncComplete()).toBe(true);
    });

    it('starts new loop if latest L1 block has advanced beyond what a non-archive L1 node tracks', async () => {
      await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 2000n,
        numL1ToL2Messages: 0,
      });
      fake.setL1BlockNumber(2002n);

      // L1 blocks will jump _fast_ during this archiver sync
      const err = new BlockTagTooOldError(2002n, 2400n);
      rollupContract.status.mockRejectedValueOnce(err);
      publicClient.getBlockNumber.mockClear().mockResolvedValueOnce(2002n).mockResolvedValue(2400n);

      // So we fail in the first attempt
      await expect(() => archiver.syncImmediate()).rejects.toThrow(err);
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

      // In the second sync we should be good
      await archiver.syncImmediate();
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));
    });
  });

  describe('attestation validation', () => {
    it('ignores checkpoints because of invalid attestations', async () => {
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

      // Setup a committee of 3 signers
      fake.setTargetCommitteeSize(3);
      const signers = times(3, Secp256k1Signer.random);
      const committee = signers.map(signer => signer.address);
      epochCache.getCommitteeForEpoch.mockResolvedValue({ committee } as EpochCommitteeInfo);

      // Setup spy to listen for InvalidCheckpointDetected events
      const invalidCheckpointDetectedSpy = jest.fn();
      archiver.events.on(L2BlockSourceEvents.InvalidAttestationsCheckpointDetected, invalidCheckpointDetectedSpy);

      // Add valid checkpoint 1 with correct attestations
      const { checkpoint: cp1 } = await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 70n,
        messagesL1BlockNumber: 50n,
        numL1ToL2Messages: 3,
        signers: signers,
      });

      // Add checkpoint 2 with BAD attestations (random signers not in committee)
      // Use numL1ToL2Messages: 0 for bad checkpoints - they'll fail attestation validation before inHash check
      const badSigners2 = times(3, Secp256k1Signer.random);
      const { checkpoint: _badCp2 } = await fake.addCheckpoint(CheckpointNumber(2), {
        l1BlockNumber: 80n,
        numL1ToL2Messages: 0,
        signers: badSigners2,
      });

      // Save checkpoint 1's archive for chaining future checkpoints
      const cp1Archive = cp1.blocks[cp1.blocks.length - 1].archive;

      // Set L1 block to see both checkpoints
      fake.setL1BlockNumber(82n);

      // First sync: CP1 valid, bad CP2 detected → InvalidCheckpointDetected event
      logger.warn('First sync: expecting CP1, invalid CP2 detected');
      await archiver.syncImmediate();
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));
      expect(await archiver.getPendingChainValidationStatus()).toEqual(
        expect.objectContaining({
          valid: false,
          reason: 'invalid-attestation',
          invalidIndex: 0,
          committee,
        }),
      );

      // Check that InvalidCheckpointDetected event was emitted for the bad checkpoint
      expect(invalidCheckpointDetectedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: L2BlockSourceEvents.InvalidAttestationsCheckpointDetected,
          validationResult: expect.objectContaining({
            valid: false,
            reason: 'invalid-attestation',
            invalidIndex: 0,
            checkpoint: expect.objectContaining({ checkpointNumber: 2 }),
          }),
        }),
      );

      // Remove bad CP2 and add a different bad CP2 with different random signers
      // Use numL1ToL2Messages: 0 to avoid rolling hash conflicts (messages already added)
      logger.warn('Second sync: replacing bad CP2 with another bad CP2b');
      fake.removeCheckpoint(CheckpointNumber(2));
      const badSigners2b = times(3, Secp256k1Signer.random);
      const { checkpoint: badCp2b } = await fake.addCheckpoint(CheckpointNumber(2), {
        l1BlockNumber: 85n,
        numL1ToL2Messages: 0, // No messages to avoid rolling hash conflicts
        signers: badSigners2b,
        previousArchive: cp1Archive,
      });

      fake.setL1BlockNumber(87n);
      await archiver.syncImmediate();
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Validation status should point to new bad CP2b
      let validationStatus = await archiver.getPendingChainValidationStatus();
      assert(!validationStatus.valid);
      expect(validationStatus.checkpoint.checkpointNumber).toEqual(2);
      expect(validationStatus.checkpoint.archive.toString()).toEqual(badCp2b.archive.root.toString());

      // Add bad checkpoint 3 (chained from bad CP2b)
      // Use numL1ToL2Messages: 0 for bad checkpoints
      logger.warn('Third sync: adding bad CP3');
      const badSigners3 = times(3, Secp256k1Signer.random);
      const { checkpoint: _badCp3 } = await fake.addCheckpoint(CheckpointNumber(3), {
        l1BlockNumber: 88n,
        numL1ToL2Messages: 0, // No messages for bad checkpoint
        signers: badSigners3,
      });

      fake.setL1BlockNumber(90n);
      await archiver.syncImmediate();
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Validation status should still point to CP2b (earliest invalid)
      validationStatus = await archiver.getPendingChainValidationStatus();
      assert(!validationStatus.valid);
      expect(validationStatus.checkpoint.checkpointNumber).toEqual(2);
      expect(validationStatus.checkpoint.archive.toString()).toEqual(badCp2b.archive.root.toString());

      // Check that event was also emitted for bad CP3
      expect(invalidCheckpointDetectedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: L2BlockSourceEvents.InvalidAttestationsCheckpointDetected,
          validationResult: expect.objectContaining({
            valid: false,
            reason: 'invalid-attestation',
            checkpoint: expect.objectContaining({ checkpointNumber: 3 }),
          }),
        }),
      );

      // Should have been called 3 times: bad CP2, bad CP2b, bad CP3
      expect(invalidCheckpointDetectedSpy).toHaveBeenCalledTimes(3);

      // Now recover: remove bad checkpoints and add good CP2 and CP3 with valid attestations
      // Good checkpoints have messages that the archiver will validate
      logger.warn('Fourth sync: adding good CP2 and CP3 with correct attestations');
      fake.removeCheckpoint(CheckpointNumber(2));
      fake.removeCheckpoint(CheckpointNumber(3));

      const { checkpoint: goodCp2 } = await fake.addCheckpoint(CheckpointNumber(2), {
        l1BlockNumber: 94n,
        messagesL1BlockNumber: 55n,
        numL1ToL2Messages: 3,
        signers: signers,
        previousArchive: cp1Archive,
      });

      const { checkpoint: _goodCp3 } = await fake.addCheckpoint(CheckpointNumber(3), {
        l1BlockNumber: 95n,
        messagesL1BlockNumber: 58n,
        numL1ToL2Messages: 3,
        signers: signers,
      });

      fake.setL1BlockNumber(100n);
      await archiver.syncImmediate();

      // Now we should be at checkpoint 3
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(3));

      // And checkpoint 2 should return the proper one
      const [checkpoint2] = await archiver.getPublishedCheckpoints(CheckpointNumber(2), 1);
      expect(checkpoint2.checkpoint.number).toEqual(2);
      expect(checkpoint2.checkpoint.archive.root.toString()).toEqual(goodCp2.archive.root.toString());
      expect(checkpoint2.attestations.length).toEqual(3);

      // With a valid pending chain validation status
      expect(await archiver.getPendingChainValidationStatus()).toEqual(expect.objectContaining({ valid: true }));
    }, 15_000);
  });

  describe('reorg handling', () => {
    it('handles L2 reorg', async () => {
      const loggerSpy = jest.spyOn(syncLogger, 'debug');

      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

      // Add checkpoints 1 and 2
      const { checkpoint: cp1 } = await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 70n,
        messagesL1BlockNumber: 50n,
        numL1ToL2Messages: 3,
      });

      const { checkpoint: cp2 } = await fake.addCheckpoint(CheckpointNumber(2), {
        l1BlockNumber: 80n,
        messagesL1BlockNumber: 60n,
        numL1ToL2Messages: 3,
      });

      // First sync with no checkpoints visible
      fake.setL1BlockNumber(50n);
      logger.warn('Initial sync with no checkpoints to retrieve');
      await archiver.syncImmediate();
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining(`No checkpoints to retrieve from 1 to 50`));
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

      // Second sync: checkpoints 1 and 2 visible
      fake.setL1BlockNumber(90n);
      logger.warn('Expecting sync to checkpoint 2');
      await archiver.syncImmediate();
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(2));

      // Verify L2Tips after syncing checkpoint 2
      const lastBlockInCheckpoint2 = cp2.blocks[cp2.blocks.length - 1].number;
      const tipsAtCheckpoint2 = await archiver.getL2Tips();
      expect(tipsAtCheckpoint2.proposed.number).toEqual(lastBlockInCheckpoint2);
      expect(tipsAtCheckpoint2.checkpointed.block.number).toEqual(lastBlockInCheckpoint2);
      expect(tipsAtCheckpoint2.checkpointed.checkpoint.number).toEqual(CheckpointNumber(2));

      // Simulate L2 prune: mark checkpoint 2 as pruned
      // archiveAt(2) will now return checkpoint 1's archive, causing mismatch
      logger.warn('Expecting prune back to checkpoint 1');
      fake.markCheckpointAsPruned(CheckpointNumber(2));
      fake.setL1BlockNumber(95n);
      await archiver.syncImmediate();

      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining(`L2 prune has been detected`), expect.anything());
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Verify L2Tips after pruning back to checkpoint 1
      const lastBlockInCheckpoint1 = cp1.blocks[cp1.blocks.length - 1].number;
      const tipsAfterPrune = await archiver.getL2Tips();
      expect(tipsAfterPrune.proposed.number).toEqual(lastBlockInCheckpoint1);
      expect(tipsAfterPrune.checkpointed.block.number).toEqual(lastBlockInCheckpoint1);
      expect(tipsAfterPrune.checkpointed.checkpoint.number).toEqual(CheckpointNumber(1));

      // Verify data from checkpoint 2 is removed
      const txHash = cp2.blocks[0].body.txEffects[0].txHash;
      expect(await archiver.getTxEffect(txHash)).resolves.toBeUndefined;
      expect(await archiver.getPublishedCheckpoints(CheckpointNumber(2), 1)).toEqual([]);

      expect((await archiver.getPublicLogs({ fromBlock: 2, toBlock: 3 })).logs).toEqual([]);
      expect((await archiver.getContractClassLogs({ fromBlock: 2, toBlock: 3 })).logs).toEqual([]);
    }, 10_000);

    it('handles updated messages due to L1 reorg', async () => {
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

      // Add messages for checkpoint 1 (2 messages at L1 block 100)
      const msgs1 = [Fr.random(), Fr.random()];
      fake.addMessages(CheckpointNumber(1), 100n, msgs1);

      // Add messages for checkpoint 3 (4 messages at L1 block 101)
      // Note: skipping checkpoint 2
      const msgs3 = [Fr.random(), Fr.random(), Fr.random(), Fr.random()];
      fake.addMessages(CheckpointNumber(3), 101n, msgs3);

      // Set L1 block to see all messages
      fake.setL1BlockNumber(110n);

      // Sync
      await archiver.syncImmediate();

      expect(await archiver.getL1ToL2Messages(CheckpointNumber(1))).toHaveLength(2);
      expect(await archiver.getL1ToL2Messages(CheckpointNumber(2))).toHaveLength(0);
      expect(await archiver.getL1ToL2Messages(CheckpointNumber(3))).toHaveLength(4);
      expect(await archiver.getL1ToL2Messages(CheckpointNumber(4))).toHaveLength(0);

      // Simulate L1 reorg: remove last 2 messages from checkpoint 3, add new messages for checkpoints 4 and 5
      logger.warn('Reorging L1 to L2 messages');
      fake.removeMessagesAfter(4); // Keep first 4 messages (2 for CP1, 2 for CP3)

      const msg40 = Fr.random();
      fake.addMessages(CheckpointNumber(4), 101n, [msg40]);

      const msg50 = Fr.random();
      const msg51 = Fr.random();
      fake.addMessages(CheckpointNumber(5), 102n, [msg50, msg51]);

      // Re-sync
      fake.setL1BlockNumber(111n);
      await archiver.syncImmediate();

      expect(await archiver.getL1ToL2Messages(CheckpointNumber(1))).toHaveLength(2);
      expect(await archiver.getL1ToL2Messages(CheckpointNumber(2))).toHaveLength(0);
      expect(await archiver.getL1ToL2Messages(CheckpointNumber(3))).toHaveLength(2); // Reduced from 4 to 2
      expect(await archiver.getL1ToL2Messages(CheckpointNumber(4))).toHaveLength(1);
      expect(await archiver.getL1ToL2Messages(CheckpointNumber(5))).toHaveLength(2);

      expect((await archiver.getL1ToL2Messages(CheckpointNumber(4))).map(leaf => leaf.toString())).toEqual(
        [msg40].map(leaf => leaf.toString()),
      );
      expect((await archiver.getL1ToL2Messages(CheckpointNumber(5))).map(leaf => leaf.toString())).toEqual(
        [msg50, msg51].map(leaf => leaf.toString()),
      );
    });

    // Regression for https://github.com/AztecProtocol/aztec-packages/issues/13604
    it('handles a checkpoint gap due to a spurious L2 prune', async () => {
      expect(await archiver.getBlockNumber()).toEqual(0);

      // Add checkpoints 1 and 2 (no messages to simplify test)
      const { checkpoint: cp1 } = await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 70n,
        numL1ToL2Messages: 0,
      });

      const { checkpoint: _cp2 } = await fake.addCheckpoint(CheckpointNumber(2), {
        l1BlockNumber: 80n,
        numL1ToL2Messages: 0,
      });

      const cp1Archive = cp1.blocks[cp1.blocks.length - 1].archive;

      // Sync to checkpoint 2
      fake.setL1BlockNumber(90n);
      logger.warn('Expecting sync to checkpoint 2');
      await archiver.syncImmediate();
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(2));

      // Spurious prune: RPC "forgets" checkpoint 2
      logger.warn('Spurious prune: removing checkpoint 2');
      fake.removeCheckpoint(CheckpointNumber(2));
      fake.setL1BlockNumber(95n);
      await archiver.syncImmediate();
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Recovery: checkpoint 2 returns + new checkpoint 3 appears
      logger.warn('Recovery: re-adding checkpoint 2 and adding checkpoint 3');
      await fake.addCheckpoint(CheckpointNumber(2), {
        l1BlockNumber: 80n,
        numL1ToL2Messages: 0,
        previousArchive: cp1Archive,
      });

      await fake.addCheckpoint(CheckpointNumber(3), {
        l1BlockNumber: 100n,
        numL1ToL2Messages: 0,
      });

      fake.setL1BlockNumber(105n);

      // First sync throws due to gap (archiver is at CP1, sees CP3 but not CP2 in the batch)
      // The InitialCheckpointNumberNotSequentialError is thrown when trying to process the batch
      logger.warn('Expecting sync to throw InitialCheckpointNumberNotSequentialError');
      await expect(() => archiver.syncImmediate()).rejects.toThrow(/Cannot insert new checkpoint 3/);

      // Second sync succeeds after L1 sync point rollback
      logger.warn('Second sync should recover to checkpoint 3');
      await archiver.syncImmediate();
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(3));
    });

    xit('handles an upcoming L2 prune', () => {});

    xit('does not attempt to download data for a checkpoint that has been pruned', () => {});
  });

  describe('addBlock and L1 sync interaction', () => {
    it('blocks added via addBlock become checkpointed when checkpoint syncs from L1', async () => {
      // First, sync checkpoint 1 from L1 to establish a baseline
      const { checkpoint: cp1 } = await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 70n,
        messagesL1BlockNumber: 60n,
        numL1ToL2Messages: 3,
      });

      fake.setL1BlockNumber(100n);
      await archiver.start(false);
      await retryUntil(
        () => archiver.getSynchedCheckpointNumber().then(n => n === CheckpointNumber(1)),
        'sync',
        10,
        0.1,
      );

      expect(await archiver.getSynchedCheckpointNumber()).toEqual(CheckpointNumber(1));
      const lastBlockInCheckpoint1 = cp1.blocks[cp1.blocks.length - 1].number;

      // Verify L2Tips after syncing checkpoint 1: proposed and checkpointed should both be at checkpoint 1
      const tipsAfterCheckpoint1 = await archiver.getL2Tips();
      expect(tipsAfterCheckpoint1.proposed.number).toEqual(lastBlockInCheckpoint1);
      expect(tipsAfterCheckpoint1.checkpointed.block.number).toEqual(lastBlockInCheckpoint1);
      expect(tipsAfterCheckpoint1.checkpointed.checkpoint.number).toEqual(CheckpointNumber(1));

      // Create checkpoint 2 on L1 at a future block (not yet visible to archiver)
      const { checkpoint: cp2 } = await fake.addCheckpoint(CheckpointNumber(2), {
        l1BlockNumber: 5000n, // Far in the future
        messagesL1BlockNumber: 4990n,
        numL1ToL2Messages: 3,
      });

      // Now add blocks from checkpoint 2 via addBlock (simulating local block production)
      for (const block of cp2.blocks) {
        await archiver.addBlock(block);
      }

      // Verify blocks are retrievable but not yet checkpointed
      const lastBlockInCheckpoint2 = cp2.blocks[cp2.blocks.length - 1].number;
      expect(await archiver.getBlockNumber()).toEqual(lastBlockInCheckpoint2);
      expect(await archiver.getSynchedCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Verify L2Tips after adding blocks: proposed advances but checkpointed stays at checkpoint 1
      const tipsAfterAddBlock = await archiver.getL2Tips();
      expect(tipsAfterAddBlock.proposed.number).toEqual(lastBlockInCheckpoint2);
      expect(tipsAfterAddBlock.checkpointed.block.number).toEqual(lastBlockInCheckpoint1);
      expect(tipsAfterAddBlock.checkpointed.checkpoint.number).toEqual(CheckpointNumber(1));

      // getCheckpointedBlock should return undefined for the new blocks since checkpoint 2 hasn't synced
      const firstNewBlockNumber = BlockNumber(lastBlockInCheckpoint1 + 1);
      const uncheckpointedBlock = await archiver.getCheckpointedBlock(firstNewBlockNumber);
      expect(uncheckpointedBlock).toBeUndefined();

      // But getL2BlockNew should work (it retrieves both checkpointed and uncheckpointed blocks)
      const block = await archiver.getL2BlockNew(firstNewBlockNumber);
      expect(block).toBeDefined();

      // Now advance L1 so checkpoint 2 becomes visible
      fake.setL1BlockNumber(5010n);

      await retryUntil(
        () => archiver.getSynchedCheckpointNumber().then(n => n === CheckpointNumber(2)),
        'sync',
        10,
        0.1,
      );

      // Now the blocks should be checkpointed
      expect(await archiver.getSynchedCheckpointNumber()).toEqual(CheckpointNumber(2));

      // Verify L2Tips after syncing checkpoint 2: proposed and checkpointed should both be at checkpoint 2
      const tipsAfterCheckpoint2 = await archiver.getL2Tips();
      expect(tipsAfterCheckpoint2.proposed.number).toEqual(lastBlockInCheckpoint2);
      expect(tipsAfterCheckpoint2.checkpointed.block.number).toEqual(lastBlockInCheckpoint2);
      expect(tipsAfterCheckpoint2.checkpointed.checkpoint.number).toEqual(CheckpointNumber(2));

      // getCheckpointedBlock should now work for the new blocks
      const checkpointedBlock = await archiver.getCheckpointedBlock(firstNewBlockNumber);
      expect(checkpointedBlock).toBeDefined();
      expect(checkpointedBlock!.checkpointNumber).toEqual(2);
    }, 10_000);

    it('blocks added via checkpoints can not be added via addBlocks', async () => {
      // First, sync checkpoint 1 from L1 to establish a baseline
      const { checkpoint: cp1 } = await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 70n,
        messagesL1BlockNumber: 60n,
        numL1ToL2Messages: 3,
      });

      fake.setL1BlockNumber(100n);
      await archiver.start(false);
      await retryUntil(
        () => archiver.getSynchedCheckpointNumber().then(n => n === CheckpointNumber(1)),
        'sync',
        10,
        0.1,
      );

      expect(await archiver.getSynchedCheckpointNumber()).toEqual(CheckpointNumber(1));
      const blockAlreadySyncedFromCheckpoint = cp1.blocks[cp1.blocks.length - 1];

      // Now try and add one of the blocks via the addBlocks method. It should throw
      await expect(archiver.addBlock(blockAlreadySyncedFromCheckpoint)).rejects.toThrow();
    }, 10_000);

    it('can add more blocks after checkpoint syncs and then sync another checkpoint', async () => {
      // Sync the first checkpoint normally
      const { checkpoint: cp1 } = await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 70n,
        messagesL1BlockNumber: 60n,
        numL1ToL2Messages: 3,
      });

      fake.setL1BlockNumber(100n);
      await archiver.start(false);
      await retryUntil(
        () => archiver.getSynchedCheckpointNumber().then(n => n === CheckpointNumber(1)),
        'sync',
        10,
        0.1,
      );

      expect(await archiver.getSynchedCheckpointNumber()).toEqual(CheckpointNumber(1));
      const lastBlockInCheckpoint1 = cp1.blocks[cp1.blocks.length - 1].number;

      // Verify L2Tips after syncing checkpoint 1: proposed and checkpointed at checkpoint 1
      const tipsAfterCheckpoint1 = await archiver.getL2Tips();
      expect(tipsAfterCheckpoint1.proposed.number).toEqual(lastBlockInCheckpoint1);
      expect(tipsAfterCheckpoint1.checkpointed.block.number).toEqual(lastBlockInCheckpoint1);
      expect(tipsAfterCheckpoint1.checkpointed.checkpoint.number).toEqual(CheckpointNumber(1));

      // Create checkpoint 2 on L1 at a future block (not yet visible)
      const { checkpoint: cp2 } = await fake.addCheckpoint(CheckpointNumber(2), {
        l1BlockNumber: 5000n, // Far in the future
        messagesL1BlockNumber: 4990n,
        numL1ToL2Messages: 3,
      });

      // Now add more blocks via addBlock (simulating local block production ahead of L1)
      for (const block of cp2.blocks) {
        await archiver.addBlock(block);
      }

      // Verify blocks are retrievable
      const lastBlockInCheckpoint2 = cp2.blocks[cp2.blocks.length - 1].number;
      expect(await archiver.getBlockNumber()).toEqual(lastBlockInCheckpoint2);

      // But checkpoint number should still be 1
      expect(await archiver.getSynchedCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Verify L2Tips after adding blocks: proposed advances, checkpointed stays at checkpoint 1
      const tipsAfterAddBlock = await archiver.getL2Tips();
      expect(tipsAfterAddBlock.proposed.number).toEqual(lastBlockInCheckpoint2);
      expect(tipsAfterAddBlock.checkpointed.block.number).toEqual(lastBlockInCheckpoint1);
      expect(tipsAfterAddBlock.checkpointed.checkpoint.number).toEqual(CheckpointNumber(1));

      // New blocks should not be checkpointed yet
      const firstNewBlockNumber = BlockNumber(lastBlockInCheckpoint1 + 1);
      const uncheckpointedBlock = await archiver.getCheckpointedBlock(firstNewBlockNumber);
      expect(uncheckpointedBlock).toBeUndefined();

      // Now advance L1 so checkpoint 2 becomes visible
      fake.setL1BlockNumber(5010n);

      await retryUntil(
        () => archiver.getSynchedCheckpointNumber().then(n => n === CheckpointNumber(2)),
        'sync',
        10,
        0.1,
      );

      // Now all blocks should be checkpointed
      expect(await archiver.getSynchedCheckpointNumber()).toEqual(CheckpointNumber(2));

      // Verify L2Tips after syncing checkpoint 2: both proposed and checkpointed at checkpoint 2
      const tipsAfterCheckpoint2 = await archiver.getL2Tips();
      expect(tipsAfterCheckpoint2.proposed.number).toEqual(lastBlockInCheckpoint2);
      expect(tipsAfterCheckpoint2.checkpointed.block.number).toEqual(lastBlockInCheckpoint2);
      expect(tipsAfterCheckpoint2.checkpointed.checkpoint.number).toEqual(CheckpointNumber(2));

      const checkpointedBlock = await archiver.getCheckpointedBlock(firstNewBlockNumber);
      expect(checkpointedBlock).toBeDefined();
      expect(checkpointedBlock!.checkpointNumber).toEqual(2);
    }, 10_000);
  });
});
