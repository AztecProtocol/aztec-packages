import { type ProverAgentConfig, proverAgentConfigMappings } from '@aztec/circuit-types';
import { times } from '@aztec/foundation/collection';
import { type NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import { type LogFn } from '@aztec/foundation/log';
import { buildServerCircuitProver } from '@aztec/prover-client';
import { ProverAgent, createProvingJobSourceClient } from '@aztec/prover-client/prover-agent';
import { getProverNodeAgentConfigFromEnv } from '@aztec/prover-node';
import { createAndStartTelemetryClient, telemetryClientConfigMappings } from '@aztec/telemetry-client/start';

import { extractRelevantOptions } from '../util.js';

export async function startProverAgent(
  options: any,
  signalHandlers: (() => Promise<void>)[],
  services: NamespacedApiHandlers,
  userLog: LogFn,
) {
  if (options.node || options.sequencer || options.pxe || options.p2pBootstrap || options.txe) {
    userLog(`Starting a prover agent with --node, --sequencer, --pxe, --p2p-bootstrap, or --txe is not supported.`);
    process.exit(1);
  }

  const config = {
    ...getProverNodeAgentConfigFromEnv(), // get default config from env
    ...extractRelevantOptions<ProverAgentConfig>(options, proverAgentConfigMappings, 'proverAgent'), // override with command line options
  };

  if (config.realProofs && (!config.bbBinaryPath || !config.acvmBinaryPath)) {
    process.exit(1);
  }

  if (!config.proverBrokerUrl) {
    process.exit(1);
  }

  const proverNode = createProvingJobSourceClient(process.env.PROVER_NODE_HOST!);

  const telemetry = await createAndStartTelemetryClient(
    extractRelevantOptions(options, telemetryClientConfigMappings, 'tel'),
  );
  const prover = await buildServerCircuitProver(config, telemetry);
  const agents = times(config.proverAgentCount, () => new ProverAgent(prover));

  await Promise.all(agents.map(agent => agent.start(proverNode)));

  signalHandlers.push(async () => {
    await Promise.all(agents.map(agent => agent.stop()));
    await telemetry.stop();
  });
}
