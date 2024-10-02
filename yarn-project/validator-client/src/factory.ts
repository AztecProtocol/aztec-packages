import { type P2P } from '@aztec/p2p';

import { generatePrivateKey } from 'viem/accounts';

import { type ValidatorClientConfig } from './config.js';
import { ValidatorClient } from './validator.js';
import { LightPublicProcessorFactory } from '@aztec/simulator';
import { type ArchiveSource } from '@aztec/archiver';
import { type TelemetryClient } from '../../telemetry-client/src/telemetry.js';
import { type WorldStateSynchronizer } from '@aztec/circuit-types';

export async function createValidatorClient(config: ValidatorClientConfig, p2pClient: P2P, worldStateSynchronizer: WorldStateSynchronizer, archiver: ArchiveSource, telemetry: TelemetryClient) {
  if (config.disableValidator) {
    return undefined;
  }
  if (config.validatorPrivateKey === undefined || config.validatorPrivateKey === '') {
    config.validatorPrivateKey = generatePrivateKey();
  }

  // We only craete a public processor factory if re-execution is enabled
  if (config.validatorReEx) {
    const publicProcessorFactory = new LightPublicProcessorFactory(
      worldStateSynchronizer,
      archiver,
      telemetry
    );
    return ValidatorClient.new(config, p2pClient, publicProcessorFactory);
  }

  return ValidatorClient.new(config, p2pClient);
}
