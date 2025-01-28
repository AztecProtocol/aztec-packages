import type { L2BlockSource } from '@aztec/circuit-types';
import { type L1ContractsConfig, type L1ReaderConfig } from '@aztec/ethereum';
import { createLogger } from '@aztec/foundation/log';
import { type AztecKVStore } from '@aztec/kv-store';
import { type DataStoreConfig } from '@aztec/kv-store/config';
import { createStore } from '@aztec/kv-store/lmdb';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { SlasherClient } from './slasher_client.js';
import { type SlasherConfig } from './slasher_client.js';

export const createSlasherClient = async (
  _config: SlasherConfig & DataStoreConfig & L1ContractsConfig & L1ReaderConfig,
  l2BlockSource: L2BlockSource,
  telemetry: TelemetryClient = getTelemetryClient(),
  deps: { store?: AztecKVStore } = {},
) => {
  const config = { ..._config };
  const store = deps.store ?? (await createStore('slasher', config, createLogger('slasher:lmdb')));
  return new SlasherClient(config, store, l2BlockSource, telemetry);
};
