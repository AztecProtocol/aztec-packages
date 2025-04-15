import type { L1ContractsConfig, L1ReaderConfig } from '@aztec/ethereum';
import type { L2BlockSourceEventEmitter } from '@aztec/stdlib/block';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { SlasherClient } from './slasher_client.js';
import type { SlasherConfig } from './slasher_client.js';

export const createSlasherClient = (
  _config: SlasherConfig & L1ContractsConfig & L1ReaderConfig,
  l2BlockSource: L2BlockSourceEventEmitter,
  telemetry: TelemetryClient = getTelemetryClient(),
) => {
  const config = { ..._config };
  return new SlasherClient(config, l2BlockSource, telemetry);
};
