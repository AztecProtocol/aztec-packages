import { type P2P } from '@aztec/p2p';
import { type TelemetryClient } from '@aztec/telemetry-client';

import { generatePrivateKey } from 'viem/accounts';

import { type ValidatorClientConfig } from './config.js';
import { ValidatorClient } from './validator.js';
import { EpochCache } from '@aztec/epoch-cache';
import { type EthAddress } from '@aztec/foundation/eth-address';

export async function createValidatorClient(config: ValidatorClientConfig, rollupAddress: EthAddress, p2pClient: P2P, telemetry: TelemetryClient) {
  if (config.disableValidator) {
    return undefined;
  }
  if (config.validatorPrivateKey === undefined || config.validatorPrivateKey === '') {
    config.validatorPrivateKey = generatePrivateKey();
  }

  // Create the epoch cache
  const epochCache = await EpochCache.create(rollupAddress);

  return ValidatorClient.new(config, epochCache, p2pClient, telemetry);
}
