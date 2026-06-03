import type { BlobClientInterface } from '@aztec/blob-client/client';
import type { OutboxContract, RollupContract } from '@aztec/ethereum/contracts';
import type { ViemPublicClient, ViemPublicDebugClient } from '@aztec/ethereum/types';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { DateProvider } from '@aztec/foundation/timer';
import type { FunctionsOf } from '@aztec/foundation/types';
import type { ArchiverEmitter, BlockHash } from '@aztec/stdlib/block';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import type { BlockHeader } from '@aztec/stdlib/tx';
import { type TelemetryClient, type Tracer, getTelemetryClient } from '@aztec/telemetry-client';

import { mock } from 'jest-mock-extended';
import { EventEmitter } from 'node:events';

import { Archiver } from '../archiver.js';
import { ArchiverInstrumentation } from '../modules/instrumentation.js';
import type { ArchiverL1Synchronizer } from '../modules/l1_synchronizer.js';
import type { ArchiverDataStores } from '../store/data_stores.js';
import { L2TipsCache } from '../store/l2_tips_cache.js';

/** Noop L1 synchronizer for testing without L1 connectivity. */
class NoopL1Synchronizer implements FunctionsOf<ArchiverL1Synchronizer> {
  public readonly tracer: Tracer;

  constructor(tracer: Tracer) {
    this.tracer = tracer;
  }

  setConfig(_config: unknown) {}
  getL1BlockNumber(): bigint | undefined {
    return 0n;
  }
  getL1Timestamp(): bigint | undefined {
    return undefined;
  }
  testEthereumNodeSynced(): Promise<void> {
    return Promise.resolve();
  }
  syncFromL1(_initialSyncComplete: boolean): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Archiver with mocked L1 connectivity for testing.
 * Uses mock L1 clients and a noop synchronizer, enabling tests that
 * don't require real Ethereum connectivity.
 */
export class NoopL1Archiver extends Archiver {
  constructor(
    dataStores: ArchiverDataStores,
    l1Constants: L1RollupConstants & { genesisArchiveRoot: Fr },
    instrumentation: ArchiverInstrumentation,
    initialHeader: BlockHeader,
    initialBlockHash: BlockHash,
    l2TipsCache: L2TipsCache,
    dateProvider: DateProvider = new DateProvider(),
  ) {
    // Create mocks for L1 clients
    const publicClient = mock<ViemPublicClient>();
    const debugClient = mock<ViemPublicDebugClient>();
    const rollup = mock<RollupContract>();
    const outbox = mock<OutboxContract>();
    const blobClient = mock<BlobClientInterface>();

    // Mock methods called during start()
    blobClient.testSources.mockResolvedValue();
    publicClient.getBlockNumber.mockResolvedValue(1n);

    const events = new EventEmitter() as ArchiverEmitter;
    const synchronizer = new NoopL1Synchronizer(instrumentation.tracer);

    super(
      publicClient,
      debugClient,
      rollup,
      outbox,
      {
        rollupAddress: EthAddress.ZERO,
        registryAddress: EthAddress.ZERO,
        inboxAddress: EthAddress.ZERO,
        governanceProposerAddress: EthAddress.ZERO,
        slashingProposerAddress: EthAddress.ZERO,
      },
      dataStores,
      {
        pollingIntervalMs: 1000,
        batchSize: 100,
        skipValidateCheckpointAttestations: true,
        maxAllowedEthClientDriftSeconds: 300,
        ethereumAllowNoDebugHosts: true, // Skip trace validation
        skipHistoricalLogsCheck: true, // Skip historical logs validation
        orphanProposedBlockPruneGraceSeconds: 2,
        enableOrphanProposedBlockPruning: true,
      },
      blobClient,
      instrumentation,
      { ...l1Constants, l1StartBlockHash: Buffer32.random() },
      synchronizer as ArchiverL1Synchronizer,
      events,
      initialHeader,
      initialBlockHash,
      l2TipsCache,
      dateProvider,
    );
  }

  /** Override start to skip L1 validation checks. */
  public override start(_blockUntilSynced?: boolean): Promise<void> {
    // Just start the running promise without L1 checks
    this.runningPromise.start();
    return Promise.resolve();
  }

  /** Always reports as fully synced since there is no real L1 to sync from. */
  public override getSyncedL2SlotNumber(): Promise<SlotNumber | undefined> {
    return Promise.resolve(SlotNumber(Number.MAX_SAFE_INTEGER));
  }
}

/** Creates an archiver with mocked L1 connectivity for testing. */
export async function createNoopL1Archiver(
  dataStores: ArchiverDataStores,
  l1Constants: L1RollupConstants & { genesisArchiveRoot: Fr },
  telemetry: TelemetryClient = getTelemetryClient(),
  initialHeader: BlockHeader,
  dateProvider?: DateProvider,
): Promise<NoopL1Archiver> {
  const instrumentation = await ArchiverInstrumentation.new(telemetry, () => dataStores.db.estimateSize());
  // Mirror the production factory: precompute the dynamic genesis block hash from the injected
  // initial header so `L2TipsCache` reports the correct tip hash at block 0. Without this, the
  // cache falls back to the static `GENESIS_BLOCK_HEADER_HASH`, which only matches deployments
  // with default empty genesis.
  const initialBlockHash = await initialHeader.hash();
  const l2TipsCache = new L2TipsCache(dataStores.blocks, initialBlockHash);
  return new NoopL1Archiver(
    dataStores,
    l1Constants,
    instrumentation,
    initialHeader,
    initialBlockHash,
    l2TipsCache,
    dateProvider,
  );
}
