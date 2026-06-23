import type { LoggerBindings } from '@aztec/foundation/log';
import { DEFAULT_GENESIS_DATA } from '@aztec/protocol-contracts';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { DataStoreConfig } from '@aztec/stdlib/kv-store';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { type GenesisData, isGenesisData } from '@aztec/stdlib/world-state';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { WorldStateInstrumentation } from '../instrumentation/instrumentation.js';
import { NativeWorldStateService } from '../native/native_world_state.js';
import type { WorldStateConfig } from './config.js';
import { ServerWorldStateSynchronizer } from './server_world_state_synchronizer.js';

export interface WorldStateTreeMapSizes {
  archiveTreeMapSizeKb: number;
  nullifierTreeMapSizeKb: number;
  noteHashTreeMapSizeKb: number;
  messageTreeMapSizeKb: number;
  publicDataTreeMapSizeKb: number;
}

export async function createWorldStateSynchronizer(
  config: WorldStateConfig & DataStoreConfig,
  l2BlockSource: L2BlockSource & L1ToL2MessageSource,
  genesisOrNativeWorldState: GenesisData | NativeWorldStateService,
  client: TelemetryClient = getTelemetryClient(),
  bindings?: LoggerBindings,
) {
  const instrumentation = new WorldStateInstrumentation(client);
  const merkleTrees = isGenesisData(genesisOrNativeWorldState)
    ? await createWorldState(config, genesisOrNativeWorldState, instrumentation, bindings)
    : genesisOrNativeWorldState;
  return new ServerWorldStateSynchronizer(merkleTrees, l2BlockSource, config, instrumentation);
}

export async function createWorldState(
  config: Pick<
    WorldStateConfig,
    | 'worldStateDataDirectory'
    | 'worldStateDbMapSizeKb'
    | 'archiveTreeMapSizeKb'
    | 'nullifierTreeMapSizeKb'
    | 'noteHashTreeMapSizeKb'
    | 'messageTreeMapSizeKb'
    | 'publicDataTreeMapSizeKb'
  > &
    Pick<DataStoreConfig, 'dataDirectory' | 'dataStoreMapSizeKb' | 'rollupAddress'>,
  genesis: GenesisData = DEFAULT_GENESIS_DATA,
  instrumentation: WorldStateInstrumentation = new WorldStateInstrumentation(getTelemetryClient()),
  bindings?: LoggerBindings,
) {
  const dataDirectory = config.worldStateDataDirectory ?? config.dataDirectory;
  const dataStoreMapSizeKb = config.worldStateDbMapSizeKb ?? config.dataStoreMapSizeKb;
  const wsTreeMapSizes: WorldStateTreeMapSizes = {
    archiveTreeMapSizeKb: config.archiveTreeMapSizeKb ?? dataStoreMapSizeKb,
    nullifierTreeMapSizeKb: config.nullifierTreeMapSizeKb ?? dataStoreMapSizeKb,
    noteHashTreeMapSizeKb: config.noteHashTreeMapSizeKb ?? dataStoreMapSizeKb,
    messageTreeMapSizeKb: config.messageTreeMapSizeKb ?? dataStoreMapSizeKb,
    publicDataTreeMapSizeKb: config.publicDataTreeMapSizeKb ?? dataStoreMapSizeKb,
  };

  if (!config.rollupAddress) {
    throw new Error('Rollup address is required to create a world state synchronizer.');
  }

  // If a data directory is provided in config, then create a persistent store.
  const merkleTrees = dataDirectory
    ? await NativeWorldStateService.new(
        config.rollupAddress,
        dataDirectory,
        wsTreeMapSizes,
        genesis,
        instrumentation,
        bindings,
      )
    : await NativeWorldStateService.tmp(
        config.rollupAddress,
        !['true', '1'].includes(process.env.DEBUG_WORLD_STATE!),
        genesis,
        instrumentation,
        bindings,
      );

  return merkleTrees;
}
