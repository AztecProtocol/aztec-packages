import type { EpochCache } from '@aztec/epoch-cache';
import { SecretValue } from '@aztec/foundation/config';
import type { DateProvider } from '@aztec/foundation/timer';
import type { P2P } from '@aztec/p2p';
import type { SlasherConfig } from '@aztec/slasher/config';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { IFullNodeBlockBuilder } from '@aztec/stdlib/interfaces/server';
import type { TelemetryClient } from '@aztec/telemetry-client';

import { generatePrivateKey } from 'viem/accounts';

import type { ValidatorClientConfig } from './config.js';
import { ValidatorClient } from './validator.js';

export function createValidatorClient(
  config: ValidatorClientConfig &
    Pick<SlasherConfig, 'slashInvalidBlockEnabled' | 'slashInvalidBlockPenalty' | 'slashInvalidBlockMaxPenalty'>,
  deps: {
    blockBuilder: IFullNodeBlockBuilder;
    p2pClient: P2P;
    blockSource: L2BlockSource;
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

  return ValidatorClient.new(
    config,
    deps.blockBuilder,
    deps.epochCache,
    deps.p2pClient,
    deps.blockSource,
    deps.dateProvider,
    deps.telemetry,
  );
}
