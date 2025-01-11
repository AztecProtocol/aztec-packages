import { times } from '@aztec/foundation/collection';
import { type NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import { type LogFn } from '@aztec/foundation/log';
import { buildServerCircuitProver } from '@aztec/prover-client';
import {
  InlineProofStore,
  type ProverAgentConfig,
  ProvingAgent,
  createProvingJobBrokerClient,
  proverAgentConfigMappings,
} from '@aztec/prover-client/broker';
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

  const broker = createProvingJobBrokerClient(config.proverBrokerUrl);

  const telemetry = await createAndStartTelemetryClient(
    extractRelevantOptions(options, telemetryClientConfigMappings, 'tel'),
  );
  const prover = await buildServerCircuitProver(config, telemetry);
  const proofStore = new InlineProofStore();
  const agents = times(
    config.proverAgentCount,
    () =>
      new ProvingAgent(
        broker,
        proofStore,
        prover,
        telemetry,
        config.proverAgentProofTypes,
        config.proverAgentPollIntervalMs,
      ),
  );

  await Promise.all(agents.map(agent => agent.start()));

  signalHandlers.push(async () => {
    await Promise.all(agents.map(agent => agent.stop()));
    await telemetry.stop();
  });
}
