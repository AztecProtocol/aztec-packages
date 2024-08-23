import { getConfigFromMappings } from '@aztec/foundation/config';
import { createDebugLogger } from '@aztec/foundation/log';
import { createAndStartTelemetryClient, telemetryClientConfigMappings } from '@aztec/telemetry-client/start';

import { parentPort, workerData } from 'node:worker_threads';

import { ProverAgent } from '../../prover-agent/prover-agent.js';
import { createProvingJobSourceClient } from '../../prover-agent/rpc.js';
import { FakeProver } from '../fake_prover.js';

interface Options {
  jobSource?: string;
  pollIntervalMs?: number;
  name?: string;
}

const { jobSource = 'http://127.0.0.1:8080', pollIntervalMs = 1000, name = "0'" } = workerData as Options;

const telemetry = await createAndStartTelemetryClient(getConfigFromMappings(telemetryClientConfigMappings));

const agent = new ProverAgent(
  new FakeProver(100, 5000),
  telemetry,
  1,
  pollIntervalMs,
  createDebugLogger(`aztec:prover-client:prover-agent-${name}`),
);
const src = createProvingJobSourceClient(jobSource);

agent.start(src);

parentPort?.postMessage('ready');
