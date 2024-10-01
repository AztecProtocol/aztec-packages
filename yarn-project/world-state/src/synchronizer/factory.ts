import { type L1ToL2MessageSource, type L2BlockSource } from '@aztec/circuit-types';
import { createDebugLogger } from '@aztec/foundation/log';
import { type DataStoreConfig, createStore } from '@aztec/kv-store/utils';
import { type TelemetryClient } from '@aztec/telemetry-client';

import { rmSync } from 'fs';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { NativeWorldStateService } from '../native/native_world_state.js';
import { MerkleTrees } from '../world-state-db/merkle_trees.js';
import { type WorldStateConfig } from './config.js';
import { ServerWorldStateSynchronizer } from './server_world_state_synchronizer.js';

export async function createWorldStateSynchronizer(
  config: WorldStateConfig & DataStoreConfig,
  l2BlockSource: L2BlockSource & L1ToL2MessageSource,
  client: TelemetryClient,
) {
  const store = await createStore('world-state', config, createDebugLogger('aztec:world-state:lmdb'));
  let dataDir = config.dataDirectory;
  // TODO alexg: this always creates a tmp dir, but legacy world state doesn't need it
  if (!dataDir) {
    const tmpDir = await mkdtemp(join(tmpdir(), 'world-state-'));
    dataDir = tmpDir;
    process.on('beforeExit', () => {
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    });
  }
  const merkleTrees = process.env.USE_LEGACY_WORLD_STATE
    ? await MerkleTrees.new(store, client)
    : await NativeWorldStateService.create(config.l1Contracts.rollupAddress, dataDir);

  return new ServerWorldStateSynchronizer(store, merkleTrees, l2BlockSource, config);
}
