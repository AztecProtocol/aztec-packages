import type { BlobClientInterface } from '@aztec/blob-client/client';
import { GENESIS_ARCHIVE_ROOT } from '@aztec/constants';
import type { EpochCache, EpochCommitteeInfo } from '@aztec/epoch-cache';
import { DefaultL1ContractsConfig } from '@aztec/ethereum/config';
import type { InboxContract, OutboxContract, RollupContract } from '@aztec/ethereum/contracts';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { TestDateProvider } from '@aztec/foundation/timer';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import {
  type ArchiverEmitter,
  type BlockHash,
  type L2Block,
  L2BlockSourceEvents,
  type L2TipId,
} from '@aztec/stdlib/block';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { InboxLeaf } from '@aztec/stdlib/messaging';
import { BlockHeader } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { type MockProxy, mock } from 'jest-mock-extended';

import { Archiver } from './archiver.js';
import { L1ToL2MessagesNotReadyError } from './errors.js';
import type { ArchiverInstrumentation } from './modules/instrumentation.js';
import { ArchiverL1Synchronizer } from './modules/l1_synchronizer.js';
import { RpcSyncArchiver, type RpcSyncArchiverSource } from './rpc_sync_archiver.js';
import { type ArchiverDataStores, createArchiverDataStores } from './store/data_stores.js';
import { L2TipsCache } from './store/l2_tips_cache.js';
import { FakeL1State } from './test/fake_l1_state.js';

describe('RpcSyncArchiver', () => {
  const rollupAddress = EthAddress.random();
  const inboxAddress = EthAddress.random();
  const registryAddress = EthAddress.random();
  const governanceProposerAddress = EthAddress.random();
  const slashingProposerAddress = EthAddress.random();
  const l1Addresses = {
    rollupAddress,
    registryAddress,
    inboxAddress,
    governanceProposerAddress,
    slashingProposerAddress,
  };

  let fake: FakeL1State;
  let publicClient: MockProxy<ViemPublicClient>;
  let blobClient: MockProxy<BlobClientInterface>;
  let epochCache: MockProxy<EpochCache>;
  let rollupContract: MockProxy<RollupContract>;
  let inboxContract: MockProxy<InboxContract>;
  let instrumentation: MockProxy<ArchiverInstrumentation>;
  let dateProvider: TestDateProvider;
  let l1Constants: L1RollupConstants & { l1StartBlockHash: Buffer32; genesisArchiveRoot: Fr };

  let initialHeader: BlockHeader;
  let initialBlockHash: BlockHash;

  let upstream: Archiver;
  let upstreamStores: ArchiverDataStores;
  let follower: RpcSyncArchiver;
  let followerStores: ArchiverDataStores;
  let followerEvents: ArchiverEmitter;

  /** Flips the wrapper source below into failing mode, so tests can simulate an unreachable upstream. */
  let upstreamUnavailable: boolean;

  const GENESIS_ROOT = new Fr(GENESIS_ARCHIVE_ROOT);
  const FOLLOWER_CONFIG = { pollingIntervalMs: 50, batchSize: 50 };

  /** Builds the upstream archiver (a real Archiver over the fake L1 state) with its own store. */
  const buildUpstream = async (): Promise<Archiver> => {
    const stores = createArchiverDataStores(await openTmpStore('rpc_sync_upstream'), initialBlockHash);
    upstreamStores = stores;
    const config = {
      pollingIntervalMs: 1000,
      batchSize: 1000,
      maxAllowedEthClientDriftSeconds: 300,
      ethereumAllowNoDebugHosts: true,
      skipHistoricalLogsCheck: true,
      checkpointProposalSyncGrace: 4,
      orphanPruneNoProposalTolerance: 1,
      skipOrphanProposedBlockPruning: true,
      blockDuration: 2,
    };
    const events = new EventEmitter() as ArchiverEmitter;
    const l2TipsCache = new L2TipsCache(stores.blocks, initialBlockHash);

    const synchronizer = new ArchiverL1Synchronizer(
      publicClient,
      publicClient,
      rollupContract,
      inboxContract,
      stores,
      config,
      blobClient,
      epochCache,
      dateProvider,
      instrumentation,
      l1Constants,
      events,
      instrumentation.tracer,
      l2TipsCache,
      createLogger('archiver:upstream-l1-sync:test'),
    );

    return new Archiver(
      publicClient,
      publicClient,
      rollupContract,
      mock<OutboxContract>(),
      l1Addresses,
      stores,
      config,
      blobClient,
      instrumentation,
      l1Constants,
      synchronizer,
      events,
      initialHeader,
      initialBlockHash,
      l2TipsCache,
      dateProvider,
    );
  };

  /** Wraps the upstream so tests can make it unreachable without touching the archiver itself. */
  const makeSource = (): RpcSyncArchiverSource => ({
    getL2Tips: () => (upstreamUnavailable ? Promise.reject(new Error('upstream unavailable')) : upstream.getL2Tips()),
    getBlocks: query => upstream.getBlocks(query),
    getBlockData: query => upstream.getBlockData(query),
    getCheckpoints: query => upstream.getCheckpoints(query),
    getProposedCheckpointData: query => upstream.getProposedCheckpointData(query),
    getL1ToL2Messages: checkpointNumber => upstream.getL1ToL2Messages(checkpointNumber),
    getL2ToL1MembershipWitness: (txHash, message, messageIndexInTx) =>
      upstream.getL2ToL1MembershipWitness(txHash, message, messageIndexInTx),
  });

  /** Builds a follower over the given stores, so warm-restart tests can reuse a populated store. */
  const buildFollower = (stores: ArchiverDataStores, events: ArchiverEmitter): RpcSyncArchiver =>
    new RpcSyncArchiver(
      makeSource(),
      stores,
      l1Addresses,
      l1Constants,
      FOLLOWER_CONFIG,
      events,
      initialHeader,
      initialBlockHash,
      new L2TipsCache(stores.blocks, initialBlockHash),
      dateProvider,
      getTelemetryClient(),
      createLogger('archiver:rpc-sync:test'),
    );

  beforeEach(async () => {
    const now = Math.floor(Date.now() / 1000);
    dateProvider = new TestDateProvider();
    upstreamUnavailable = false;

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

    initialHeader = BlockHeader.empty();
    initialBlockHash = await initialHeader.hash();

    fake = new FakeL1State({ ...l1Constants, rollupAddress, inboxAddress });
    publicClient = fake.createMockPublicClient();
    blobClient = fake.createMockBlobClient();
    epochCache = mock<EpochCache>();
    epochCache.getCommitteeForEpoch.mockResolvedValue({ committee: [] as EthAddress[] } as EpochCommitteeInfo);
    instrumentation = mock<ArchiverInstrumentation>({
      isEnabled: () => true,
      tracer: getTelemetryClient().getTracer(''),
    });
    rollupContract = fake.createMockRollupContract(publicClient);
    inboxContract = fake.createMockInboxContract(publicClient);

    upstream = await buildUpstream();
    followerStores = createArchiverDataStores(await openTmpStore('rpc_sync_follower'), initialBlockHash);
    followerEvents = new EventEmitter() as ArchiverEmitter;
    follower = buildFollower(followerStores, followerEvents);
  });

  afterEach(async () => {
    // The follower deliberately does not close the stores it did not open, so the test owns them.
    await follower?.stop();
    await upstream?.stop();
    await followerStores?.db.close();
    await upstreamStores?.db.close();
  });

  /** Syncs the upstream from L1 and then triggers the follower to sync from the upstream. */
  const syncBoth = async () => {
    await upstream.syncImmediate();
    await follower.syncImmediate();
  };

  /** Builds a chain-pruned event payload targeting the given block, with both tiers pinned to that block. */
  const prunedEventTips = (checkpointNumber: CheckpointNumber, blockNumber: BlockNumber): L2TipId => ({
    block: { number: blockNumber, hash: '' },
    checkpoint: { number: checkpointNumber, hash: '' },
  });

  it('syncs checkpoints and messages from an upstream archiver', async () => {
    const { messages: msgs1 } = await fake.addCheckpoint(CheckpointNumber(1), {
      l1BlockNumber: 101n,
      messagesL1BlockNumber: 98n,
      numL1ToL2Messages: 3,
    });
    const { messages: msgs2 } = await fake.addCheckpoint(CheckpointNumber(2), {
      l1BlockNumber: 2507n,
      messagesL1BlockNumber: 2504n,
      numL1ToL2Messages: 2,
    });
    fake.setL1BlockNumber(2520n);

    await syncBoth();

    expect(await follower.getCheckpointNumber()).toBe(CheckpointNumber(2));
    expect(await follower.getL1ToL2Messages(CheckpointNumber(1))).toEqual(msgs1);
    expect(await follower.getL1ToL2Messages(CheckpointNumber(2))).toEqual(msgs2);

    const upstreamTips = await upstream.getL2Tips();
    const followerTips = await follower.getL2Tips();
    expect(followerTips.proposed).toEqual(upstreamTips.proposed);
    expect(followerTips.checkpointed).toEqual(upstreamTips.checkpointed);
    expect(follower.getHealth().caughtUp).toBe(true);
    expect(follower.isInitialSyncComplete()).toBe(true);
  });

  it('persists L1 to L2 messages locally so they can be looked up by index', async () => {
    const { messages } = await fake.addCheckpoint(CheckpointNumber(1), {
      l1BlockNumber: 101n,
      messagesL1BlockNumber: 98n,
      numL1ToL2Messages: 2,
    });
    fake.setL1BlockNumber(200n);

    await syncBoth();

    // Messages are replicated into the local store, not proxied, so the index lookup works locally.
    const firstIndex = InboxLeaf.smallestIndexForCheckpoint(CheckpointNumber(1));
    expect(await followerStores.messages.getTotalL1ToL2MessageCount()).toBe(2n);
    expect(await follower.getL1ToL2MessageIndex(messages[0])).toBe(firstIndex);
    expect(await follower.getL1ToL2MessageIndex(messages[1])).toBe(firstIndex + 1n);
    expect(await follower.getL1ToL2MessageIndex(Fr.random())).toBeUndefined();

    // A checkpoint we have not replicated yet is reported as not-ready rather than as an empty message set.
    await expect(follower.getL1ToL2Messages(CheckpointNumber(2))).rejects.toThrow(L1ToL2MessagesNotReadyError);
  });

  it('propagates chain-proven updates', async () => {
    await fake.addCheckpoint(CheckpointNumber(1), {
      l1BlockNumber: 101n,
      messagesL1BlockNumber: 98n,
      numL1ToL2Messages: 1,
    });
    await fake.addCheckpoint(CheckpointNumber(2), {
      l1BlockNumber: 2507n,
      messagesL1BlockNumber: 2504n,
      numL1ToL2Messages: 1,
    });
    fake.markCheckpointAsProven(CheckpointNumber(2));
    fake.setL1BlockNumber(2520n);

    const onProven = jest.fn();
    followerEvents.on(L2BlockSourceEvents.L2BlockProven, onProven);

    await syncBoth();

    expect(await upstream.getProvenCheckpointNumber()).toBe(CheckpointNumber(2));
    expect(await follower.getProvenCheckpointNumber()).toBe(CheckpointNumber(2));
    expect(onProven).toHaveBeenCalledTimes(1);
  });

  it('handles chain-pruned when the upstream reorgs a checkpoint', async () => {
    await fake.addCheckpoint(CheckpointNumber(1), {
      l1BlockNumber: 101n,
      messagesL1BlockNumber: 98n,
      numL1ToL2Messages: 1,
    });
    await fake.addCheckpoint(CheckpointNumber(2), {
      l1BlockNumber: 2507n,
      messagesL1BlockNumber: 2504n,
      numL1ToL2Messages: 1,
    });
    fake.setL1BlockNumber(2520n);

    await syncBoth();
    expect(await follower.getCheckpointNumber()).toBe(CheckpointNumber(2));

    // Unwind checkpoint 2 on the upstream (simulating an L1 reorg that removed it).
    fake.removeCheckpoint(CheckpointNumber(2));
    fake.setL1BlockNumber(2530n);

    await syncBoth();

    expect(await upstream.getCheckpointNumber()).toBe(CheckpointNumber(1));
    expect(await follower.getCheckpointNumber()).toBe(CheckpointNumber(1));
    // The messages of the rolled-back checkpoint are dropped along with it.
    await expect(follower.getL1ToL2Messages(CheckpointNumber(2))).rejects.toThrow(L1ToL2MessagesNotReadyError);

    const upstreamTips = await upstream.getL2Tips();
    const followerTips = await follower.getL2Tips();
    expect(followerTips.checkpointed).toEqual(upstreamTips.checkpointed);
  });

  it('is idempotent on repeated syncs with no upstream changes', async () => {
    await fake.addCheckpoint(CheckpointNumber(1), {
      l1BlockNumber: 101n,
      messagesL1BlockNumber: 98n,
      numL1ToL2Messages: 2,
    });
    fake.setL1BlockNumber(200n);

    await syncBoth();
    const tipsAfterFirst = await follower.getL2Tips();

    await follower.syncImmediate();
    await follower.syncImmediate();

    expect(await follower.getL2Tips()).toEqual(tipsAfterFirst);
    expect(await followerStores.messages.getTotalL1ToL2MessageCount()).toBe(2n);
  });

  it('marks initial sync complete via polling when started with blockUntilSync=false', async () => {
    await fake.addCheckpoint(CheckpointNumber(1), {
      l1BlockNumber: 101n,
      messagesL1BlockNumber: 98n,
      numL1ToL2Messages: 1,
    });
    fake.setL1BlockNumber(200n);
    await upstream.syncImmediate();

    expect(follower.isInitialSyncComplete()).toBe(false);

    await follower.start(false);
    await follower.waitForInitialSync();

    expect(follower.isInitialSyncComplete()).toBe(true);
    expect(await follower.getCheckpointNumber()).toBe(CheckpointNumber(1));
  });

  it('syncs multi-block checkpoints', async () => {
    await fake.addCheckpoint(CheckpointNumber(1), {
      l1BlockNumber: 101n,
      messagesL1BlockNumber: 98n,
      numBlocks: 3,
      numL1ToL2Messages: 1,
    });
    fake.setL1BlockNumber(200n);

    await syncBoth();

    const upstreamTips = await upstream.getL2Tips();
    const followerTips = await follower.getL2Tips();
    expect(followerTips.proposed.number).toBe(upstreamTips.proposed.number);
    expect(followerTips.proposed.number).toBeGreaterThanOrEqual(3);
    for (let n = 1; n <= followerTips.proposed.number; n++) {
      const [upstreamBlock, followerBlock] = await Promise.all([
        upstream.getBlock({ number: BlockNumber(n) }),
        follower.getBlock({ number: BlockNumber(n) }),
      ]);
      expect(followerBlock).toBeDefined();
      expect(followerBlock!.archive.root.toString()).toBe(upstreamBlock!.archive.root.toString());
    }
  });

  it('replicates the upstream proposed checkpoints to follow a pipelined chain', async () => {
    await fake.addCheckpoint(CheckpointNumber(1), { l1BlockNumber: 101n, messagesL1BlockNumber: 98n });
    // Checkpoints 2 and 3 are built here only to obtain well-chained blocks: their L1 blocks stay far ahead of
    // the synced L1 tip, so neither is checkpointed as far as the upstream is concerned.
    const { checkpoint: proposed2 } = await fake.addCheckpoint(CheckpointNumber(2), {
      l1BlockNumber: 2001n,
      messagesL1BlockNumber: 1998n,
    });
    const { checkpoint: proposed3 } = await fake.addCheckpoint(CheckpointNumber(3), {
      l1BlockNumber: 3001n,
      messagesL1BlockNumber: 2998n,
    });
    fake.setL1BlockNumber(110n);
    await syncBoth();

    // Under proposer pipelining the upstream holds two uncheckpointed checkpoints at once: it has already
    // built checkpoint 3's blocks while checkpoint 2's L1 transaction is still in flight.
    for (const block of proposed2.blocks) {
      await upstream.addBlock(block);
    }
    await upstream.addProposedCheckpoint({
      checkpointNumber: CheckpointNumber(2),
      header: proposed2.header,
      startBlock: proposed2.blocks[0].number,
      blockCount: proposed2.blocks.length,
      totalManaUsed: 0n,
      feeAssetPriceModifier: 0n,
    });
    for (const block of proposed3.blocks) {
      await upstream.addBlock(block);
    }

    await follower.syncImmediate();

    // Without a local record of proposed checkpoint 2, the store rejects checkpoint 3's blocks outright and
    // the follower wedges one checkpoint behind its upstream.
    expect(await follower.getBlockNumber()).toEqual(proposed3.blocks.at(-1)!.number);
    expect(await follower.getCheckpointNumber()).toEqual(CheckpointNumber(1));
    expect(await follower.getProposedCheckpointData({ number: CheckpointNumber(2) })).toBeDefined();
    expect(follower.getHealth().lastError).toBeUndefined();
  });

  it('syncs checkpoints that carry zero messages', async () => {
    await fake.addCheckpoint(CheckpointNumber(1), {
      l1BlockNumber: 101n,
      messagesL1BlockNumber: 98n,
      numL1ToL2Messages: 0,
    });
    fake.setL1BlockNumber(200n);

    await syncBoth();

    expect(await follower.getCheckpointNumber()).toBe(CheckpointNumber(1));
    expect(await follower.getL1ToL2Messages(CheckpointNumber(1))).toEqual([]);
  });

  it('wipes local state on a chain-pruned event targeting block 0', async () => {
    await fake.addCheckpoint(CheckpointNumber(1), {
      l1BlockNumber: 101n,
      messagesL1BlockNumber: 98n,
      numL1ToL2Messages: 1,
    });
    fake.setL1BlockNumber(200n);
    await syncBoth();
    expect(await follower.getCheckpointNumber()).toBe(CheckpointNumber(1));

    const onPrune = jest.fn();
    followerEvents.on(L2BlockSourceEvents.L2PruneUnproven, onPrune);

    await follower.handleBlockStreamEvent({
      type: 'chain-pruned',
      block: { number: BlockNumber.ZERO, hash: '' },
      checkpointed: prunedEventTips(CheckpointNumber.ZERO, BlockNumber.ZERO),
      proven: prunedEventTips(CheckpointNumber.ZERO, BlockNumber.ZERO),
    });

    expect(await follower.getCheckpointNumber()).toBe(CheckpointNumber(0));
    expect(await follower.getBlockNumber()).toBe(0);
    expect(onPrune).toHaveBeenCalledTimes(1);
  });

  it('classifies a prune of the uncheckpointed tail as an uncheckpointed prune', async () => {
    await fake.addCheckpoint(CheckpointNumber(1), {
      l1BlockNumber: 101n,
      messagesL1BlockNumber: 98n,
      numBlocks: 2,
      numL1ToL2Messages: 1,
    });
    fake.setL1BlockNumber(200n);
    await syncBoth();

    const checkpointedTip = await follower.getBlockNumber({ tag: 'checkpointed' });
    expect(checkpointedTip).toBe(2);

    // Deliver two blocks of the not-yet-checkpointed next checkpoint, so the follower holds an uncheckpointed tail.
    const proposedBlocks: L2Block[] = await fake.makeBlocks(CheckpointNumber(2), { numBlocks: 2, l1BlockNumber: 210n });
    await follower.handleBlockStreamEvent({ type: 'blocks-added', blocks: proposedBlocks });
    expect(await follower.getBlockNumber()).toBe(4);

    const onPruneUncheckpointed = jest.fn();
    const onPruneUnproven = jest.fn();
    followerEvents.on(L2BlockSourceEvents.L2PruneUncheckpointed, onPruneUncheckpointed);
    followerEvents.on(L2BlockSourceEvents.L2PruneUnproven, onPruneUnproven);

    await follower.handleBlockStreamEvent({
      type: 'chain-pruned',
      block: { number: BlockNumber(2), hash: '' },
      checkpointed: prunedEventTips(CheckpointNumber(1), BlockNumber(2)),
      proven: prunedEventTips(CheckpointNumber.ZERO, BlockNumber.ZERO),
    });

    expect(await follower.getBlockNumber()).toBe(2);
    expect(await follower.getCheckpointNumber()).toBe(CheckpointNumber(1));
    expect(onPruneUncheckpointed).toHaveBeenCalledTimes(1);
    expect(onPruneUnproven).not.toHaveBeenCalled();
  });

  it('rolls back to the previous checkpoint boundary when the prune target is mid-checkpoint', async () => {
    await fake.addCheckpoint(CheckpointNumber(1), {
      l1BlockNumber: 101n,
      messagesL1BlockNumber: 98n,
      numBlocks: 2,
      numL1ToL2Messages: 1,
    });
    await fake.addCheckpoint(CheckpointNumber(2), {
      l1BlockNumber: 2507n,
      messagesL1BlockNumber: 2504n,
      numBlocks: 2,
      numL1ToL2Messages: 1,
    });
    fake.setL1BlockNumber(2520n);
    await syncBoth();
    expect(await follower.getBlockNumber()).toBe(4);

    const onPruneUnproven = jest.fn();
    followerEvents.on(L2BlockSourceEvents.L2PruneUnproven, onPruneUnproven);

    // Block 3 is the first block of checkpoint 2, so rolling back to it must drop checkpoint 2 entirely.
    await follower.handleBlockStreamEvent({
      type: 'chain-pruned',
      block: { number: BlockNumber(3), hash: '' },
      checkpointed: prunedEventTips(CheckpointNumber(1), BlockNumber(2)),
      proven: prunedEventTips(CheckpointNumber.ZERO, BlockNumber.ZERO),
    });

    expect(await follower.getCheckpointNumber()).toBe(CheckpointNumber(1));
    expect(await follower.getBlockNumber()).toBe(2);
    expect(onPruneUnproven).toHaveBeenCalledTimes(1);
  });

  it('advances the finalized tip on a chain-finalized event', async () => {
    await fake.addCheckpoint(CheckpointNumber(1), {
      l1BlockNumber: 101n,
      messagesL1BlockNumber: 98n,
      numL1ToL2Messages: 1,
    });
    fake.markCheckpointAsProven(CheckpointNumber(1));
    fake.setL1BlockNumber(200n);
    await syncBoth();

    const checkpointedBlockNumber = await follower.getBlockNumber({ tag: 'checkpointed' });
    expect(await followerStores.blocks.getFinalizedCheckpointNumber()).toBe(CheckpointNumber(0));

    await follower.handleBlockStreamEvent({
      type: 'chain-finalized',
      block: { number: BlockNumber(checkpointedBlockNumber!), hash: '' },
      checkpoint: { number: CheckpointNumber(1), hash: '' },
    });

    expect(await followerStores.blocks.getFinalizedCheckpointNumber()).toBe(CheckpointNumber(1));
  });

  it('reports an unreachable upstream through the health surface and recovers', async () => {
    await fake.addCheckpoint(CheckpointNumber(1), {
      l1BlockNumber: 101n,
      messagesL1BlockNumber: 98n,
      numL1ToL2Messages: 1,
    });
    fake.setL1BlockNumber(200n);
    await upstream.syncImmediate();

    upstreamUnavailable = true;
    await follower.syncImmediate();

    let health = follower.getHealth();
    expect(health.consecutiveFailures).toBe(1);
    expect(health.caughtUp).toBe(false);
    expect(health.initialSyncComplete).toBe(false);
    expect(health.lastError).toContain('upstream unavailable');
    expect(health.lastSuccessfulSyncAt).toBeUndefined();

    await follower.syncImmediate();
    expect(follower.getHealth().consecutiveFailures).toBe(2);

    upstreamUnavailable = false;
    await follower.syncImmediate();

    health = follower.getHealth();
    expect(health.consecutiveFailures).toBe(0);
    expect(health.lastError).toBeUndefined();
    expect(health.caughtUp).toBe(true);
    expect(health.lastSuccessfulSyncAt).toBeDefined();
    expect(await follower.getCheckpointNumber()).toBe(CheckpointNumber(1));
  });

  it('resolves initial sync on a warm store with no new upstream events', async () => {
    await fake.addCheckpoint(CheckpointNumber(1), {
      l1BlockNumber: 101n,
      messagesL1BlockNumber: 98n,
      numL1ToL2Messages: 1,
    });
    fake.setL1BlockNumber(200n);
    await syncBoth();
    await follower.stop();

    // Restart over the already-populated store: no events are emitted, so initial sync must be decided by the
    // end-of-cycle catch-up check rather than by observing an event.
    const restarted = buildFollower(followerStores, new EventEmitter() as ArchiverEmitter);
    try {
      await restarted.start(true);
      expect(restarted.isInitialSyncComplete()).toBe(true);
      expect(await restarted.getCheckpointNumber()).toBe(CheckpointNumber(1));
    } finally {
      await restarted.stop();
    }
  });
});
