import { type EpochCache } from '@aztec/epoch-cache';
import { type DateProvider } from '@aztec/foundation/timer';
import { type P2P } from '@aztec/p2p';
import { type TelemetryClient } from '@aztec/telemetry-client';

import { generatePrivateKey } from 'viem/accounts';

import { type ValidatorClientConfig } from './config.js';
import { ValidatorClient } from './validator.js';

export function createValidatorClient(
  config: ValidatorClientConfig,
  deps: {
    p2pClient: P2P;
    telemetry: TelemetryClient;
    dateProvider: DateProvider;
    epochCache: EpochCache;
  },
) {
  if (config.disableValidator) {
    return undefined;
  }
  if (config.validatorPrivateKey === undefined || config.validatorPrivateKey === '') {
    config.validatorPrivateKey = generatePrivateKey();
  }

  return ValidatorClient.new(config, deps.epochCache, deps.p2pClient, deps.telemetry);
}
