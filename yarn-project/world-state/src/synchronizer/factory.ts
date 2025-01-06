import { type L1ToL2MessageSource, type L2BlockSource } from '@aztec/circuit-types';
import { type DataStoreConfig } from '@aztec/kv-store/config';
import { type TelemetryClient } from '@aztec/telemetry-client';

import { WorldStateInstrumentation } from '../instrumentation/instrumentation.js';
import { NativeWorldStateService } from '../native/native_world_state.js';
import { type WorldStateConfig } from './config.js';
import { ServerWorldStateSynchronizer } from './server_world_state_synchronizer.js';

export async function createWorldStateSynchronizer(
  config: WorldStateConfig & DataStoreConfig,
  l2BlockSource: L2BlockSource & L1ToL2MessageSource,
  client: TelemetryClient,
) {
  const instrumentation = new WorldStateInstrumentation(client);
  const merkleTrees = await createWorldState(config, instrumentation);
  return new ServerWorldStateSynchronizer(merkleTrees, l2BlockSource, config, instrumentation);
}

export async function createWorldState(
  config: WorldStateConfig & DataStoreConfig,
  instrumentation: WorldStateInstrumentation,
) {
  const newConfig = {
    dataDirectory: config.worldStateDataDirectory ?? config.dataDirectory,
    dataStoreMapSizeKB: config.worldStateDbMapSizeKb ?? config.dataStoreMapSizeKB,
  } as DataStoreConfig;

  if (!config.l1Contracts?.rollupAddress) {
    throw new Error('Rollup address is required to create a world state synchronizer.');
  }

  // If a data directory is provided in config, then create a persistent store.
  const merkleTrees = newConfig.dataDirectory
    ? await NativeWorldStateService.new(
        config.l1Contracts.rollupAddress,
        newConfig.dataDirectory,
        newConfig.dataStoreMapSizeKB,
        instrumentation,
      )
    : await NativeWorldStateService.tmp(
        config.l1Contracts.rollupAddress,
        !['true', '1'].includes(process.env.DEBUG_WORLD_STATE!),
      );

  return merkleTrees;
}
