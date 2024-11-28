import { type ForkMerkleTreeOperations, type ProvingJobBroker } from '@aztec/circuit-types';
import { type TelemetryClient } from '@aztec/telemetry-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { type ProverClientConfig } from '../config.js';
import { ProverClient } from './prover-client.js';

export function createProverClient(
  config: ProverClientConfig,
  worldState: ForkMerkleTreeOperations,
  broker: ProvingJobBroker,
  telemetry: TelemetryClient = new NoopTelemetryClient(),
) {
  return ProverClient.new(config, worldState, broker, telemetry);
}
