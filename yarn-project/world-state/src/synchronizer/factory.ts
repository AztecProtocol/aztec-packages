import { type L1ToL2MessageSource, type L2BlockSource } from '@aztec/circuit-types';
import { createDebugLogger } from '@aztec/foundation/log';
import { type DataStoreConfig, createStore } from '@aztec/kv-store/utils';
import { type TelemetryClient } from '@aztec/telemetry-client';

import { MerkleTrees } from '../world-state-db/merkle_trees.js';
import { type WorldStateConfig } from './config.js';
import { ServerWorldStateSynchronizer } from './server_world_state_synchronizer.js';

export async function createWorldStateSynchronizer(
  config: WorldStateConfig & DataStoreConfig,
  l2BlockSource: L2BlockSource & L1ToL2MessageSource,
  client: TelemetryClient,
) {
  const store = await createStore('world-state', config, createDebugLogger('aztec:world-state:lmdb'));
  const merkleTrees = await MerkleTrees.new(store, client);
  return new ServerWorldStateSynchronizer(store, merkleTrees, l2BlockSource, config);
}
