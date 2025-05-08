import type { L1ContractsConfig, L1ReaderConfig, L1TxUtils } from '@aztec/ethereum';
import type { L2BlockSourceEventEmitter } from '@aztec/stdlib/block';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import type { SlasherConfig } from './config.js';
import { SlasherClient } from './slasher_client.js';

export const createSlasherClient = (
  _config: SlasherConfig & L1ContractsConfig & L1ReaderConfig,
  l2BlockSource: L2BlockSourceEventEmitter,
  l1TxUtils: L1TxUtils,
  telemetry: TelemetryClient = getTelemetryClient(),
) => {
  const config = { ..._config };
  return new SlasherClient(config, l2BlockSource, l1TxUtils, telemetry);
};
