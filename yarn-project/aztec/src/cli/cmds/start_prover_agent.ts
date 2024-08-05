import { BBNativeRollupProver, TestCircuitProver } from '@aztec/bb-prover';
import { type ServerCircuitProver, proverConfigMappings } from '@aztec/circuit-types';
import { ProverClientConfig, getProverEnvVars, proverClientConfigMappings } from '@aztec/prover-client';
import { ProverAgent, createProvingJobSourceClient } from '@aztec/prover-client/prover-agent';
import {
  TelemetryClientConfig,
  createAndStartTelemetryClient,
  getConfigEnvVars as getTelemetryClientConfig,
  telemetryClientConfigMappings,
} from '@aztec/telemetry-client/start';

import { type ServiceStarter, extractRelevantOptions } from '../util.js';

export const startProverAgent: ServiceStarter = async (options, signalHandlers, logger) => {
  const proverConfig = extractRelevantOptions<ProverClientConfig>(options, proverClientConfigMappings);

  if (!proverConfig.nodeUrl) {
    throw new Error('Starting prover without an orchestrator is not supported');
  }

  logger(`Connecting to prover at ${proverConfig.nodeUrl}`);
  const source = createProvingJobSourceClient(proverConfig.nodeUrl, 'provingJobSource');

  const agentConcurrency =
    // string if it was set as a CLI option, ie start --prover proverAgentConcurrency=10
    typeof proverConfig.proverAgentConcurrency === 'string'
      ? parseInt(proverConfig.proverAgentConcurrency, 10)
      : proverConfig.proverAgentConcurrency;

  const pollInterval =
    // string if it was set as a CLI option, ie start --prover proverAgentPollInterval=10
    typeof proverConfig.proverAgentPollInterval === 'string'
      ? parseInt(proverConfig.proverAgentPollInterval, 10)
      : proverConfig.proverAgentPollInterval;

  // NOTE: Shouldn't telemetry be optional?
  const telemetryConfig = extractRelevantOptions<TelemetryClientConfig>(options, telemetryClientConfigMappings);
  const telemetry = createAndStartTelemetryClient(telemetryConfig);

  let circuitProver: ServerCircuitProver;
  if (proverConfig.realProofs) {
    if (!proverConfig.acvmBinaryPath || !proverConfig.bbBinaryPath) {
      throw new Error('Cannot start prover without simulation or native prover options');
    }

    circuitProver = await BBNativeRollupProver.new(
      {
        acvmBinaryPath: proverConfig.acvmBinaryPath,
        bbBinaryPath: proverConfig.bbBinaryPath,
        acvmWorkingDirectory: proverConfig.acvmWorkingDirectory,
        bbWorkingDirectory: proverConfig.bbWorkingDirectory,
      },
      telemetry,
    );
  } else {
    circuitProver = new TestCircuitProver(telemetry);
  }

  const agent = new ProverAgent(
    circuitProver,
    proverConfig.proverAgentConcurrency,
    proverConfig.proverAgentPollInterval,
  );
  agent.start(source);
  logger(`Started prover agent with concurrency limit of ${agentConcurrency}`);

  signalHandlers.push(() => agent.stop());

  return Promise.resolve([]);
};
