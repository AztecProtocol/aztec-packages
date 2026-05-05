import type {
  ForkMerkleTreeOperations,
  ProvingJobBroker,
  ReadonlyWorldStateAccess,
} from '@aztec/stdlib/interfaces/server';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import type { ProverClientBlockExecutionDeps } from '../block_execution/index.js';
import type { ProverClientConfig } from '../config.js';
import { ProverClient } from './prover-client.js';

export function createProverClient(
  config: ProverClientConfig,
  worldState: ForkMerkleTreeOperations & ReadonlyWorldStateAccess,
  broker: ProvingJobBroker,
  telemetry: TelemetryClient = getTelemetryClient(),
  blockExecutionDeps?: ProverClientBlockExecutionDeps,
) {
  return ProverClient.new(config, worldState, broker, telemetry, blockExecutionDeps);
}
