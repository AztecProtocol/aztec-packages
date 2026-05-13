import { getL1Config } from '@aztec/cli/config';
import { getGenesisStateConfigEnvVars } from '@aztec/ethereum/config';
import type { NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import type { LogFn } from '@aztec/foundation/log';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import {
  type ProverBrokerConfig,
  ProvingJobBrokerSchema,
  ProvingJobBrokerSchemaWithDebug,
  createAndStartProvingBroker,
  proverBrokerConfigMappings,
} from '@aztec/prover-client/broker';
import { getProverNodeBrokerConfigFromEnv } from '@aztec/prover-node';
import type { ProvingJobBroker } from '@aztec/stdlib/interfaces/server';
import { getConfigEnvVars as getTelemetryClientConfig, initTelemetryClient } from '@aztec/telemetry-client';

import { extractRelevantOptions } from '../util.js';
import { computeExpectedGenesisRoot, waitForCompatibleRollup } from './standby.js';

export async function startProverBroker(
  options: any,
  signalHandlers: (() => Promise<void>)[],
  services: NamespacedApiHandlers,
  userLog: LogFn,
): Promise<{ broker: ProvingJobBroker; config: ProverBrokerConfig }> {
  if (options.node || options.sequencer || options.p2pBootstrap || options.txe) {
    userLog(`Starting a prover broker with --node, --sequencer, --p2p-bootstrap, or --txe is not supported.`);
    process.exit(1);
  }

  const baseConfig: ProverBrokerConfig = {
    ...getProverNodeBrokerConfigFromEnv(), // get default config from env
    ...extractRelevantOptions<ProverBrokerConfig>(options, proverBrokerConfigMappings, 'proverBroker'), // override with command line options
  };

  if (!baseConfig.registryAddress || baseConfig.registryAddress.isZero()) {
    throw new Error('L1 registry address is required to start Aztec Node without --deploy-aztec-contracts option');
  }

  const genesisConfig = getGenesisStateConfigEnvVars();
  const { genesisArchiveRoot } = await computeExpectedGenesisRoot(genesisConfig, userLog);
  await waitForCompatibleRollup(
    baseConfig,
    { genesisArchiveRoot, vkTreeRoot: getVKTreeRoot(), protocolContractsHash },
    options.port,
    userLog,
  );

  const { addresses, config: rollupConfig } = await getL1Config(
    baseConfig.registryAddress,
    baseConfig.l1RpcUrls,
    baseConfig.l1ChainId,
    baseConfig.rollupVersion,
  );

  const config: ProverBrokerConfig = { ...baseConfig, ...addresses, rollupVersion: rollupConfig.rollupVersion };

  const client = await initTelemetryClient(getTelemetryClientConfig());
  const broker = await createAndStartProvingBroker(config, client);

  services.proverBroker = [
    broker,
    config.proverBrokerDebugReplayEnabled ? ProvingJobBrokerSchemaWithDebug : ProvingJobBrokerSchema,
  ];
  signalHandlers.push(() => broker.stop());

  return { broker, config };
}
