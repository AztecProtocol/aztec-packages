import type { BlobClientInterface } from '@aztec/blob-client/client';
import type { EpochCache } from '@aztec/epoch-cache';
import type { DateProvider } from '@aztec/foundation/timer';
import type { KeystoreManager } from '@aztec/node-keystore';
import { BlockProposalValidator, type P2PClient } from '@aztec/p2p';
import type { L2BlockSink, L2BlockSource } from '@aztec/stdlib/block';
import type { ValidatorClientFullConfig, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { TelemetryClient } from '@aztec/telemetry-client';

import { BlockProposalHandler } from './block_proposal_handler.js';
import type { FullNodeCheckpointsBuilder } from './checkpoint_builder.js';
import { ValidatorMetrics } from './metrics.js';
import { ValidatorClient } from './validator.js';

export function createBlockProposalHandler(
  config: ValidatorClientFullConfig,
  deps: {
    checkpointsBuilder: FullNodeCheckpointsBuilder;
    worldState: WorldStateSynchronizer;
    blockSource: L2BlockSource & L2BlockSink;
    l1ToL2MessageSource: L1ToL2MessageSource;
    p2pClient: P2PClient;
    epochCache: EpochCache;
    dateProvider: DateProvider;
    telemetry: TelemetryClient;
  },
) {
  const metrics = new ValidatorMetrics(deps.telemetry);
  const blockProposalValidator = new BlockProposalValidator(deps.epochCache, {
    txsPermitted: !config.disableTransactions,
  });
  return new BlockProposalHandler(
    deps.checkpointsBuilder,
    deps.worldState,
    deps.blockSource,
    deps.l1ToL2MessageSource,
    deps.p2pClient.getTxProvider(),
    blockProposalValidator,
    deps.epochCache,
    config,
    metrics,
    deps.dateProvider,
    deps.telemetry,
  );
}

export function createValidatorClient(
  config: ValidatorClientFullConfig,
  deps: {
    checkpointsBuilder: FullNodeCheckpointsBuilder;
    worldState: WorldStateSynchronizer;
    p2pClient: P2PClient;
    blockSource: L2BlockSource & L2BlockSink;
    l1ToL2MessageSource: L1ToL2MessageSource;
    telemetry: TelemetryClient;
    dateProvider: DateProvider;
    epochCache: EpochCache;
    keyStoreManager: KeystoreManager | undefined;
    blobClient: BlobClientInterface;
  },
) {
  if (config.disableValidator || !deps.keyStoreManager) {
    return undefined;
  }

  const txProvider = deps.p2pClient.getTxProvider();
  return ValidatorClient.new(
    config,
    deps.checkpointsBuilder,
    deps.worldState,
    deps.epochCache,
    deps.p2pClient,
    deps.blockSource,
    deps.l1ToL2MessageSource,
    txProvider,
    deps.keyStoreManager,
    deps.blobClient,
    deps.dateProvider,
    deps.telemetry,
  );
}
