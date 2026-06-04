import type { BlobClientInterface } from '@aztec/blob-client/client';
import { makeRandomBlob } from '@aztec/blob-lib/testing';
import { GENESIS_ARCHIVE_ROOT } from '@aztec/constants';
import type { EpochCache, EpochCommitteeInfo } from '@aztec/epoch-cache';
import { DefaultL1ContractsConfig } from '@aztec/ethereum/config';
import {
  BlockTagTooOldError,
  type InboxContract,
  type OutboxContract,
  type RollupContract,
} from '@aztec/ethereum/contracts';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { sum, times } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryFastUntil } from '@aztec/foundation/retry';
import { TestDateProvider } from '@aztec/foundation/timer';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { GENESIS_BLOCK_HEADER_HASH, L2BlockSourceEvents } from '@aztec/stdlib/block';
import type { ProposedCheckpointInput } from '@aztec/stdlib/checkpoint';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { computeInHashFromL1ToL2Messages } from '@aztec/stdlib/messaging';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { mockCheckpointAndMessages } from '@aztec/stdlib/testing';
import { ConsensusTimetable } from '@aztec/stdlib/timetable';
import { BlockHeader } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { jest } from '@jest/globals';
import assert from 'assert';
import { EventEmitter } from 'events';
import { type MockProxy, mock } from 'jest-mock-extended';
import type { GetBlockReturnType } from 'viem';

import { Archiver, type ArchiverEmitter } from './archiver.js';
import { BlockOrCheckpointSlotExpiredError, L1ToL2MessagesNotReadyError } from './errors.js';
import type { ArchiverInstrumentation } from './modules/instrumentation.js';
import { ArchiverL1Synchronizer } from './modules/l1_synchronizer.js';
import { type ArchiverDataStores, createArchiverDataStores } from './store/data_stores.js';
import { L2TipsCache } from './store/l2_tips_cache.js';
import { FakeL1State } from './test/fake_l1_state.js';

describe('Archiver Sync', () => {
  const rollupAddress = EthAddress.random();
  const inboxAddress = EthAddress.random();
  const registryAddress = EthAddress.random();
  const governanceProposerAddress = EthAddress.random();
  const slashingProposerAddress = EthAddress.random();

  let fake: FakeL1State;
  let publicClient: MockProxy<ViemPublicClient>;
  let blobClient: MockProxy<BlobClientInterface>;
  let epochCache: MockProxy<EpochCache>;
  let rollupContract: MockProxy<RollupContract>;
  let inboxContract: MockProxy<InboxContract>;
  let instrumentation: MockProxy<ArchiverInstrumentation>;
  let dateProvider: TestDateProvider;
  let archiverStore: ArchiverDataStores;
  let l1Constants: L1RollupConstants & { l1StartBlockHash: Buffer32; genesisArchiveRoot: Fr };
  let archiver: Archiver;
  let logger: Logger;
  let syncLogger: Logger;
  let now: number;

  const GENESIS_ROOT = new Fr(GENESIS_ARCHIVE_ROOT);

  // Builds a standalone archiver (with its own store) over the shared L1/fake mocks. Used by the
  // beforeEach default instance and by tests that need a second archiver with a different config.
  const buildArchiver = async (
    storeName: string,
    configOverrides: { enableOrphanProposedBlockPruning?: boolean } = {},
  ): Promise<{ archiver: Archiver; synchronizer: ArchiverL1Synchronizer; archiverStore: ArchiverDataStores }> => {
    const store = createArchiverDataStores(await openTmpStore(storeName), GENESIS_BLOCK_HEADER_HASH);

    const contractAddresses = {
      rollupAddress,
      registryAddress,
      inboxAddress,
      governanceProposerAddress,
      slashingProposerAddress,
    };

    const config = {
      pollingIntervalMs: 1000,
      batchSize: 1000,
      maxAllowedEthClientDriftSeconds: 300,
      ethereumAllowNoDebugHosts: true,
      skipHistoricalLogsCheck: true,
      orphanProposedBlockPruneGraceSeconds: 2,
      enableOrphanProposedBlockPruning: true,
      blockDuration: 2,
      ...configOverrides,
    };

    const events = new EventEmitter() as ArchiverEmitter;
    const initialHeader = BlockHeader.empty();
    const initialBlockHash = await initialHeader.hash();
    const l2TipsCache = new L2TipsCache(store.blocks, initialBlockHash);

    const sync = new ArchiverL1Synchronizer(
      publicClient,
      publicClient,
      rollupContract,
      inboxContract,
      store,
      config,
      blobClient,
      epochCache,
      dateProvider,
      instrumentation,
      l1Constants,
      events,
      instrumentation.tracer,
      l2TipsCache,
      syncLogger,
    );

    const newArchiver = new Archiver(
      publicClient,
      publicClient,
      rollupContract,
      mock<OutboxContract>(),
      contractAddresses,
      store,
      config,
      blobClient,
      instrumentation,
      l1Constants,
      sync,
      events,
      initialHeader,
      initialBlockHash,
      l2TipsCache,
      dateProvider,
    );

    return { archiver: newArchiver, synchronizer: sync, archiverStore: store };
  };

  beforeEach(async () => {
    logger = createLogger('archiver:sync:test');
    syncLogger = createLogger('archiver:l1-sync:test');
    now = Math.floor(Date.now() / 1000);
    dateProvider = new TestDateProvider();

    // L1 constants
    l1Constants = {
      l1GenesisTime: BigInt(now),
      l1StartBlock: 0n,
      l1StartBlockHash: Buffer32.random(),
      epochDuration: 4,
      slotDuration: 24,
      ethereumSlotDuration: DefaultL1ContractsConfig.ethereumSlotDuration,
      proofSubmissionEpochs: 1,
      targetCommitteeSize: 48,
      rollupManaLimit: Number.MAX_SAFE_INTEGER,
      genesisArchiveRoot: GENESIS_ROOT,
    };

    // Create fake L1 state
    fake = new FakeL1State({ ...l1Constants, rollupAddress, inboxAddress });

    // Create mock clients from the fake
    publicClient = fake.createMockPublicClient();
    blobClient = fake.createMockBlobClient();

    // Create epoch cache mock (separate from fake)
    epochCache = mock<EpochCache>();
    epochCache.getCommitteeForEpoch.mockResolvedValue({ committee: [] as EthAddress[] } as EpochCommitteeInfo);
    // Create instrumentation mock
    const tracer = getTelemetryClient().getTracer('');
    instrumentation = mock<ArchiverInstrumentation>({ isEnabled: () => true, tracer });

    // Create mock contracts from the fake
    rollupContract = fake.createMockRollupContract(publicClient);
    inboxContract = fake.createMockInboxContract(publicClient);

    ({ archiver, archiverStore } = await buildArchiver('archiver_sync_test'));
  });

  afterEach(async () => {
    await archiver?.stop();
  });

  describe('basic sync', () => {
    it('syncs l1 to l2 messages and checkpoints', async () => {
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

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
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));

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
      await expect(archiver.getL1ToL2Messages(CheckpointNumber(4))).rejects.toThrow(L1ToL2MessagesNotReadyError);

      // Verify private logs are surfaced through the block body.
      for (const checkpoint of [cp1, cp2, cp3]) {
        for (const block of checkpoint.blocks) {
          const blockNumber = block.number;
          const expectedTotalNumLogs = (name: 'private') =>
            sum(block.body.txEffects.map(txEffect => txEffect[`${name}Logs`].length));

          const privateLogs = (await archiver.getBlock({ number: blockNumber }))!.getPrivateLogs();
          expect(privateLogs.length).toBe(expectedTotalNumLogs('private'));
        }
      }

      // Check proven checkpoint number
      expect(await archiver.getProvenCheckpointNumber()).toBe(CheckpointNumber(1));

      // Get published checkpoints
      expect(
        (await archiver.getCheckpoints({ from: CheckpointNumber(1), limit: 100 })).map(b => b.checkpoint.number),
      ).toEqual([1, 2, 3]);
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
      const randomBlob = await makeRandomBlob(3);

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

      // Create a checkpoint with blob data that spans multiple blobs but fits within the checkpoint limit.
      const { checkpoint } = await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 70n,
        messagesL1BlockNumber: 60n,
        numBlocks: 3,
        txsPerBlock: 4,
        maxEffects: 20,
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
      const syncedCheckpoints = await archiver.getCheckpoints({ from: CheckpointNumber(1), limit: 1 });
      expect(syncedCheckpoints).toBeDefined();
      expect(syncedCheckpoints.length).toBeGreaterThan(0);
      expect(syncedCheckpoints[0]).toBeDefined();
      expect(syncedCheckpoints[0].checkpoint.blocks.length).toBe(3);

      // Verify the tx effect counts match per block
      const syncedTxEffectCounts = syncedCheckpoints[0].checkpoint.blocks.map(b => b.body.txEffects.length);
      const originalTxEffectCounts = checkpoint.blocks.map(b => b.body.txEffects.length);
      expect(syncedTxEffectCounts).toEqual(originalTxEffectCounts);
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

    it('does not fetch messages when local and remote state both have zero messages', async () => {
      // When there are no messages on L1, the remote inbox state has messagesRollingHash = Buffer16.ZERO
      // and totalMessagesInserted = 0. The local store also returns 0 messages and undefined lastMessage.
      // The fallback for the local rolling hash must use Buffer16.ZERO (not Buffer32.ZERO) to match.
      fake.setL1BlockNumber(100n);

      // Add a checkpoint with zero messages so the sync has something to process
      await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 50n,
        messagesL1BlockNumber: 30n,
        numL1ToL2Messages: 0,
      });

      await archiver.syncImmediate();

      // Should have processed the checkpoint without attempting to fetch any messages
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));
      expect(inboxContract.getMessageSentEvents).not.toHaveBeenCalled();
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
      await retryFastUntil(() => archiver.isInitialSyncComplete(), 'initial sync complete');
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

      // And another spy for DescendentOfInvalidAttestationsCheckpointDetected, which fires only for a
      // checkpoint with VALID attestations that builds on a rejected ancestor. CP3 here has invalid
      // attestations of its own, so it is caught by the attestation check first and should never
      // reach the descendant path — this spy must not fire in this test.
      const descendantOfInvalidSpy = jest.fn();
      archiver.events.on(L2BlockSourceEvents.DescendentOfInvalidAttestationsCheckpointDetected, descendantOfInvalidSpy);

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

      // CP3 has invalid attestations of its own, so it is caught by the attestation check (which
      // runs before the descendant-of-invalid check) and surfaced as an
      // InvalidAttestationsCheckpointDetected event — NOT a descendant event — even though it also
      // builds on the rejected bad CP2b.
      expect(descendantOfInvalidSpy).not.toHaveBeenCalled();

      // Should have been called 3 times for invalid attestations: bad CP2, bad CP2b, bad CP3
      expect(invalidCheckpointDetectedSpy).toHaveBeenCalledTimes(3);
      expect(invalidCheckpointDetectedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: L2BlockSourceEvents.InvalidAttestationsCheckpointDetected,
          validationResult: expect.objectContaining({
            valid: false,
            checkpoint: expect.objectContaining({ checkpointNumber: 3 }),
          }),
        }),
      );

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
      const [checkpoint2] = await archiver.getCheckpoints({ from: CheckpointNumber(2), limit: 1 });
      expect(checkpoint2.checkpoint.number).toEqual(2);
      expect(checkpoint2.checkpoint.archive.root.toString()).toEqual(goodCp2.archive.root.toString());
      expect(checkpoint2.attestations.length).toEqual(3);

      // With a valid pending chain validation status
      expect(await archiver.getPendingChainValidationStatus()).toEqual(expect.objectContaining({ valid: true }));
    }, 15_000);

    it('skips a valid-attestations checkpoint that builds on a rejected ancestor', async () => {
      // Regression for the archiver "non-consecutive checkpoint" retry loop: when a checkpoint
      // with insufficient/invalid attestations is followed by a valid-attestations descendant,
      // addCheckpoints used to throw InitialCheckpointNumberNotSequentialError and loop on the
      // catch handler's L1-sync-point rollback. Now the descendant is detected, skipped, and
      // surfaced via DescendentOfInvalidAttestationsCheckpointDetected.
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

      fake.setTargetCommitteeSize(3);
      const signers = times(3, Secp256k1Signer.random);
      const committee = signers.map(s => s.address);
      epochCache.getCommitteeForEpoch.mockResolvedValue({ committee, seed: 0n } as EpochCommitteeInfo);

      const descendantOfInvalidSpy = jest.fn();
      archiver.events.on(L2BlockSourceEvents.DescendentOfInvalidAttestationsCheckpointDetected, descendantOfInvalidSpy);

      // Valid CP1
      const { checkpoint: cp1 } = await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 70n,
        messagesL1BlockNumber: 50n,
        numL1ToL2Messages: 3,
        signers,
      });
      const cp1Archive = cp1.blocks.at(-1)!.archive;

      // Bad CP2 (insufficient attestations — random signers not in committee)
      const badSigners = times(3, Secp256k1Signer.random);
      const { checkpoint: badCp2 } = await fake.addCheckpoint(CheckpointNumber(2), {
        l1BlockNumber: 80n,
        numL1ToL2Messages: 0,
        signers: badSigners,
        previousArchive: cp1Archive,
      });

      // Valid-attestations CP3 chained from bad CP2: this is the case that used to wedge the
      // synchronizer.
      const { checkpoint: validCp3 } = await fake.addCheckpoint(CheckpointNumber(3), {
        l1BlockNumber: 82n,
        numL1ToL2Messages: 0,
        signers,
        previousArchive: badCp2.blocks.at(-1)!.archive,
      });

      fake.setL1BlockNumber(85n);
      await archiver.syncImmediate();

      // Archiver should have stayed at CP1 (skipped both CP2 and CP3) without throwing.
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));

      // The descendant event should have fired for CP3 with the bad CP2 ancestor.
      expect(descendantOfInvalidSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: L2BlockSourceEvents.DescendentOfInvalidAttestationsCheckpointDetected,
          checkpoint: expect.objectContaining({
            checkpointNumber: 3,
            archive: validCp3.archive.root,
          }),
          ancestorArchiveRoot: badCp2.archive.root,
          ancestorCheckpointNumber: 2,
        }),
      );
      expect(descendantOfInvalidSpy).toHaveBeenCalledTimes(1);

      // The rejected entries should persist in the store, keyed by their own archive roots.
      const rejectedBad = await archiverStore.blocks.getRejectedCheckpointByArchiveRoot(badCp2.archive.root);
      const rejectedValid = await archiverStore.blocks.getRejectedCheckpointByArchiveRoot(validCp3.archive.root);
      expect(rejectedBad).toBeDefined();
      expect(rejectedValid).toBeDefined();
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
      expect(await archiver.getTxEffect(txHash)).toBeUndefined();
      expect(await archiver.getCheckpoints({ from: CheckpointNumber(2), limit: 1 })).toEqual([]);
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
      await expect(archiver.getL1ToL2Messages(CheckpointNumber(4))).rejects.toThrow(L1ToL2MessagesNotReadyError);

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

    it('short-circuits rollback at the finalized L1 block', async () => {
      // Sync two checkpoints worth of messages so we have history to roll back over.
      const msgs1 = [Fr.random(), Fr.random()];
      fake.addMessages(CheckpointNumber(1), 100n, msgs1);

      const msgs3 = [Fr.random(), Fr.random(), Fr.random(), Fr.random()];
      fake.addMessages(CheckpointNumber(3), 101n, msgs3);

      // Mark block 100 as finalized so messages there cannot be reorged.
      fake.setFinalizedL1BlockNumber(100n);
      fake.setL1BlockNumber(110n);
      await archiver.syncImmediate();

      expect(await archiver.getL1ToL2Messages(CheckpointNumber(1))).toHaveLength(2);
      expect(await archiver.getL1ToL2Messages(CheckpointNumber(3))).toHaveLength(4);

      // Simulate L1 reorg: remove the last 2 messages from checkpoint 3 and add new ones.
      fake.removeMessagesAfter(4);
      const msg40 = Fr.random();
      fake.addMessages(CheckpointNumber(4), 102n, [msg40]);

      fake.setL1BlockNumber(111n);

      // Spy on getMessageSentEventByHash — used by retrieveL1ToL2Message for per-message log queries.
      const eventByHashSpy = jest.spyOn(inboxContract, 'getMessageSentEventByHash');

      await archiver.syncImmediate();

      // The two checkpoint-1 messages sit at L1 block 100 (≤ finalized). The rollback loop
      // should stop there without issuing a per-message log query for them.
      const callsAtFinalizedOrBelow = eventByHashSpy.mock.calls.filter(
        ([, aroundL1BlockNumber]) => aroundL1BlockNumber <= 100n,
      );
      expect(callsAtFinalizedOrBelow).toHaveLength(0);

      expect(await archiver.getL1ToL2Messages(CheckpointNumber(1))).toHaveLength(2);
      expect(await archiver.getL1ToL2Messages(CheckpointNumber(4))).toHaveLength(1);
    });

    it('falls back to per-message log queries when finalized block is undefined', async () => {
      const msgs1 = [Fr.random(), Fr.random()];
      fake.addMessages(CheckpointNumber(1), 100n, msgs1);

      const msgs3 = [Fr.random(), Fr.random(), Fr.random(), Fr.random()];
      fake.addMessages(CheckpointNumber(3), 101n, msgs3);

      // No finalized block — simulates a fresh devnet.
      fake.setFinalizedL1BlockNumber(undefined);
      fake.setL1BlockNumber(110n);
      await archiver.syncImmediate();

      // Reorg: remove last 2 messages from checkpoint 3.
      fake.removeMessagesAfter(4);
      const msg40 = Fr.random();
      fake.addMessages(CheckpointNumber(4), 102n, [msg40]);
      fake.setL1BlockNumber(111n);

      const eventByHashSpy = jest.spyOn(inboxContract, 'getMessageSentEventByHash');

      await archiver.syncImmediate();

      // Without a finalized pointer the synchronizer must use per-message log queries to find the common point.
      // 2 messages mismatch on remote (msgs3[2], msgs3[3]) and one matches (msgs3[1]) before we break.
      expect(eventByHashSpy).toHaveBeenCalledTimes(3);

      expect(await archiver.getL1ToL2Messages(CheckpointNumber(1))).toHaveLength(2);
      expect(await archiver.getL1ToL2Messages(CheckpointNumber(4))).toHaveLength(1);
    });

    it('persists the finalized L1 block monotonically after message sync', async () => {
      const msgs1 = [Fr.random(), Fr.random()];
      fake.addMessages(CheckpointNumber(1), 100n, msgs1);

      fake.setFinalizedL1BlockNumber(95n);
      fake.setL1BlockNumber(110n);
      await archiver.syncImmediate();

      const stored1 = await archiverStore.messages.getMessagesFinalizedL1Block();
      expect(stored1?.l1BlockNumber).toEqual(95n);

      // A second sync where the finalized block has not advanced.
      fake.setL1BlockNumber(111n);
      await archiver.syncImmediate();

      const stored2 = await archiverStore.messages.getMessagesFinalizedL1Block();
      expect(stored2?.l1BlockNumber).toEqual(95n);

      // Now advance the finalized block — the pointer should follow.
      fake.setFinalizedL1BlockNumber(105n);
      fake.setL1BlockNumber(112n);
      await archiver.syncImmediate();

      const stored3 = await archiverStore.messages.getMessagesFinalizedL1Block();
      expect(stored3?.l1BlockNumber).toEqual(105n);
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

    it('handles an upcoming L2 prune', async () => {
      const pruneSpy = jest.fn();
      archiver.events.on(L2BlockSourceEvents.L2PruneUnproven, pruneSpy);

      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

      // Add and sync checkpoints 1, 2, 3
      const { checkpoint: cp1 } = await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 70n,
        messagesL1BlockNumber: 50n,
        numL1ToL2Messages: 3,
      });

      await fake.addCheckpoint(CheckpointNumber(2), {
        l1BlockNumber: 80n,
        messagesL1BlockNumber: 60n,
        numL1ToL2Messages: 3,
      });

      await fake.addCheckpoint(CheckpointNumber(3), {
        l1BlockNumber: 90n,
        messagesL1BlockNumber: 66n,
        numL1ToL2Messages: 3,
      });

      fake.setL1BlockNumber(100n);
      await archiver.syncImmediate();
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(3));

      // Mark checkpoint 1 as proven
      fake.markCheckpointAsProven(CheckpointNumber(1));
      expect(await archiver.getProvenCheckpointNumber()).toEqual(CheckpointNumber(0));

      // Enable pruning (simulate proof window about to expire)
      fake.setCanPrune(true);

      // Sync again — handleEpochPrune should remove checkpoints 2 and 3
      fake.setL1BlockNumber(101n);
      await archiver.syncImmediate();

      // Proven checkpoint should advance to 1 since we synced it
      expect(await archiver.getProvenCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Checkpoints 2 and 3 should be removed, archiver at checkpoint 1
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));

      // L2PruneUnproven event should have been emitted with the correct epoch
      // CP2 is at L1 block 80 → slot = (80 * 12) / 24 = 40 → epoch = 40 / 4 = 10
      expect(pruneSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: L2BlockSourceEvents.L2PruneUnproven,
          epochNumber: EpochNumber(10),
        }),
      );

      // L2Tips should reflect rollback to checkpoint 1
      const lastBlockInCheckpoint1 = cp1.blocks[cp1.blocks.length - 1].number;
      const tips = await archiver.getL2Tips();
      expect(tips.checkpointed.block.number).toEqual(lastBlockInCheckpoint1);
      expect(tips.checkpointed.checkpoint.number).toEqual(CheckpointNumber(1));

      // Data from checkpoints 2 and 3 should be removed
      expect(await archiver.getCheckpoints({ from: CheckpointNumber(2), limit: 1 })).toEqual([]);
      expect(await archiver.getCheckpoints({ from: CheckpointNumber(3), limit: 1 })).toEqual([]);

      archiver.events.off(L2BlockSourceEvents.L2PruneUnproven, pruneSpy);
    }, 15_000);

    it('lost a proof (proven checkpoint rolls back to zero)', async () => {
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

      // Add and sync checkpoints 1 and 2
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

      fake.setL1BlockNumber(90n);
      await archiver.syncImmediate();
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(2));

      // Mark checkpoint 1 as proven, sync
      fake.markCheckpointAsProven(CheckpointNumber(1));
      fake.setL1BlockNumber(91n);
      await archiver.syncImmediate();
      expect(await archiver.getProvenCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Reset proven to 0 (simulate lost proof due to L1 reorg)
      fake.markCheckpointAsProven(CheckpointNumber(0));
      fake.setL1BlockNumber(92n);
      await archiver.syncImmediate();

      // Proven checkpoint should be back at 0
      expect(await archiver.getProvenCheckpointNumber()).toEqual(CheckpointNumber(0));

      // Pending/checkpointed chain should still be at checkpoint 2
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(2));

      // L2Tips proven tip should reflect rollback
      const tips = await archiver.getL2Tips();
      expect(tips.proven.block.number).toEqual(0);
    }, 10_000);

    it('new proof appeared for previously pruned blocks', async () => {
      const provenSpy = jest.fn();
      archiver.events.on(L2BlockSourceEvents.L2BlockProven, provenSpy);

      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

      // Add and sync checkpoints 1, 2, 3
      const cp1NumMessages = 3;
      const { checkpoint: cp1 } = await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 70n,
        messagesL1BlockNumber: 50n,
        numL1ToL2Messages: cp1NumMessages,
      });
      const cp1Archive = cp1.blocks[cp1.blocks.length - 1].archive;

      await fake.addCheckpoint(CheckpointNumber(2), {
        l1BlockNumber: 80n,
        messagesL1BlockNumber: 60n,
        numL1ToL2Messages: 3,
      });

      await fake.addCheckpoint(CheckpointNumber(3), {
        l1BlockNumber: 90n,
        messagesL1BlockNumber: 66n,
        numL1ToL2Messages: 3,
      });

      fake.setL1BlockNumber(100n);
      await archiver.syncImmediate();
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(3));

      // Mark checkpoint 1 as proven so epoch prune only removes 2 and 3
      fake.markCheckpointAsProven(CheckpointNumber(1));

      // Enable pruning to trigger epoch prune (unwind checkpoints 2 and 3)
      fake.setCanPrune(true);
      fake.setL1BlockNumber(101n);
      await archiver.syncImmediate();

      // Verify checkpoints 2 and 3 are pruned (only proven checkpoint 1 remains)
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));
      expect(await archiver.getProvenCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Disable pruning
      fake.setCanPrune(false);

      // Re-add checkpoints 2 and 3 on L1 (new epoch proposal).
      // Remove old checkpoint events and their messages from the fake.
      // The message removal triggers rolling hash recalculation, and on next sync
      // handleL1ToL2Messages detects the mismatch and clears the archiver's message store.
      fake.removeCheckpoint(CheckpointNumber(2));
      fake.removeCheckpoint(CheckpointNumber(3));
      fake.removeMessagesAfter(cp1NumMessages);

      await fake.addCheckpoint(CheckpointNumber(2), {
        l1BlockNumber: 110n,
        numL1ToL2Messages: 0,
        previousArchive: cp1Archive,
      });

      await fake.addCheckpoint(CheckpointNumber(3), {
        l1BlockNumber: 120n,
        numL1ToL2Messages: 0,
      });

      // Mark checkpoint 2 as proven
      fake.markCheckpointAsProven(CheckpointNumber(2));

      // Sync
      fake.setL1BlockNumber(130n);
      await archiver.syncImmediate();

      // Archiver should re-sync checkpoints 2 and 3
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(3));

      // Proven checkpoint should advance to 2
      expect(await archiver.getProvenCheckpointNumber()).toEqual(CheckpointNumber(2));

      // L2BlockProven event should have been emitted
      expect(provenSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: L2BlockSourceEvents.L2BlockProven,
        }),
      );

      archiver.events.off(L2BlockSourceEvents.L2BlockProven, provenSpy);
    }, 15_000);

    it('detects new checkpoint behind L1 syncpoint due to L1 reorg', async () => {
      const loggerSpy = jest.spyOn(syncLogger, 'warn');

      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

      // Sync checkpoint 1 from L1 to establish baseline (sync point = 70)
      await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 70n,
        messagesL1BlockNumber: 50n,
        numL1ToL2Messages: 3,
      });

      fake.setL1BlockNumber(100n);
      await archiver.syncImmediate();
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Manually advance the sync point past where the new checkpoint will appear.
      // This simulates a scenario where the sync point was advanced (e.g., via invalid
      // attestation handling at line 204), placing it ahead of a new checkpoint.
      await archiverStore.blocks.setSynchedL1BlockNumber(200n);
      // checkForNewCheckpointsBeforeL1SyncPoint requires validationResult?.valid to be true
      await archiverStore.blocks.setPendingChainValidationStatus({ valid: true });

      // Add checkpoint 2 at L1 block 150 (behind the manual sync point of 200).
      // This simulates an L1 reorg that added a new checkpoint in a range already scanned.
      await fake.addCheckpoint(CheckpointNumber(2), {
        l1BlockNumber: 150n,
        messagesL1BlockNumber: 130n,
        numL1ToL2Messages: 3,
      });

      // Sync: searches from 201 onward, doesn't find CP2 at 150.
      // checkForNewCheckpointsBeforeL1SyncPoint detects latestLocal(1) < pending(2)
      // and rolls back the sync point to CP1's L1 block (70).
      // The rollback does NOT re-fetch in the same iteration.
      fake.setL1BlockNumber(201n);
      await archiver.syncImmediate();
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Failed to reach checkpoint 2.*Rolling back/),
        expect.anything(),
      );

      // Second sync: fetches from the rolled-back sync point (70) and finds CP2 at L1 block 150
      fake.setL1BlockNumber(202n);
      await archiver.syncImmediate();

      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(2));
    }, 15_000);

    it('handles L1 reorg that moves a checkpoint to a later L1 block', async () => {
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

      // Sync checkpoints 1 and 2
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

      fake.setL1BlockNumber(90n);
      await archiver.syncImmediate();
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(2));

      // Verify checkpoint 2's blocks are stored
      const lastBlockNumber = cp2.blocks.at(-1)!.number;
      const tips = await archiver.getL2Tips();
      expect(tips.checkpointed.checkpoint.number).toEqual(CheckpointNumber(2));
      expect(tips.checkpointed.block.number).toEqual(lastBlockNumber);

      // Simulate L1 reorg: checkpoint 2 moves from L1 block 80 to L1 block 85.
      // The checkpoint content (blocks, archive) stays the same — only the L1 block changes.
      // This causes the archiver to re-discover checkpoint 2 when scanning from block 81 onward.
      fake.moveCheckpointToL1Block(CheckpointNumber(2), 85n);

      // Advance L1 and sync. The archiver's sync point is at L1 block 80 (from checkpoint 2's
      // original insertion). The scan starts from 81, finds checkpoint 2 at block 85, and must
      // accept it as a duplicate with updated L1 info rather than throwing.
      fake.setL1BlockNumber(95n);
      await archiver.syncImmediate();

      // The archiver should still be at checkpoint 2 and healthy
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(2));

      // Add checkpoint 3 to verify the archiver can continue syncing after the duplicate
      await fake.addCheckpoint(CheckpointNumber(3), {
        l1BlockNumber: 100n,
        messagesL1BlockNumber: 90n,
        numL1ToL2Messages: 3,
      });
      fake.setL1BlockNumber(110n);
      await archiver.syncImmediate();
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(3));
    }, 15_000);
  });

  describe('finalized checkpoint', () => {
    it('reports no finalized blocks before any checkpoint is proven', async () => {
      fake.setL1BlockNumber(100n);
      fake.setFinalizedL1BlockNumber(100n);
      await archiver.syncImmediate();

      const tips = await archiver.getL2Tips();
      expect(tips.finalized.checkpoint.number).toEqual(CheckpointNumber(0));
      expect(tips.finalized.block.number).toEqual(BlockNumber(0));
    });

    it('updates finalized checkpoint when the L1 finalized block is at or past the proven checkpoint L1 block', async () => {
      const { checkpoint: cp1 } = await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 70n,
        messagesL1BlockNumber: 50n,
        numL1ToL2Messages: 3,
      });

      // Sync all checkpoints
      fake.setL1BlockNumber(100n);
      await archiver.syncImmediate();

      // Mark checkpoint 1 as proven and advance L1 so proven is registered
      fake.markCheckpointAsProven(CheckpointNumber(1));
      fake.setL1BlockNumber(101n);
      await archiver.syncImmediate();
      expect(await archiver.getProvenCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Finalized L1 block is at or past where checkpoint 1 was published (70)
      fake.setFinalizedL1BlockNumber(70n);
      fake.setL1BlockNumber(102n);
      await archiver.syncImmediate();

      const tips = await archiver.getL2Tips();
      const lastBlockInCp1 = cp1.blocks.at(-1)!.number;
      expect(tips.finalized.checkpoint.number).toEqual(CheckpointNumber(1));
      expect(tips.finalized.block.number).toEqual(lastBlockInCp1);
    });

    it('leaves finalized checkpoint untouched when L1 has no finalized block yet', async () => {
      await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 70n,
        messagesL1BlockNumber: 50n,
        numL1ToL2Messages: 3,
      });

      fake.markCheckpointAsProven(CheckpointNumber(1));
      fake.setL1BlockNumber(101n);
      fake.setFinalizedL1BlockNumber(undefined);

      await expect(archiver.syncImmediate()).resolves.not.toThrow();

      const tips = await archiver.getL2Tips();
      expect(tips.finalized.checkpoint.number).toEqual(CheckpointNumber(0));
      expect(tips.finalized.block.number).toEqual(BlockNumber(0));
    });

    it('does not advance finalized checkpoint when finalized L1 block is before the proven checkpoint', async () => {
      await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 70n,
        messagesL1BlockNumber: 50n,
        numL1ToL2Messages: 3,
      });

      fake.setL1BlockNumber(100n);
      await archiver.syncImmediate();

      fake.markCheckpointAsProven(CheckpointNumber(1));
      fake.setL1BlockNumber(101n);
      await archiver.syncImmediate();
      expect(await archiver.getProvenCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Finalized L1 block is before where checkpoint 1 was published (70)
      fake.setFinalizedL1BlockNumber(50n);
      fake.setL1BlockNumber(102n);
      await archiver.syncImmediate();

      const tips = await archiver.getL2Tips();
      expect(tips.finalized.checkpoint.number).toEqual(CheckpointNumber(0));
      expect(tips.finalized.block.number).toEqual(BlockNumber(0));
    });
  });

  describe('checkpointing local proposed blocks', () => {
    let pruneSpy: jest.Mock;

    beforeEach(() => {
      pruneSpy = jest.fn();
      archiver.events.on(L2BlockSourceEvents.L2PruneUncheckpointed, pruneSpy);
    });

    afterEach(() => {
      archiver.events.off(L2BlockSourceEvents.L2PruneUncheckpointed, pruneSpy);
    });

    it('checkpoints local blocks when matching checkpoint syncs from L1', async () => {
      // First, sync checkpoint 1 from L1 to establish a baseline
      const { checkpoint: cp1 } = await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 70n,
        messagesL1BlockNumber: 60n,
        numL1ToL2Messages: 3,
      });

      fake.setL1BlockNumber(100n);
      await archiver.syncImmediate();

      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));
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
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));
      expect((await archiver.getBlock({ number: cp2.blocks[0].number }))!.equals(cp2.blocks[0])).toBe(true);

      // Verify L2Tips after adding blocks: proposed advances but checkpointed stays at checkpoint 1
      const tipsAfterAddBlock = await archiver.getL2Tips();
      expect(tipsAfterAddBlock.proposed.number).toEqual(lastBlockInCheckpoint2);
      expect(tipsAfterAddBlock.checkpointed.block.number).toEqual(lastBlockInCheckpoint1);
      expect(tipsAfterAddBlock.checkpointed.checkpoint.number).toEqual(CheckpointNumber(1));

      // getBlocks with onlyCheckpointed should return empty for the new blocks since checkpoint 2 hasn't synced
      const firstNewBlockNumber = BlockNumber(lastBlockInCheckpoint1 + 1);
      const uncheckpointedBlocks = await archiver.getBlocks({
        from: firstNewBlockNumber,
        limit: 1,
        onlyCheckpointed: true,
      });
      expect(uncheckpointedBlocks).toHaveLength(0);

      // But getBlock should work (it retrieves both checkpointed and uncheckpointed blocks)
      const block = await archiver.getBlock({ number: firstNewBlockNumber });
      expect(block).toBeDefined();

      // Now advance L1 so checkpoint 2 becomes visible
      fake.setL1BlockNumber(5010n);

      await archiver.syncImmediate();

      // Verify NO prune event was emitted (blocks matched)
      expect(pruneSpy).not.toHaveBeenCalled();

      // Now the blocks should be checkpointed
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(2));

      // Verify L2Tips after syncing checkpoint 2: proposed and checkpointed should both be at checkpoint 2
      const tipsAfterCheckpoint2 = await archiver.getL2Tips();
      expect(tipsAfterCheckpoint2.proposed.number).toEqual(lastBlockInCheckpoint2);
      expect(tipsAfterCheckpoint2.checkpointed.block.number).toEqual(lastBlockInCheckpoint2);
      expect(tipsAfterCheckpoint2.checkpointed.checkpoint.number).toEqual(CheckpointNumber(2));

      // getBlocks with onlyCheckpointed should now include the new blocks
      const checkpointedBlocks = await archiver.getBlocks({
        from: firstNewBlockNumber,
        limit: 1,
        onlyCheckpointed: true,
      });
      expect(checkpointedBlocks).toHaveLength(1);
      expect(checkpointedBlocks[0].checkpointNumber).toEqual(2);
    }, 10_000);

    it('rejects adding blocks that are already checkpointed', async () => {
      // First, sync checkpoint 1 from L1 to establish a baseline
      const { checkpoint: cp1 } = await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 70n,
        messagesL1BlockNumber: 60n,
        numL1ToL2Messages: 3,
      });

      fake.setL1BlockNumber(100n);
      await archiver.syncImmediate();

      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));
      const blockAlreadySyncedFromCheckpoint = cp1.blocks[cp1.blocks.length - 1];

      // Now try and add one of the blocks via the addProposedBlock method. It should throw
      await expect(archiver.addBlock(blockAlreadySyncedFromCheckpoint)).rejects.toThrow();
    }, 10_000);

    it('rejects adding blocks for past slots', async () => {
      // L1 constants from setup: slotDuration=24, ethereumSlotDuration=12
      // L1 blocks per L2 slot = 24/12 = 2
      // L2 slot for L1 block N = floor((N * 12) / 24) = floor(N / 2)

      // Sync checkpoint 1 from L1 to establish a baseline
      const { checkpoint: cp1 } = await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 4n, // This is in L2 slot 2
        messagesL1BlockNumber: 2n,
        numL1ToL2Messages: 3,
        slotNumber: SlotNumber(2),
      });
      const cp1Archive = cp1.blocks[cp1.blocks.length - 1].archive;

      fake.setL1BlockNumber(4n);
      await archiver.syncImmediate();

      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Now advance L1 significantly to slot 10 (L1 block 20)
      // Current slot = floor(20 / 2) = 10
      // Slot at next L1 block = floor(21 / 2) = 10
      fake.setL1BlockNumber(20n);
      await archiver.syncImmediate();

      // Create a block for slot 5 (which has already passed)
      const pastSlotBlocks = await fake.makeBlocks(CheckpointNumber(2), {
        l1BlockNumber: 10n, // Would be slot 5
        previousArchive: cp1Archive,
        slotNumber: SlotNumber(5), // Explicitly set past slot
      });

      // Try to add the block for the past slot - should be rejected
      await expect(archiver.addBlock(pastSlotBlocks[0])).rejects.toThrow(BlockOrCheckpointSlotExpiredError);
    }, 10_000);

    it('adds missing blocks when checkpoint has more blocks than local', async () => {
      // Sync checkpoint 1 from L1
      await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 70n,
        messagesL1BlockNumber: 60n,
        numL1ToL2Messages: 3,
      });

      fake.setL1BlockNumber(100n);
      await archiver.syncImmediate();

      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Create checkpoint 2 on L1 with 2 blocks (not yet visible)
      const { checkpoint: cp2 } = await fake.addCheckpoint(CheckpointNumber(2), {
        l1BlockNumber: 5000n,
        messagesL1BlockNumber: 4990n,
        numL1ToL2Messages: 3,
        numBlocks: 2,
      });

      // Add only the FIRST block locally via addBlock
      await archiver.addBlock(cp2.blocks[0]);

      // Verify only first block is visible
      const firstBlockNumber = cp2.blocks[0].number;
      expect(await archiver.getBlockNumber()).toEqual(firstBlockNumber);

      // Make L1 checkpoint visible
      fake.setL1BlockNumber(5010n);

      // Sync - should add the second block from the checkpoint
      await archiver.syncImmediate();

      // Verify NO prune event was emitted
      expect(pruneSpy).not.toHaveBeenCalled();

      // Both blocks should now be visible
      const lastBlockInCheckpoint2 = cp2.blocks[cp2.blocks.length - 1].number;
      expect(await archiver.getBlockNumber()).toEqual(lastBlockInCheckpoint2);

      // Verify we can retrieve both blocks
      const syncedCheckpoints = await archiver.getCheckpoints({ from: CheckpointNumber(2), limit: 1 });
      expect(syncedCheckpoints[0].checkpoint.blocks.length).toEqual(2);
    }, 15_000);

    it('checkpoints local blocks from multiple slots when multiple checkpoints sync at once', async () => {
      // Sync checkpoint 1 from L1 to establish baseline
      await fake.addCheckpoint(CheckpointNumber(1), { l1BlockNumber: 70n });
      fake.setL1BlockNumber(100n);
      await archiver.syncImmediate();

      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Create checkpoint 2 on L1 (NOT visible yet - L1 block is far in the future)
      const { checkpoint: cp2 } = await fake.addCheckpoint(CheckpointNumber(2), { l1BlockNumber: 5000n });

      // Create checkpoint 3 on L1 (also NOT visible yet)
      const { checkpoint: cp3 } = await fake.addCheckpoint(CheckpointNumber(3), { l1BlockNumber: 5010n });

      // Add blocks from BOTH checkpoints locally (matching the L1 checkpoints)
      for (const block of cp2.blocks) {
        await archiverStore.blocks.addProposedBlock(block, { force: true });
      }
      for (const block of cp3.blocks) {
        await archiverStore.blocks.addProposedBlock(block, { force: true });
      }

      // Verify all blocks are visible locally
      const lastBlockInCheckpoint3 = cp3.blocks[cp3.blocks.length - 1].number;
      expect(await archiver.getBlockNumber()).toEqual(lastBlockInCheckpoint3);

      // Still at checkpoint 1 (checkpoints 2 and 3 not synced yet)
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Advance L1 to make BOTH checkpoints visible at once
      fake.setL1BlockNumber(5010n);

      // Sync the archiver - this should process both checkpoints in one call
      await archiver.syncImmediate();

      // Assert: NO prune event was emitted (blocks matched)
      expect(pruneSpy).not.toHaveBeenCalled();

      // Assert: All blocks are still present
      expect(await archiver.getBlockNumber()).toEqual(lastBlockInCheckpoint3);

      // Assert: Both checkpoints are synced
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(3));
    }, 15_000);

    it('prunes and replaces local blocks when checkpoint has different blocks', async () => {
      // Sync checkpoint 1 from L1 to establish baseline
      const { checkpoint: cp1 } = await fake.addCheckpoint(CheckpointNumber(1), { l1BlockNumber: 70n });
      const cp1Archive = cp1.blocks[cp1.blocks.length - 1].archive;

      fake.setL1BlockNumber(80n);
      await archiver.syncImmediate();

      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Create blocks for checkpoint 2 locally (not yet on L1)
      const provisionalBlocks = await fake.makeBlocks(CheckpointNumber(2), {
        l1BlockNumber: 100n,
        previousArchive: cp1Archive,
      });

      // Add blocks locally via addBlock
      for (const block of provisionalBlocks) {
        await archiver.addBlock(block);
      }

      // Verify blocks are visible but not checkpointed
      const lastBlockInCheckpoint2 = provisionalBlocks[provisionalBlocks.length - 1].number;
      expect(await archiver.getBlockNumber()).toEqual(lastBlockInCheckpoint2);
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Now create a DIFFERENT checkpoint 2 on L1 (different blocks)
      const { checkpoint: differentCp2 } = await fake.addCheckpoint(CheckpointNumber(2), {
        l1BlockNumber: 100n,
        previousArchive: cp1Archive,
      });

      // Verify the blocks are actually different (compare archive roots of last blocks)
      const provisionalLastArchive = provisionalBlocks[provisionalBlocks.length - 1].archive.root;
      expect(provisionalLastArchive.toString()).not.toEqual(differentCp2.archive.root.toString());

      // Make L1 checkpoint visible
      fake.setL1BlockNumber(101n);

      // Sync and replace provisional blocks with L1 checkpoint
      await archiver.syncImmediate();

      // Verify prune event was emitted
      expect(pruneSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: L2BlockSourceEvents.L2PruneUncheckpointed,
          slotNumber: expect.any(Number),
          blocks: expect.arrayContaining(provisionalBlocks.map(b => expect.objectContaining({ number: b.number }))),
        }),
      );

      // Verify blocks were replaced with L1 checkpoint's blocks
      const syncedCheckpoints = await archiver.getCheckpoints({ from: CheckpointNumber(2), limit: 1 });
      expect(syncedCheckpoints[0].checkpoint.archive.root.toString()).toEqual(differentCp2.archive.root.toString());
    }, 15_000);

    it('prunes excess local blocks when checkpoint has fewer blocks', async () => {
      // Sync checkpoint 1 from L1 to establish baseline
      const { checkpoint: cp1 } = await fake.addCheckpoint(CheckpointNumber(1), { l1BlockNumber: 70n });
      const cp1Archive = cp1.blocks[cp1.blocks.length - 1].archive;

      fake.setL1BlockNumber(80n);
      await archiver.syncImmediate();

      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Create 2 provisional blocks locally (not on L1)
      const provisionalBlocks = await fake.makeBlocks(CheckpointNumber(2), {
        numBlocks: 2,
        previousArchive: cp1Archive,
        l1BlockNumber: 5000n,
      });

      // Add both blocks locally via addBlock
      for (const block of provisionalBlocks) {
        await archiver.addBlock(block);
      }

      // Verify both blocks are visible
      expect(await archiver.getBlockNumber()).toEqual(provisionalBlocks[1].number);

      // Now create a checkpoint 2 on L1 with only the first provisional block
      const { checkpoint: differentCp2 } = await fake.addCheckpoint(CheckpointNumber(2), {
        l1BlockNumber: 5000n,
        previousArchive: cp1Archive,
        blocks: [provisionalBlocks[0]],
      });

      // Make L1 checkpoint visible
      fake.setL1BlockNumber(5010n);

      // Sync
      await archiver.syncImmediate();

      // Verify prune event was emitted for only the last local block
      expect(pruneSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: L2BlockSourceEvents.L2PruneUncheckpointed,
          blocks: expect.arrayContaining(
            provisionalBlocks.slice(1).map(b => expect.objectContaining({ number: b.number })),
          ),
        }),
      );

      // Verify only the L1 checkpoint's single block is now present
      const syncedCheckpoints = await archiver.getCheckpoints({ from: CheckpointNumber(2), limit: 1 });
      expect(syncedCheckpoints[0].checkpoint.blocks.length).toEqual(1);
      expect(syncedCheckpoints[0].checkpoint.archive.root.toString()).toEqual(differentCp2.archive.root.toString());
    }, 15_000);

    it('prunes local blocks when slot ends without checkpoint', async () => {
      // Slot calculation: L2_slot = L1_block / 2 (since slotDuration=24, ethereumSlotDuration=12)
      // So: L1 blocks 0-1 → slot 0, L1 blocks 2-3 → slot 1, L1 blocks 4-5 → slot 2

      // Sync checkpoint 1 in slot 0 (at L1 block 1, which is still in slot 0)
      const { checkpoint: cp1 } = await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 1n,
        messagesL1BlockNumber: 1n,
        numL1ToL2Messages: 3,
        slotNumber: SlotNumber(0),
      });
      const cp1Archive = cp1.blocks[cp1.blocks.length - 1].archive;
      fake.setL1BlockNumber(1n);
      await archiver.syncImmediate();

      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));

      const lastBlockInCheckpoint1 = cp1.blocks[cp1.blocks.length - 1].number;

      // Create blocks for slot 1 (not yet on L1)
      const provisionalBlocks = await fake.makeBlocks(CheckpointNumber(2), {
        l1BlockNumber: 2n,
        previousArchive: cp1Archive,
      });

      // Add blocks locally via addBlock for slot 1
      for (const block of provisionalBlocks) {
        await archiver.addBlock(block);
      }

      // Verify blocks are visible
      const lastProvisionalBlockNumber = provisionalBlocks[provisionalBlocks.length - 1].number;
      expect(await archiver.getBlockNumber()).toEqual(lastProvisionalBlockNumber);

      // Advance L1 to block 2 (still in slot 1) - should NOT trigger prune yet
      fake.setL1BlockNumber(2n);
      await archiver.syncImmediate();

      // Verify NO prune event was emitted (we're still in slot 1)
      expect(pruneSpy).not.toHaveBeenCalled();

      // Clear the spy to check for new calls after the next sync
      pruneSpy.mockClear();

      // Blocks should still be visible
      expect(await archiver.getBlockNumber()).toEqual(lastProvisionalBlockNumber);

      // Now advance L1 to block 3, ending slot 1 without checkpoint
      // This simulates slot 1 ending without a checkpoint landing on L1
      // The pruning logic checks all slots between previous sync (slot 0) and current (slot 2)
      fake.setL1BlockNumber(3n);
      await archiver.syncImmediate();

      // Verify prune event was emitted
      expect(pruneSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: L2BlockSourceEvents.L2PruneUncheckpointed,
          slotNumber: SlotNumber(1),
          blocks: expect.arrayContaining(provisionalBlocks.map(b => expect.objectContaining({ number: b.number }))),
        }),
      );

      // Block number should revert to last checkpointed block
      expect(await archiver.getBlockNumber()).toEqual(lastBlockInCheckpoint1);
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));
    }, 15_000);

    it('does nothing when slot ends without local blocks', async () => {
      // Slot calculation: L2_slot = L1_block / 2 (since slotDuration=24, ethereumSlotDuration=12)
      // So: L1 blocks 0-1 → slot 0, L1 blocks 2-3 → slot 1, L1 blocks 4-5 → slot 2

      // Sync checkpoint 1 in slot 0
      const { checkpoint: cp1 } = await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 1n,
        messagesL1BlockNumber: 1n,
        numL1ToL2Messages: 3,
        slotNumber: SlotNumber(0),
      });

      fake.setL1BlockNumber(1n);
      await archiver.syncImmediate();

      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));
      const lastBlockInCheckpoint1 = cp1.blocks[cp1.blocks.length - 1].number;

      // Do NOT add any provisional blocks for slot 1

      // Advance L1 directly to slot 2 (L1 block 4), skipping slot 1
      // Slot 1 ends without a checkpoint, but there are no provisional blocks
      fake.setL1BlockNumber(4n);
      await archiver.syncImmediate();

      // Verify NO prune event was emitted (nothing to prune)
      expect(pruneSpy).not.toHaveBeenCalled();

      // Block number should remain at last checkpointed block
      expect(await archiver.getBlockNumber()).toEqual(lastBlockInCheckpoint1);
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));
    }, 15_000);

    it('does not prune blocks covered by a pending checkpoint in current slot', async () => {
      // Slot calculation: L2_slot = L1_block / 2 (since slotDuration=24, ethereumSlotDuration=12)
      // So: L1 blocks 0-1 → slot 0, L1 blocks 2-3 → slot 1, L1 blocks 4-5 → slot 2

      // Sync checkpoint 1 in slot 0
      const { checkpoint: cp1 } = await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 1n,
        messagesL1BlockNumber: 1n,
        numL1ToL2Messages: 3,
        slotNumber: SlotNumber(0),
      });
      const cp1Archive = cp1.blocks[cp1.blocks.length - 1].archive;
      fake.setL1BlockNumber(1n);
      await archiver.syncImmediate();

      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));
      const lastBlockInCheckpoint1 = cp1.blocks[cp1.blocks.length - 1].number;

      // Create provisional blocks for slot 1
      const provisionalBlocks = await fake.makeBlocks(CheckpointNumber(2), {
        l1BlockNumber: 2n,
        previousArchive: cp1Archive,
        slotNumber: SlotNumber(1),
      });

      for (const block of provisionalBlocks) {
        await archiver.addBlock(block);
      }

      const lastProvisionalBlockNumber = provisionalBlocks[provisionalBlocks.length - 1].number;
      expect(await archiver.getBlockNumber()).toEqual(lastProvisionalBlockNumber);

      // Set a proposed checkpoint covering these blocks (simulating pipelining)
      const proposedCheckpoint: ProposedCheckpointInput = {
        checkpointNumber: CheckpointNumber(2),
        header: CheckpointHeader.empty({ slotNumber: SlotNumber(1) }),
        startBlock: BlockNumber(lastBlockInCheckpoint1 + 1),
        blockCount: provisionalBlocks.length,
        totalManaUsed: 0n,
        feeAssetPriceModifier: 0n,
      };
      await archiver.addProposedCheckpoint(proposedCheckpoint);

      // Advance L1 to block 2 (still in slot 1) — proposed checkpoint is still current
      fake.setL1BlockNumber(2n);
      await archiver.syncImmediate();

      // Blocks should NOT be pruned
      expect(pruneSpy).not.toHaveBeenCalled();
      expect(await archiver.getBlockNumber()).toEqual(lastProvisionalBlockNumber);

      // Proposed checkpoint should still be set
      expect(await archiverStore.blocks.getLastProposedCheckpoint()).toBeDefined();

      // Proposed tip should be ahead of the checkpointed tip
      const tips = await archiver.getL2Tips();
      expect(tips.proposedCheckpoint.checkpoint.number).toEqual(CheckpointNumber(2));
      expect(tips.checkpointed.checkpoint.number).toEqual(CheckpointNumber(1));
      expect(tips.proposedCheckpoint.block.number).toBeGreaterThan(tips.checkpointed.block.number);
    }, 15_000);

    it('prunes blocks and clears stale pending checkpoint when slot ends', async () => {
      // Slot calculation: L2_slot = L1_block / 2 (since slotDuration=24, ethereumSlotDuration=12)
      // So: L1 blocks 0-1 → slot 0, L1 blocks 2-3 → slot 1, L1 blocks 4-5 → slot 2

      // Sync checkpoint 1 in slot 0
      const { checkpoint: cp1 } = await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 1n,
        messagesL1BlockNumber: 1n,
        numL1ToL2Messages: 3,
        slotNumber: SlotNumber(0),
      });
      const cp1Archive = cp1.blocks[cp1.blocks.length - 1].archive;
      fake.setL1BlockNumber(1n);
      await archiver.syncImmediate();

      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));
      const lastBlockInCheckpoint1 = cp1.blocks[cp1.blocks.length - 1].number;

      // Create provisional blocks for slot 1
      const provisionalBlocks = await fake.makeBlocks(CheckpointNumber(2), {
        l1BlockNumber: 2n,
        previousArchive: cp1Archive,
        slotNumber: SlotNumber(1),
      });

      for (const block of provisionalBlocks) {
        await archiver.addBlock(block);
      }

      const lastProvisionalBlockNumber = provisionalBlocks[provisionalBlocks.length - 1].number;
      expect(await archiver.getBlockNumber()).toEqual(lastProvisionalBlockNumber);

      // Set a proposed checkpoint (simulating pipelining)
      const proposedCheckpoint: ProposedCheckpointInput = {
        checkpointNumber: CheckpointNumber(2),
        header: CheckpointHeader.empty({ slotNumber: SlotNumber(1) }),
        startBlock: BlockNumber(lastBlockInCheckpoint1 + 1),
        blockCount: provisionalBlocks.length,
        totalManaUsed: 0n,
        feeAssetPriceModifier: 0n,
      };
      await archiver.addProposedCheckpoint(proposedCheckpoint);

      // Advance L1 to block 4 (slot 2), ending slot 1 without checkpoint on L1
      fake.setL1BlockNumber(4n);
      await archiver.syncImmediate();

      // Prune event should have been emitted
      expect(pruneSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: L2BlockSourceEvents.L2PruneUncheckpointed,
          slotNumber: SlotNumber(1),
          blocks: expect.arrayContaining(provisionalBlocks.map(b => expect.objectContaining({ number: b.number }))),
        }),
      );

      // Block number should revert to last checkpointed block
      expect(await archiver.getBlockNumber()).toEqual(lastBlockInCheckpoint1);
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Proposed checkpoint should be cleared, so proposed tip falls back to checkpointed tip
      expect(await archiverStore.blocks.getLastProposedCheckpoint()).toBeUndefined();
      const tips = await archiver.getL2Tips();
      expect(tips.proposedCheckpoint.checkpoint.number).toEqual(tips.checkpointed.checkpoint.number);
      expect(tips.proposedCheckpoint.block.number).toEqual(tips.checkpointed.block.number);
    }, 15_000);
  });

  describe('pruning orphan proposed blocks', () => {
    let pruneSpy: jest.Mock;

    // Slot the orphan block targets. With slotDuration=24, slot S starts at l1GenesisTime + S*24.
    const orphanSlot = SlotNumber(1);
    // Grace period and block duration configured for these tests (see the `config` object above).
    const graceSeconds = 2;
    const blockDuration = 2;

    beforeEach(() => {
      pruneSpy = jest.fn();
      archiver.events.on(L2BlockSourceEvents.L2PruneUncheckpointed, pruneSpy);
    });

    afterEach(() => {
      archiver.events.off(L2BlockSourceEvents.L2PruneUncheckpointed, pruneSpy);
    });

    // Wall-clock time (seconds) at which the orphan tip becomes prunable: the checkpoint receive
    // deadline plus the orphan-prune grace.
    const pruneDeadlineForSlot = (slot: SlotNumber) =>
      new ConsensusTimetable({ l1Constants, blockDuration }).getExpectedCheckpointLandTime(slot, graceSeconds);
    const pruneDeadline = () => pruneDeadlineForSlot(orphanSlot);

    // Syncs checkpoint 1 (slot 0), then writes uncheckpointed blocks for slot 1 (checkpoint 2) straight
    // into the store as a block-only tip with no matching proposed checkpoint. L1 is held at slot 1 so
    // the L1-sync prune (which only fires once the build slot has ended on L1) stays out of the way.
    const setupOrphanTip = async (targetArchiver: Archiver = archiver) => {
      const { checkpoint: cp1 } = await fake.addCheckpoint(CheckpointNumber(1), {
        l1BlockNumber: 1n,
        messagesL1BlockNumber: 1n,
        numL1ToL2Messages: 3,
        slotNumber: SlotNumber(0),
      });
      const cp1Archive = cp1.blocks.at(-1)!.archive;
      fake.setL1BlockNumber(1n);
      await targetArchiver.syncImmediate();
      expect(await targetArchiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));

      const lastBlockInCp1 = cp1.blocks.at(-1)!.number;
      const provisionalBlocks = await fake.makeBlocks(CheckpointNumber(2), {
        l1BlockNumber: 2n,
        previousArchive: cp1Archive,
        slotNumber: orphanSlot,
      });
      for (const block of provisionalBlocks) {
        await targetArchiver.addBlock(block);
      }

      // Hold L1 at slot 1 so the slot has not ended from L1's perspective.
      fake.setL1BlockNumber(2n);
      return { lastBlockInCp1, lastProvisional: provisionalBlocks.at(-1)!.number, provisionalBlocks };
    };

    const makeProposedCheckpoint = (lastBlockInCp1: BlockNumber, blockCount: number): ProposedCheckpointInput => ({
      checkpointNumber: CheckpointNumber(2),
      header: CheckpointHeader.empty({ slotNumber: orphanSlot }),
      startBlock: BlockNumber(lastBlockInCp1 + 1),
      blockCount,
      totalManaUsed: 0n,
      feeAssetPriceModifier: 0n,
    });

    it('does not prune before the grace window elapses', async () => {
      const { lastProvisional } = await setupOrphanTip();

      dateProvider.setTime((pruneDeadline() - 1) * 1000);
      await archiver.syncImmediate();

      expect(pruneSpy).not.toHaveBeenCalled();
      expect(await archiver.getBlockNumber()).toEqual(lastProvisional);
    }, 15_000);

    it('does not prune the orphan tip exactly at the deadline', async () => {
      const { lastProvisional } = await setupOrphanTip();

      // The checkpoint may still legitimately land at exactly its expected land time, so the orphan tip
      // must survive this instant. Pruning only happens strictly past the deadline.
      dateProvider.setTime(pruneDeadline() * 1000);
      await archiver.syncImmediate();

      expect(pruneSpy).not.toHaveBeenCalled();
      expect(await archiver.getBlockNumber()).toEqual(lastProvisional);
    }, 15_000);

    it('prunes the orphan tip once the grace window elapses', async () => {
      const { lastBlockInCp1, provisionalBlocks } = await setupOrphanTip();

      dateProvider.setTime((pruneDeadline() + 1) * 1000);
      await archiver.syncImmediate();

      expect(pruneSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: L2BlockSourceEvents.L2PruneUncheckpointed,
          slotNumber: orphanSlot,
          blocks: expect.arrayContaining(provisionalBlocks.map(b => expect.objectContaining({ number: b.number }))),
        }),
      );
      expect(await archiver.getBlockNumber()).toEqual(lastBlockInCp1);
      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));
    }, 15_000);

    it('does not prune the orphan tip when pruning is disabled (automine)', async () => {
      // The non-pipelined automine sequencer disables orphan pruning: it publishes each checkpoint
      // in-slot, so an uncheckpointed tip is only the transient gap between its addBlock and
      // addProposedCheckpoint, which pruning must not touch. The same scenario that prunes in the
      // test above must be a no-op when pruning is off, even well past the grace window.
      const { archiver: noPruneArchiver } = await buildArchiver('archiver_orphan_no_prune', {
        enableOrphanProposedBlockPruning: false,
      });
      const noPruneSpy = jest.fn();
      noPruneArchiver.events.on(L2BlockSourceEvents.L2PruneUncheckpointed, noPruneSpy);
      try {
        const { lastProvisional } = await setupOrphanTip(noPruneArchiver);

        dateProvider.setTime((pruneDeadline() + 100) * 1000);
        await noPruneArchiver.syncImmediate();

        expect(noPruneSpy).not.toHaveBeenCalled();
        expect(await noPruneArchiver.getBlockNumber()).toEqual(lastProvisional);
      } finally {
        noPruneArchiver.events.off(L2BlockSourceEvents.L2PruneUncheckpointed, noPruneSpy);
        await noPruneArchiver.stop();
      }
    }, 15_000);

    it('does not prune when a matching proposed checkpoint exists', async () => {
      const { lastBlockInCp1, lastProvisional, provisionalBlocks } = await setupOrphanTip();

      await archiver.addProposedCheckpoint(makeProposedCheckpoint(lastBlockInCp1, provisionalBlocks.length));

      dateProvider.setTime((pruneDeadline() + 100) * 1000);
      await archiver.syncImmediate();

      expect(pruneSpy).not.toHaveBeenCalled();
      expect(await archiver.getBlockNumber()).toEqual(lastProvisional);
      expect(await archiverStore.blocks.getLastProposedCheckpoint()).toBeDefined();
    }, 15_000);

    it('processes a queued proposed checkpoint before pruning, sparing the tip', async () => {
      const { lastBlockInCp1, lastProvisional, provisionalBlocks } = await setupOrphanTip();

      // Past the grace window: without the matching checkpoint the next sync would prune the tip.
      dateProvider.setTime((pruneDeadline() + 100) * 1000);

      // Queue the proposed checkpoint. The triggered sync drains the inbound queue (storing the
      // checkpoint) before running the orphan prune, so the prune sees it and stands down. If the
      // order were reversed, this sync would prune the tip before storing the checkpoint.
      await archiver.addProposedCheckpoint(makeProposedCheckpoint(lastBlockInCp1, provisionalBlocks.length));
      await archiver.syncImmediate();

      expect(pruneSpy).not.toHaveBeenCalled();
      expect(await archiver.getBlockNumber()).toEqual(lastProvisional);
      expect(await archiverStore.blocks.getLastProposedCheckpoint()).toBeDefined();
    }, 15_000);

    it('prunes only the orphan suffix after a covered pending checkpoint', async () => {
      const { lastBlockInCp1, provisionalBlocks: checkpointTwoBlocks } = await setupOrphanTip();

      await archiver.addProposedCheckpoint(makeProposedCheckpoint(lastBlockInCp1, checkpointTwoBlocks.length));

      const orphanSuffixSlot = SlotNumber(orphanSlot + 1);
      const { checkpoint: orphanSuffixCheckpoint } = await mockCheckpointAndMessages(CheckpointNumber(3), {
        startBlockNumber: BlockNumber(checkpointTwoBlocks.at(-1)!.number + 1),
        numBlocks: 1,
        previousArchive: checkpointTwoBlocks.at(-1)!.archive,
        slotNumber: orphanSuffixSlot,
      });
      const orphanSuffixBlocks = orphanSuffixCheckpoint.blocks;
      for (const block of orphanSuffixBlocks) {
        await archiver.addBlock(block);
      }

      dateProvider.setTime((pruneDeadlineForSlot(orphanSuffixSlot) + 1) * 1000);
      await archiver.syncImmediate();

      expect(pruneSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: L2BlockSourceEvents.L2PruneUncheckpointed,
          slotNumber: orphanSuffixSlot,
          blocks: expect.arrayContaining(orphanSuffixBlocks.map(b => expect.objectContaining({ number: b.number }))),
        }),
      );
      expect(await archiver.getBlockNumber()).toEqual(checkpointTwoBlocks.at(-1)!.number);
      expect(await archiverStore.blocks.getProposedCheckpointByNumber(CheckpointNumber(2))).toBeDefined();
      expect(await archiverStore.blocks.getProposedCheckpointByNumber(CheckpointNumber(3))).toBeUndefined();
    }, 15_000);
  });
});
