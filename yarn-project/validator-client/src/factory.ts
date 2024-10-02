import { type P2P } from '@aztec/p2p';

import { generatePrivateKey } from 'viem/accounts';

import { type ValidatorClientConfig } from './config.js';
import { ValidatorClient } from './validator.js';
import { LightPublicProcessorFactory } from '@aztec/simulator';
import { type ArchiveSource } from '@aztec/archiver';
import { createWorldStateSynchronizer } from '../../world-state/dest/synchronizer/factory.js';
import { type TelemetryClient } from '../../telemetry-client/src/telemetry.js';
import { WorldStateConfig } from '../../world-state/dest/synchronizer/config.js';
import { DataStoreConfig } from '@aztec/kv-store/utils';
import { type WorldStateSynchronizer } from '@aztec/circuit-types';

// TODO: TODO: make the archiver optional???
export async function createValidatorClient(config: ValidatorClientConfig, p2pClient: P2P, worldStateSynchronizer: WorldStateSynchronizer, archiver: ArchiveSource, telemetry: TelemetryClient) {
  if (config.disableValidator) {
    return undefined;
  }
  // TODO: should this be exposed via a flag?
  if (config.validatorPrivateKey === undefined || config.validatorPrivateKey === '') {
    config.validatorPrivateKey = generatePrivateKey();
  }

  if (config.validatorReEx) {
    // It need to be able to create a public processor from somewhere?
    // What on earth does it need to do this -> check the sequencer code for this

    const publicProcessorFactory = new LightPublicProcessorFactory(
      worldStateSynchronizer,
      archiver,
      telemetry
    );
    return ValidatorClient.new(config, p2pClient, publicProcessorFactory);
  }

  return ValidatorClient.new(config, p2pClient);
}
