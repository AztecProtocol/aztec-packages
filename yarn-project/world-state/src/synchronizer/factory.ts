import type { Logger } from '@aztec/foundation/log';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import type { TelemetryClient } from '@aztec/telemetry-client';

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
  prefilledPublicData: PublicDataTreeLeaf[],
  log: Logger,
  client?: TelemetryClient,
) {
  const instrumentation = new WorldStateInstrumentation(log.createChild('instrumentation'), client);
  const merkleTrees = await createWorldStateWithInstrumentation(config, prefilledPublicData, log, instrumentation);
  return new ServerWorldStateSynchronizer(merkleTrees, l2BlockSource, config, log, instrumentation);
}

type WorldStateCreateConfig = Pick<
  WorldStateConfig,
  | 'worldStateDataDirectory'
  | 'worldStateDbMapSizeKb'
  | 'archiveTreeMapSizeKb'
  | 'nullifierTreeMapSizeKb'
  | 'noteHashTreeMapSizeKb'
  | 'messageTreeMapSizeKb'
  | 'publicDataTreeMapSizeKb'
> &
  Pick<DataStoreConfig, 'dataDirectory' | 'dataStoreMapSizeKb' | 'l1Contracts'>;

/** Creates a world state with default telemetry and no prefilled public data. */
export function createWorldState(config: WorldStateCreateConfig, log: Logger) {
  return createWorldStateWithInstrumentation(config, [], log);
}

export async function createWorldStateWithInstrumentation(
  config: WorldStateCreateConfig,
  prefilledPublicData: PublicDataTreeLeaf[],
  log: Logger,
  instrumentation?: WorldStateInstrumentation,
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

  const dbLog = log.createChild('database');
  // If a data directory is provided in config, then create a persistent store.
  const merkleTrees = dataDirectory
    ? await NativeWorldStateService.new(
        config.l1Contracts.rollupAddress,
        dataDirectory,
        wsTreeMapSizes,
        prefilledPublicData,
        dbLog,
        instrumentation,
      )
    : await NativeWorldStateService.tmp(
        config.l1Contracts.rollupAddress,
        !['true', '1'].includes(process.env.DEBUG_WORLD_STATE!),
        prefilledPublicData,
        dbLog,
        instrumentation,
      );

  return merkleTrees;
}
