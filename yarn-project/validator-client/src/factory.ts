import type { EpochCache } from '@aztec/epoch-cache';
import { SecretValue } from '@aztec/foundation/config';
import type { DateProvider } from '@aztec/foundation/timer';
import type { P2PClient } from '@aztec/p2p';
import type { SlasherConfig } from '@aztec/slasher/config';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { IFullNodeBlockBuilder } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { TelemetryClient } from '@aztec/telemetry-client';

import { generatePrivateKey } from 'viem/accounts';

import type { ValidatorClientConfig } from './config.js';
import { ValidatorClient } from './validator.js';

export function createValidatorClient(
  config: ValidatorClientConfig &
    Pick<SlasherConfig, 'slashInvalidBlockEnabled' | 'slashInvalidBlockPenalty' | 'slashInvalidBlockMaxPenalty'>,
  deps: {
    blockBuilder: IFullNodeBlockBuilder;
    p2pClient: P2PClient;
    blockSource: L2BlockSource;
    l1ToL2MessageSource: L1ToL2MessageSource;
    telemetry: TelemetryClient;
    dateProvider: DateProvider;
    epochCache: EpochCache;
  },
) {
  if (config.disableValidator) {
    return undefined;
  }
  if (config.validatorPrivateKeys === undefined || !config.validatorPrivateKeys.getValue().length) {
    config.validatorPrivateKeys = new SecretValue([generatePrivateKey()]);
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
    deps.dateProvider,
    deps.telemetry,
  );
}
