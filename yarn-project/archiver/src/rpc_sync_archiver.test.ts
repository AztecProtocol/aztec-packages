import type { BlobClientInterface } from '@aztec/blob-client/client';
import { GENESIS_ARCHIVE_ROOT } from '@aztec/constants';
import type { EpochCache, EpochCommitteeInfo } from '@aztec/epoch-cache';
import { DefaultL1ContractsConfig } from '@aztec/ethereum/config';
import type { InboxContract, RollupContract } from '@aztec/ethereum/contracts';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { TestDateProvider } from '@aztec/foundation/timer';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { EventEmitter } from 'events';
import { type MockProxy, mock } from 'jest-mock-extended';

import { Archiver, type ArchiverEmitter } from './archiver.js';
import type { ArchiverInstrumentation } from './modules/instrumentation.js';
import { ArchiverL1Synchronizer } from './modules/l1_synchronizer.js';
import { RpcSyncArchiver } from './rpc_sync_archiver.js';
import { KVArchiverDataStore } from './store/kv_archiver_store.js';
import { L2TipsCache } from './store/l2_tips_cache.js';
import { FakeL1State } from './test/fake_l1_state.js';

describe('RpcSyncArchiver', () => {
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
  let upstreamInstrumentation: MockProxy<ArchiverInstrumentation>;
  let dateProvider: TestDateProvider;
  let upstreamStore: KVArchiverDataStore;
  let followerStore: KVArchiverDataStore;
  let l1Constants: L1RollupConstants & { l1StartBlockHash: Buffer32; genesisArchiveRoot: Fr };
  let upstream: Archiver;
  let follower: RpcSyncArchiver;
  let synchronizer: ArchiverL1Synchronizer;

  const GENESIS_ROOT = new Fr(GENESIS_ARCHIVE_ROOT);

  beforeEach(async () => {
    const now = Math.floor(Date.now() / 1000);
    dateProvider = new TestDateProvider();

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

    fake = new FakeL1State({ ...l1Constants, rollupAddress, inboxAddress });
    publicClient = fake.createMockPublicClient();
    blobClient = fake.createMockBlobClient();
    epochCache = mock<EpochCache>();
    epochCache.getCommitteeForEpoch.mockResolvedValue({ committee: [] as EthAddress[] } as EpochCommitteeInfo);

    const tracer = getTelemetryClient().getTracer('');
    upstreamInstrumentation = mock<ArchiverInstrumentation>({ isEnabled: () => true, tracer });

    upstreamStore = new KVArchiverDataStore(await openTmpStore('rpc_sync_upstream'), 1000);
    followerStore = new KVArchiverDataStore(await openTmpStore('rpc_sync_follower'), 1000);

    rollupContract = fake.createMockRollupContract(publicClient);
    inboxContract = fake.createMockInboxContract(publicClient);

    const upstreamConfig = {
      pollingIntervalMs: 1000,
      batchSize: 1000,
      maxAllowedEthClientDriftSeconds: 300,
      ethereumAllowNoDebugHosts: true,
      skipHistoricalLogsCheck: true,
    };

    const events = new EventEmitter() as ArchiverEmitter;
    const l2TipsCache = new L2TipsCache(upstreamStore.blockStore);

    synchronizer = new ArchiverL1Synchronizer(
      publicClient,
      publicClient,
      rollupContract,
      inboxContract,
      upstreamStore,
      upstreamConfig,
      blobClient,
      epochCache,
      dateProvider,
      upstreamInstrumentation,
      l1Constants,
      events,
      upstreamInstrumentation.tracer,
      l2TipsCache,
      createLogger('archiver:upstream-sync:test'),
    );

    upstream = new Archiver(
      publicClient,
      publicClient,
      rollupContract,
      { rollupAddress, registryAddress, inboxAddress, governanceProposerAddress, slashingProposerAddress },
      upstreamStore,
      upstreamConfig,
      blobClient,
      upstreamInstrumentation,
      l1Constants,
      synchronizer,
      events,
      l2TipsCache,
    );

    follower = new RpcSyncArchiver(
      upstream,
      followerStore,
      { rollupAddress, registryAddress, inboxAddress, governanceProposerAddress, slashingProposerAddress },
      l1Constants,
      { pollingIntervalMs: 1000, batchSize: 1000 },
      new EventEmitter() as ArchiverEmitter,
    );
  });

  afterEach(async () => {
    await follower?.stop();
    await upstream?.stop();
  });

  /** Syncs the upstream from L1 and then triggers the follower to sync from the upstream. */
  const syncBoth = async () => {
    await upstream.syncImmediate();
    await follower.syncImmediate();
  };

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

    expect(await follower.getSynchedCheckpointNumber()).toBe(CheckpointNumber(2));
    expect(await follower.getL1ToL2Messages(CheckpointNumber(1))).toEqual(msgs1);
    expect(await follower.getL1ToL2Messages(CheckpointNumber(2))).toEqual(msgs2);

    const upstreamTips = await upstream.getL2Tips();
    const followerTips = await follower.getL2Tips();
    expect(followerTips.proposed.number).toBe(upstreamTips.proposed.number);
    expect(followerTips.proposed.hash).toBe(upstreamTips.proposed.hash);
    expect(followerTips.checkpointed.block.number).toBe(upstreamTips.checkpointed.block.number);
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

    await syncBoth();

    expect(await upstream.getProvenCheckpointNumber()).toBe(CheckpointNumber(2));
    expect(await follower.getProvenCheckpointNumber()).toBe(CheckpointNumber(2));
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
    expect(await follower.getSynchedCheckpointNumber()).toBe(CheckpointNumber(2));

    // Unwind checkpoint 2 on the upstream (simulating an L1 reorg that removed it).
    fake.removeCheckpoint(CheckpointNumber(2));
    fake.setL1BlockNumber(2530n);

    await syncBoth();

    expect(await upstream.getSynchedCheckpointNumber()).toBe(CheckpointNumber(1));
    expect(await follower.getSynchedCheckpointNumber()).toBe(CheckpointNumber(1));

    const upstreamTips = await upstream.getL2Tips();
    const followerTips = await follower.getL2Tips();
    expect(followerTips.checkpointed.block.number).toBe(upstreamTips.checkpointed.block.number);
    expect(followerTips.checkpointed.block.hash).toBe(upstreamTips.checkpointed.block.hash);
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

    const tipsAfterIdempotent = await follower.getL2Tips();
    expect(tipsAfterIdempotent).toEqual(tipsAfterFirst);
  });
});
