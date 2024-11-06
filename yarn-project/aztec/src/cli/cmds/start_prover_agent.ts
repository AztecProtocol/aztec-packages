import { BBNativeRollupProver, TestCircuitProver } from '@aztec/bb-prover';
import { ProverAgentApiSchema, type ServerCircuitProver } from '@aztec/circuit-types';
import { type NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import { type LogFn } from '@aztec/foundation/log';
import { type ProverClientConfig, proverClientConfigMappings } from '@aztec/prover-client';
import { ProverAgent, createProvingJobSourceClient } from '@aztec/prover-client/prover-agent';
import {
  type TelemetryClientConfig,
  createAndStartTelemetryClient,
  telemetryClientConfigMappings,
} from '@aztec/telemetry-client/start';

import { extractRelevantOptions } from '../util.js';

export async function startProverAgent(
  options: any,
  signalHandlers: (() => Promise<void>)[],
  services: NamespacedApiHandlers,
  logger: LogFn,
) {
  const proverConfig = extractRelevantOptions<ProverClientConfig>(options, proverClientConfigMappings, 'prover');
  const proverJobSourceUrl = proverConfig.proverJobSourceUrl ?? proverConfig.nodeUrl;
  if (!proverJobSourceUrl) {
    throw new Error('Starting prover without PROVER_JOB_PROVIDER_URL is not supported');
  }

  logger(`Connecting to prover at ${proverJobSourceUrl}`);
  const source = createProvingJobSourceClient(proverJobSourceUrl);

  const telemetryConfig = extractRelevantOptions<TelemetryClientConfig>(options, telemetryClientConfigMappings, 'tel');
  const telemetry = await createAndStartTelemetryClient(telemetryConfig);

  let circuitProver: ServerCircuitProver;
  if (proverConfig.realProofs) {
    if (!proverConfig.acvmBinaryPath || !proverConfig.bbBinaryPath) {
      throw new Error('Cannot start prover without simulation or native prover options');
    }
    circuitProver = await BBNativeRollupProver.new(proverConfig, telemetry);
  } else {
    circuitProver = new TestCircuitProver(telemetry, undefined, proverConfig);
  }

  const { proverAgentConcurrency, proverAgentPollInterval } = proverConfig;
  const agent = new ProverAgent(circuitProver, proverAgentConcurrency, proverAgentPollInterval);
  agent.start(source);

  logger(`Started prover agent with concurrency limit of ${proverAgentConcurrency}`);

  services.prover = [agent, ProverAgentApiSchema];
  signalHandlers.push(() => agent.stop());
}
