import type { EpochCache } from '@aztec/epoch-cache';
import type { DateProvider } from '@aztec/foundation/timer';
import type { KeystoreManager } from '@aztec/node-keystore';
import type { P2PClient } from '@aztec/p2p';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { IFullNodeBlockBuilder, SlasherConfig } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { TelemetryClient } from '@aztec/telemetry-client';

import type { ValidatorClientConfig } from './config.js';
import { ValidatorClient } from './validator.js';

export function createValidatorClient(
  config: ValidatorClientConfig & Pick<SlasherConfig, 'slashBroadcastedInvalidBlockPenalty'>,
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
