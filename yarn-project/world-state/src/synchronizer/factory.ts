import { type L1ToL2MessageSource, type L2BlockSource } from '@aztec/circuit-types';
import { createDebugLogger } from '@aztec/foundation/log';
import { type DataStoreConfig, createStore } from '@aztec/kv-store/utils';
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
  return new ServerWorldStateSynchronizer(merkleTrees, l2BlockSource, config);
}

export async function createWorldState(config: DataStoreConfig, client: TelemetryClient = new NoopTelemetryClient()) {
  const merkleTrees = ['true', '1'].includes(process.env.USE_LEGACY_WORLD_STATE ?? '')
    ? await MerkleTrees.new(
        await createStore('world-state', config, createDebugLogger('aztec:world-state:lmdb')),
        client,
      )
    : config.dataDirectory
    ? await NativeWorldStateService.new(config.l1Contracts.rollupAddress, config.dataDirectory)
    : await NativeWorldStateService.tmp(
        config.l1Contracts.rollupAddress,
        !['true', '1'].includes(process.env.DEBUG_WORLD_STATE!),
      );

  return merkleTrees;
}
