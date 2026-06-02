import type { BlobClientInterface } from '@aztec/blob-client/client';
import type { EpochCache } from '@aztec/epoch-cache';
import type { DateProvider } from '@aztec/foundation/timer';
import type { KeystoreManager } from '@aztec/node-keystore';
import { BlockProposalValidator, type P2PClient } from '@aztec/p2p';
import type { L2BlockSink, L2BlockSource } from '@aztec/stdlib/block';
import type { CheckpointReexecutionTracker } from '@aztec/stdlib/checkpoint';
import type { ValidatorClientFullConfig, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { TelemetryClient } from '@aztec/telemetry-client';
import type { SlashingProtectionDatabase } from '@aztec/validator-ha-signer/types';

import type { FullNodeCheckpointsBuilder } from './checkpoint_builder.js';
import { ValidatorMetrics } from './metrics.js';
import { ProposalHandler } from './proposal_handler.js';
import { ValidatorClient } from './validator.js';

export function createProposalHandler(
  config: ValidatorClientFullConfig,
  deps: {
    checkpointsBuilder: FullNodeCheckpointsBuilder;
    worldState: WorldStateSynchronizer;
    blockSource: L2BlockSource & L2BlockSink;
    l1ToL2MessageSource: L1ToL2MessageSource;
    p2pClient: P2PClient;
    epochCache: EpochCache;
    blobClient: BlobClientInterface;
    dateProvider: DateProvider;
    telemetry: TelemetryClient;
    reexecutionTracker: CheckpointReexecutionTracker;
  },
) {
  const metrics = new ValidatorMetrics(deps.telemetry);
  const blockProposalValidator = new BlockProposalValidator(deps.epochCache, {
    txsPermitted: !config.disableTransactions,
    maxTxsPerBlock: config.validateMaxTxsPerBlock ?? config.validateMaxTxsPerCheckpoint,
    maxBlocksPerCheckpoint: config.maxBlocksPerCheckpoint,
    signatureContext: {
      chainId: config.l1ChainId,
      rollupAddress: config.rollupAddress,
    },
  });
  return new ProposalHandler(
    deps.checkpointsBuilder,
    deps.worldState,
    deps.blockSource,
    deps.l1ToL2MessageSource,
    deps.p2pClient.getTxProvider(),
    blockProposalValidator,
    deps.epochCache,
    config,
    deps.blobClient,
    deps.reexecutionTracker,
    metrics,
    deps.dateProvider,
    deps.telemetry,
    undefined,
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
    reexecutionTracker: CheckpointReexecutionTracker;
    slashingProtectionDb?: SlashingProtectionDatabase;
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
    deps.reexecutionTracker,
    deps.dateProvider,
    deps.telemetry,
    deps.slashingProtectionDb,
  );
}
