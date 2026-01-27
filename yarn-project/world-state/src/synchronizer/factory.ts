import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { createStore } from '@aztec/kv-store/lmdb-v2';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { PublicDataTreeLeaf } from '@aztec/stdlib/trees';
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

export const WORLD_STATE_STORE_NAME = 'world_state';
export const WORLD_STATE_STORE_VERSION = 1;

export async function createWorldStateSynchronizer(
  config: WorldStateConfig & DataStoreConfig,
  l2BlockSource: L2BlockSource & L1ToL2MessageSource,
  prefilledPublicData: PublicDataTreeLeaf[] = [],
  client: TelemetryClient = getTelemetryClient(),
  store?: AztecAsyncKVStore,
) {
  const instrumentation = new WorldStateInstrumentation(client);
  const merkleTrees = await createWorldState(config, prefilledPublicData, instrumentation);
  const kvStore = store ?? (await createStore(WORLD_STATE_STORE_NAME, WORLD_STATE_STORE_VERSION, config));
  return new ServerWorldStateSynchronizer(merkleTrees, l2BlockSource, kvStore, config, instrumentation);
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
    Pick<DataStoreConfig, 'dataDirectory' | 'dataStoreMapSizeKb' | 'l1Contracts'>,
  prefilledPublicData: PublicDataTreeLeaf[] = [],
  instrumentation: WorldStateInstrumentation = new WorldStateInstrumentation(getTelemetryClient()),
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

  if (!config.l1Contracts?.rollupAddress) {
    throw new Error('Rollup address is required to create a world state synchronizer.');
  }

  // If a data directory is provided in config, then create a persistent store.
  const merkleTrees = dataDirectory
    ? await NativeWorldStateService.new(
        config.l1Contracts.rollupAddress,
        dataDirectory,
        wsTreeMapSizes,
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
