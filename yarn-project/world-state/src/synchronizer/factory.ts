import { type L1ToL2MessageSource, type L2BlockSource } from '@aztec/circuit-types';
import { createDebugLogger } from '@aztec/foundation/log';
import { type DataStoreConfig } from '@aztec/kv-store/config';
import { createStore } from '@aztec/kv-store/lmdb';
import { type TelemetryClient } from '@aztec/telemetry-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { NativeWorldStateService } from '../native/native_world_state.js';
import { MerkleTrees } from '../world-state-db/merkle_trees.js';
import { type WorldStateConfig } from './config.js';
import { ServerWorldStateSynchronizer } from './server_world_state_synchronizer.js';

export async function createWorldStateSynchronizer(
  config: WorldStateConfig & DataStoreConfig,
  l2BlockSource: L2BlockSource & L1ToL2MessageSource,
  client: TelemetryClient,
) {
  const merkleTrees = await createWorldState(config, client);
  return new ServerWorldStateSynchronizer(merkleTrees, l2BlockSource, config, client);
}

export async function createWorldState(
  config: WorldStateConfig & DataStoreConfig,
  client: TelemetryClient = new NoopTelemetryClient(),
) {
  const newConfig = {
    dataDirectory: config.worldStateDataDirectory ?? config.dataDirectory,
    dataStoreMapSizeKB: config.worldStateDbMapSizeKb ?? config.dataStoreMapSizeKB,
  } as DataStoreConfig;

  if (!config.l1Contracts?.rollupAddress) {
    throw new Error('Rollup address is required to create a world state synchronizer.');
  }

  // If a data directory is provided in config, then create a persistent store.
  const merkleTrees = ['true', '1'].includes(process.env.USE_LEGACY_WORLD_STATE ?? '')
    ? await MerkleTrees.new(
        await createStore('world-state', newConfig, createDebugLogger('aztec:world-state:lmdb')),
        client,
      )
    : newConfig.dataDirectory
    ? await NativeWorldStateService.new(
        config.l1Contracts.rollupAddress,
        newConfig.dataDirectory,
        newConfig.dataStoreMapSizeKB,
      )
    : await NativeWorldStateService.tmp(
        config.l1Contracts.rollupAddress,
        !['true', '1'].includes(process.env.DEBUG_WORLD_STATE!),
      );

  return merkleTrees;
}
