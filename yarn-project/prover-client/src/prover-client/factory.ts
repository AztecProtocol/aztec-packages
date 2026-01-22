import type { LoggerFactory } from '@aztec/foundation/log';
import type {
  ForkMerkleTreeOperations,
  ProvingJobBroker,
  ReadonlyWorldStateAccess,
} from '@aztec/stdlib/interfaces/server';
import type { TelemetryClient } from '@aztec/telemetry-client';

import type { ProverClientConfig } from '../config.js';
import { ProverClient } from './prover-client.js';

export function createProverClient(
  config: ProverClientConfig,
  worldState: ForkMerkleTreeOperations & ReadonlyWorldStateAccess,
  broker: ProvingJobBroker,
  deps: { telemetry?: TelemetryClient; loggerFactory: LoggerFactory },
) {
  return ProverClient.new(config, worldState, broker, deps);
}
