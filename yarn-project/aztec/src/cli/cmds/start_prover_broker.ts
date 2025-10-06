import { getL1Config } from '@aztec/cli/config';
import { getPublicClient } from '@aztec/ethereum';
import type { NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import type { LogFn } from '@aztec/foundation/log';
import {
  type ProverBrokerConfig,
  ProvingJobBrokerSchema,
  createAndStartProvingBroker,
  proverBrokerConfigMappings,
} from '@aztec/prover-client/broker';
import { getProverNodeBrokerConfigFromEnv } from '@aztec/prover-node';
import type { ProvingJobBroker } from '@aztec/stdlib/interfaces/server';
import { getConfigEnvVars as getTelemetryClientConfig, initTelemetryClient } from '@aztec/telemetry-client';

import { extractRelevantOptions, setupUpdateMonitor } from '../util.js';

export async function startProverBroker(
  options: any,
  signalHandlers: (() => Promise<void>)[],
  services: NamespacedApiHandlers,
  userLog: LogFn,
): Promise<{ broker: ProvingJobBroker; config: ProverBrokerConfig }> {
  if (options.node || options.sequencer || options.pxe || options.p2pBootstrap || options.txe) {
    userLog(`Starting a prover broker with --node, --sequencer, --pxe, --p2p-bootstrap, or --txe is not supported.`);
    process.exit(1);
  }

  const config: ProverBrokerConfig = {
    ...getProverNodeBrokerConfigFromEnv(), // get default config from env
    ...extractRelevantOptions<ProverBrokerConfig>(options, proverBrokerConfigMappings, 'proverBroker'), // override with command line options
  };

  if (!config.l1Contracts.registryAddress || config.l1Contracts.registryAddress.isZero()) {
    throw new Error('L1 registry address is required to start Aztec Node without --deploy-aztec-contracts option');
  }

  const followsCanonicalRollup = typeof config.rollupVersion !== 'number';
  const { addresses, config: rollupConfig } = await getL1Config(
    config.l1Contracts.registryAddress,
    config.l1RpcUrls,
    config.l1ChainId,
    config.rollupVersion,
  );

  config.l1Contracts = addresses;
  config.rollupVersion = rollupConfig.rollupVersion;

  const client = initTelemetryClient(getTelemetryClientConfig());
  const broker = await createAndStartProvingBroker(config, client);

  if (options.autoUpdate !== 'disabled' && options.autoUpdateUrl) {
    await setupUpdateMonitor(
      options.autoUpdate,
      new URL(options.autoUpdateUrl),
      followsCanonicalRollup,
      getPublicClient(config),
      config.l1Contracts.registryAddress,
      signalHandlers,
    );
  }

  services.proverBroker = [broker, ProvingJobBrokerSchema];
  signalHandlers.push(() => broker.stop());

  return { broker, config };
}
