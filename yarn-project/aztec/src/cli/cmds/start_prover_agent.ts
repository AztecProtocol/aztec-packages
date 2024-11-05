import { BBNativeRollupProver, TestCircuitProver } from '@aztec/bb-prover';
import { type ServerCircuitProver } from '@aztec/circuit-types';
import { type ProverClientConfig, proverClientConfigMappings } from '@aztec/prover-client';
import {
  ProverAgent,
  createProverAgentRpcServer,
  createProvingJobSourceClient,
} from '@aztec/prover-client/prover-agent';
import {
  type TelemetryClientConfig,
  createAndStartTelemetryClient,
  telemetryClientConfigMappings,
} from '@aztec/telemetry-client/start';

import { type ServiceStarter, extractRelevantOptions } from '../util.js';

export const startProverAgent: ServiceStarter = async (options, signalHandlers, logger) => {
  const proverConfig = extractRelevantOptions<ProverClientConfig>(options, proverClientConfigMappings, 'prover');
  const proverJobSourceUrl = proverConfig.proverJobSourceUrl ?? proverConfig.nodeUrl;
  if (!proverJobSourceUrl) {
    throw new Error('Starting prover without PROVER_JOB_PROVIDER_URL is not supported');
  }

  logger(`Connecting to prover at ${proverJobSourceUrl}`);
  const source = createProvingJobSourceClient(proverJobSourceUrl, 'provingJobSource');

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

  const agent = new ProverAgent(
    circuitProver,
    proverConfig.proverAgentConcurrency,
    proverConfig.proverAgentPollInterval,
  );
  agent.start(source);
  logger(`Started prover agent with concurrency limit of ${proverConfig.proverAgentConcurrency}`);

  signalHandlers.push(() => agent.stop());

  return [{ prover: createProverAgentRpcServer(agent) }];
};
