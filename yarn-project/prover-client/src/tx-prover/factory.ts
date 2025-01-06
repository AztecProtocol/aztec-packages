import { type ProvingJobBroker } from '@aztec/circuit-types';
import { type TelemetryClient } from '@aztec/telemetry-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { type ProverClientConfig } from '../config.js';
import { TxProver } from './tx-prover.js';

export function createProverClient(
  config: ProverClientConfig,
  broker: ProvingJobBroker,
  telemetry: TelemetryClient = new NoopTelemetryClient(),
) {
  return TxProver.new(config, broker, telemetry);
}
