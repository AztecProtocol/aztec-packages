import { type ArchiveSource } from '@aztec/archiver';
import { type WorldStateSynchronizer } from '@aztec/circuit-types';
import { type P2P } from '@aztec/p2p';

import { generatePrivateKey } from 'viem/accounts';

import { type TelemetryClient } from '../../telemetry-client/src/telemetry.js';
import { type ValidatorClientConfig } from './config.js';
import { LightPublicProcessorFactory } from './duties/light_public_processor_factory.js';
import { ValidatorClient } from './validator.js';

export function createValidatorClient(
  config: ValidatorClientConfig,
  p2pClient: P2P,
  worldStateSynchronizer: WorldStateSynchronizer,
  archiver: ArchiveSource,
  telemetry: TelemetryClient,
) {
  if (config.disableValidator) {
    return undefined;
  }
  if (config.validatorPrivateKey === undefined || config.validatorPrivateKey === '') {
    config.validatorPrivateKey = generatePrivateKey();
  }

  // We only craete a public processor factory if re-execution is enabled
  if (config.validatorReEx) {
    const publicProcessorFactory = new LightPublicProcessorFactory(worldStateSynchronizer, archiver, telemetry);
    return ValidatorClient.new(config, p2pClient, publicProcessorFactory);
  }

  return ValidatorClient.new(config, p2pClient);
}
