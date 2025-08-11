import { times } from '@aztec/foundation/collection';
import type { NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import { Agent, makeUndiciFetch } from '@aztec/foundation/json-rpc/undici';
import type { LogFn } from '@aztec/foundation/log';
import { buildServerCircuitProver } from '@aztec/prover-client';
import {
  InlineProofStore,
  type ProverAgentConfig,
  ProvingAgent,
  createProvingJobBrokerClient,
  proverAgentConfigMappings,
} from '@aztec/prover-client/broker';
import { getProverNodeAgentConfigFromEnv } from '@aztec/prover-node';
import { ProverAgentApiSchema } from '@aztec/stdlib/interfaces/server';
import { initTelemetryClient, makeTracedFetch, telemetryClientConfigMappings } from '@aztec/telemetry-client';

import { extractRelevantOptions, preloadCrsDataForServerSideProving } from '../util.js';
import { getVersions } from '../versioning.js';

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
    userLog(`Requested real proving but no path to bb or acvm binaries provided`);
    process.exit(1);
  }

  if (!config.proverBrokerUrl) {
    userLog(`Missing prover broker URL. Pass --proverAgent.proverBrokerUrl <value>`);
    process.exit(1);
  }

  await preloadCrsDataForServerSideProving(config, userLog);

  const fetch = makeTracedFetch([1, 2, 3], false, makeUndiciFetch(new Agent({ connections: 10 })));
  const broker = createProvingJobBrokerClient(config.proverBrokerUrl, getVersions(), fetch);

  const telemetry = initTelemetryClient(extractRelevantOptions(options, telemetryClientConfigMappings, 'tel'));
  const prover = await buildServerCircuitProver(config, telemetry);
  const proofStore = new InlineProofStore();
  const agents = times(
    config.proverAgentCount,
    () =>
      new ProvingAgent(
        broker,
        proofStore,
        prover,
        config.proverAgentProofTypes,
        config.proverAgentPollIntervalMs,
        telemetry,
      ),
  );

  // expose all agents as individual services
  for (let i = 0; i < agents.length; i++) {
    services[`agent${i}`] = [agents[i], ProverAgentApiSchema, () => agents[i].getStatus().status !== 'stopped'];
  }

  // shortcut in the most common case of having a single running agent
  if (agents.length === 1) {
    services[`agent`] = [agents[0], ProverAgentApiSchema, () => agents[0].getStatus().status !== 'stopped'];
  }

  await Promise.all(agents.map(agent => agent.start()));

  signalHandlers.push(async () => {
    await Promise.all(agents.map(agent => agent.stop()));
    await telemetry.stop();
  });
}
