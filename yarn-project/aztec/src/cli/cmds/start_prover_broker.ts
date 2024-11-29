import { type ProverBrokerConfig, type ProvingJobBroker, proverBrokerConfigMappings } from '@aztec/circuit-types';
import { type NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import { type LogFn } from '@aztec/foundation/log';
import { ProvingJobBrokerSchema, createAndStartProvingBroker } from '@aztec/prover-client/broker';
import { getProverNodeBrokerConfigFromEnv } from '@aztec/prover-node';

import { extractRelevantOptions } from '../util.js';

export async function startProverBroker(
  options: any,
  signalHandlers: (() => Promise<void>)[],
  services: NamespacedApiHandlers,
  userLog: LogFn,
): Promise<ProvingJobBroker> {
  if (options.node || options.sequencer || options.pxe || options.p2pBootstrap || options.txe) {
    userLog(`Starting a prover broker with --node, --sequencer, --pxe, --p2p-bootstrap, or --txe is not supported.`);
    process.exit(1);
  }

  const config: ProverBrokerConfig = {
    ...getProverNodeBrokerConfigFromEnv(), // get default config from env
    ...extractRelevantOptions<ProverBrokerConfig>(options, proverBrokerConfigMappings, 'proverBroker'), // override with command line options
  };

  const broker = await createAndStartProvingBroker(config);
  services.proverBroker = [broker, ProvingJobBrokerSchema];
  signalHandlers.push(() => broker.stop());

  await broker.start();

  return broker;
}
