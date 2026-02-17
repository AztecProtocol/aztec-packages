import type { BlobClientInterface } from '@aztec/blob-client/client';
import type { RollupContract } from '@aztec/ethereum/contracts';
import type { ViemPublicClient, ViemPublicDebugClient } from '@aztec/ethereum/types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { FunctionsOf } from '@aztec/foundation/types';
import type { ArchiverEmitter } from '@aztec/stdlib/block';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { type TelemetryClient, type Tracer, getTelemetryClient } from '@aztec/telemetry-client';

import { mock } from 'jest-mock-extended';
import { EventEmitter } from 'node:events';

import { Archiver } from '../archiver.js';
import { ArchiverInstrumentation } from '../modules/instrumentation.js';
import type { ArchiverL1Synchronizer } from '../modules/l1_synchronizer.js';
import type { KVArchiverDataStore } from '../store/kv_archiver_store.js';

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
    return 0n;
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
    dataStore: KVArchiverDataStore,
    l1Constants: L1RollupConstants & { genesisArchiveRoot: Fr },
    instrumentation: ArchiverInstrumentation,
  ) {
    // Create mocks for L1 clients
    const publicClient = mock<ViemPublicClient>();
    const debugClient = mock<ViemPublicDebugClient>();
    const rollup = mock<RollupContract>();
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
      {
        registryAddress: EthAddress.ZERO,
        governanceProposerAddress: EthAddress.ZERO,
        slashFactoryAddress: EthAddress.ZERO,
        slashingProposerAddress: EthAddress.ZERO,
      },
      dataStore,
      {
        pollingIntervalMs: 1000,
        batchSize: 100,
        skipValidateCheckpointAttestations: true,
        maxAllowedEthClientDriftSeconds: 300,
        ethereumAllowNoDebugHosts: true, // Skip trace validation
      },
      blobClient,
      instrumentation,
      { ...l1Constants, l1StartBlockHash: Buffer32.random() },
      synchronizer as ArchiverL1Synchronizer,
      events,
    );
  }

  /** Override start to skip L1 validation checks. */
  public override start(_blockUntilSynced?: boolean): Promise<void> {
    // Just start the running promise without L1 checks
    this.runningPromise.start();
    return Promise.resolve();
  }
}

/** Creates an archiver with mocked L1 connectivity for testing. */
export async function createNoopL1Archiver(
  dataStore: KVArchiverDataStore,
  l1Constants: L1RollupConstants & { genesisArchiveRoot: Fr },
  telemetry: TelemetryClient = getTelemetryClient(),
): Promise<NoopL1Archiver> {
  const instrumentation = await ArchiverInstrumentation.new(telemetry, () => dataStore.estimateSize());
  return new NoopL1Archiver(dataStore, l1Constants, instrumentation);
}
