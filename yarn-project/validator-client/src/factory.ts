import type { EpochCache } from '@aztec/epoch-cache';
import type { DateProvider } from '@aztec/foundation/timer';
import type { KeystoreManager } from '@aztec/node-keystore';
import { BlockProposalValidator, type P2PClient } from '@aztec/p2p';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { IFullNodeBlockBuilder, ValidatorClientFullConfig } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { TelemetryClient } from '@aztec/telemetry-client';

import { BlockProposalHandler } from './block_proposal_handler.js';
import { ValidatorMetrics } from './metrics.js';
import { ValidatorClient } from './validator.js';

export function createBlockProposalHandler(
  config: ValidatorClientFullConfig,
  deps: {
    blockBuilder: IFullNodeBlockBuilder;
    blockSource: L2BlockSource;
    l1ToL2MessageSource: L1ToL2MessageSource;
    p2pClient: P2PClient;
    epochCache: EpochCache;
    dateProvider: DateProvider;
    telemetry: TelemetryClient;
  },
) {
  const metrics = new ValidatorMetrics(deps.telemetry);
  const blockProposalValidator = new BlockProposalValidator(deps.epochCache);
  return new BlockProposalHandler(
    deps.blockBuilder,
    deps.blockSource,
    deps.l1ToL2MessageSource,
    deps.p2pClient.getTxProvider(),
    blockProposalValidator,
    config,
    metrics,
    deps.dateProvider,
    deps.telemetry,
  );
}

export function createValidatorClient(
  config: ValidatorClientFullConfig,
  deps: {
    blockBuilder: IFullNodeBlockBuilder;
    p2pClient: P2PClient;
    blockSource: L2BlockSource;
    l1ToL2MessageSource: L1ToL2MessageSource;
    telemetry: TelemetryClient;
    dateProvider: DateProvider;
    epochCache: EpochCache;
    keyStoreManager: KeystoreManager | undefined;
  },
) {
  if (config.disableValidator || !deps.keyStoreManager) {
    return undefined;
  }

  const txProvider = deps.p2pClient.getTxProvider();
  return ValidatorClient.new(
    config,
    deps.blockBuilder,
    deps.epochCache,
    deps.p2pClient,
    deps.blockSource,
    deps.l1ToL2MessageSource,
    txProvider,
    deps.keyStoreManager,
    deps.dateProvider,
    deps.telemetry,
  );
}
