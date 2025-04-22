import type { ForkMerkleTreeOperations, ProvingJobBroker } from '@aztec/stdlib/interfaces/server';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import type { ProverClientConfig } from '../config.js';
import { ProverClient } from './prover-client.js';

export function createProverClient(
  config: ProverClientConfig,
  worldState: ForkMerkleTreeOperations,
  broker: ProvingJobBroker,
  telemetry: TelemetryClient = getTelemetryClient(),
) {
  return ProverClient.new(config, worldState, broker, telemetry);
}
