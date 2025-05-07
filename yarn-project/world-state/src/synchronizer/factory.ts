import type { DataStoreConfig } from '@aztec/kv-store/config';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { WorldStateInstrumentation } from '../instrumentation/instrumentation.js';
import { NativeWorldStateService } from '../native/native_world_state.js';
import type { WorldStateConfig } from './config.js';
import { ServerWorldStateSynchronizer } from './server_world_state_synchronizer.js';

export async function createWorldStateSynchronizer(
  config: WorldStateConfig & DataStoreConfig,
  l2BlockSource: L2BlockSource & L1ToL2MessageSource,
  prefilledPublicData: PublicDataTreeLeaf[] = [],
  client: TelemetryClient = getTelemetryClient(),
) {
  const instrumentation = new WorldStateInstrumentation(client);
  const merkleTrees = await createWorldState(config, prefilledPublicData, instrumentation);
  return new ServerWorldStateSynchronizer(merkleTrees, l2BlockSource, config, instrumentation);
}

export async function createWorldState(
  config: Pick<WorldStateConfig, 'worldStateDataDirectory' | 'worldStateDbMapSizeKb'> &
    Pick<DataStoreConfig, 'dataDirectory' | 'dataStoreMapSizeKB' | 'l1Contracts'>,
  prefilledPublicData: PublicDataTreeLeaf[] = [],
  instrumentation: WorldStateInstrumentation = new WorldStateInstrumentation(getTelemetryClient()),
) {
  const newConfig: DataStoreConfig = {
    dataDirectory: config.worldStateDataDirectory ?? config.dataDirectory,
    dataStoreMapSizeKB: config.worldStateDbMapSizeKb ?? config.dataStoreMapSizeKB,
  };

  if (!config.l1Contracts?.rollupAddress) {
    throw new Error('Rollup address is required to create a world state synchronizer.');
  }

  // If a data directory is provided in config, then create a persistent store.
  const merkleTrees = newConfig.dataDirectory
    ? await NativeWorldStateService.new(
        config.l1Contracts.rollupAddress,
        newConfig.dataDirectory,
        newConfig.dataStoreMapSizeKB,
        prefilledPublicData,
        instrumentation,
      )
    : await NativeWorldStateService.tmp(
        config.l1Contracts.rollupAddress,
        !['true', '1'].includes(process.env.DEBUG_WORLD_STATE!),
        prefilledPublicData,
      );

  return merkleTrees;
}
