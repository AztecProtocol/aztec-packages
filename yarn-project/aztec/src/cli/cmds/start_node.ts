import {
  type AztecNodeConfig,
  aztecNodeConfigMappings,
  getConfigEnvVars,
  registerAztecNodeRpcHandlers,
} from '@aztec/aztec-node';
import { Fr } from '@aztec/aztec.js/fields';
import { getL1Config } from '@aztec/cli/config';
import { getGenesisStateConfigEnvVars } from '@aztec/ethereum/config';
import { type NetworkNames, SecretValue } from '@aztec/foundation/config';
import type { NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import { Agent, makeUndiciFetch } from '@aztec/foundation/json-rpc/undici';
import type { LogFn } from '@aztec/foundation/log';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import {
  ProvingJobConsumerSchema,
  createProvingJobBrokerClient,
  proverBrokerBackoff,
} from '@aztec/prover-client/broker';
import { type CliPXEOptions, type PXEConfig, allPxeConfigMappings } from '@aztec/pxe/config';
import { ProverNodeApiSchema, type ProvingJobBroker } from '@aztec/stdlib/interfaces/server';
import {
  type TelemetryClientConfig,
  initTelemetryClient,
  makeTracedFetch,
  telemetryClientConfigMappings,
} from '@aztec/telemetry-client';
import { EmbeddedWallet } from '@aztec/wallets/embedded';

import { createAztecNode } from '../../local-network/index.js';
import { extractNamespacedOptions, extractRelevantOptions, preloadCrsDataForVerifying } from '../util.js';
import { getVersions } from '../versioning.js';
import { computeExpectedGenesisRoot, setupAutoShutdown, waitForCompatibleRollup } from './standby.js';
import { startProverBroker } from './start_prover_broker.js';

export async function startNode(
  options: any,
  signalHandlers: (() => Promise<void>)[],
  services: NamespacedApiHandlers,
  adminServices: NamespacedApiHandlers,
  userLog: LogFn,
  networkName: NetworkNames,
): Promise<{ config: AztecNodeConfig }> {
  // All options set from environment variables
  const configFromEnvVars = getConfigEnvVars();

  // Extract relevant options from command line arguments
  const relevantOptions = extractRelevantOptions(options, aztecNodeConfigMappings, 'node');

  // All options that are relevant to the Aztec Node
  let nodeConfig: AztecNodeConfig = {
    ...configFromEnvVars,
    ...relevantOptions,
  };

  // Prover node configuration and broker setup
  // REFACTOR: Move the broker setup out of here and into the prover-node factory
  let broker: ProvingJobBroker | undefined = undefined;
  if (options.proverNode) {
    nodeConfig.enableProverNode = true;
    if (nodeConfig.proverAgentCount === 0) {
      userLog(
        `Running prover node without local prover agent. Connect prover agents or pass --proverAgent.proverAgentCount`,
      );
    }
    if (nodeConfig.proverBrokerUrl) {
      // at 1TPS we'd enqueue ~1k chonk verifier proofs and ~1k AVM proofs immediately
      // set a lower connection limit such that we don't overload the server
      // Retry indefinitely until the epoch proving times out and the chain reorgs
      const fetch = makeTracedFetch(proverBrokerBackoff, false, makeUndiciFetch(new Agent({ connections: 100 })));
      broker = createProvingJobBrokerClient(nodeConfig.proverBrokerUrl, getVersions(nodeConfig), fetch);
    } else if (options.proverBroker) {
      ({ broker } = await startProverBroker(options, signalHandlers, services, userLog));
    } else {
      userLog(`--prover-broker-url or --prover-broker is required to start a Prover Node`);
      process.exit(1);
    }
  }

  await preloadCrsDataForVerifying(nodeConfig, userLog);

  const genesisConfig = getGenesisStateConfigEnvVars();
  const { genesisArchiveRoot, genesis } = await computeExpectedGenesisRoot(genesisConfig, userLog);

  const followsCanonicalRollup =
    typeof nodeConfig.rollupVersion !== 'number' || (nodeConfig.rollupVersion as unknown as string) === 'canonical';

  if (!nodeConfig.registryAddress || nodeConfig.registryAddress.isZero()) {
    throw new Error('L1 registry address is required to start Aztec Node');
  }

  // Wait for a compatible rollup before proceeding with full L1 config fetch.
  // This prevents crashes when the canonical rollup hasn't been upgraded yet.
  await waitForCompatibleRollup(
    nodeConfig,
    { genesisArchiveRoot, vkTreeRoot: getVKTreeRoot(), protocolContractsHash },
    options.port,
    userLog,
  );

  const { addresses, config } = await getL1Config(
    nodeConfig.registryAddress,
    nodeConfig.l1RpcUrls,
    nodeConfig.l1ChainId,
    nodeConfig.rollupVersion,
  );

  process.env.ROLLUP_CONTRACT_ADDRESS ??= addresses.rollupAddress.toString();

  if (!Fr.fromHexString(config.genesisArchiveTreeRoot).equals(genesisArchiveRoot)) {
    throw new Error(
      `The computed genesis archive tree root ${genesisArchiveRoot} does not match the expected genesis archive tree root ${config.genesisArchiveTreeRoot} for the rollup deployed at ${addresses.rollupAddress}`,
    );
  }

  nodeConfig = {
    ...nodeConfig,
    ...addresses,
    ...config,
  };

  if (!options.sequencer && !nodeConfig.fishermanMode) {
    nodeConfig.disableValidator = true;
  } else {
    const sequencerConfig = {
      ...configFromEnvVars,
      ...extractNamespacedOptions(options, 'sequencer'),
    };
    // If no publisher private keys have been given, use the first validator key
    if (
      sequencerConfig.sequencerPublisherPrivateKeys === undefined ||
      !sequencerConfig.sequencerPublisherPrivateKeys.length
    ) {
      if (sequencerConfig.validatorPrivateKeys?.getValue().length) {
        sequencerConfig.sequencerPublisherPrivateKeys = [
          new SecretValue(sequencerConfig.validatorPrivateKeys.getValue()[0]),
        ];
      }
    }
    nodeConfig.sequencerPublisherPrivateKeys = sequencerConfig.sequencerPublisherPrivateKeys;
  }

  if (nodeConfig.p2pEnabled) {
    // ensure bootstrapNodes is an array
    if (nodeConfig.bootstrapNodes && typeof nodeConfig.bootstrapNodes === 'string') {
      nodeConfig.bootstrapNodes = (nodeConfig.bootstrapNodes as string).split(',');
    }
  }

  const telemetryConfig = extractRelevantOptions<TelemetryClientConfig>(options, telemetryClientConfigMappings, 'tel');
  const telemetry = await initTelemetryClient(telemetryConfig);

  // Create and start Aztec Node
  const node = await createAztecNode(nodeConfig, { telemetry, proverBroker: broker }, { genesis });

  registerAztecNodeRpcHandlers(node, services, adminServices, { debug: options.nodeDebug });

  // Register prover-node services if the prover node subsystem is running
  const proverNode = node.getProverNode();
  if (proverNode) {
    services.prover = [proverNode, ProverNodeApiSchema];
    if (!nodeConfig.proverBrokerUrl) {
      services.provingJobSource = [proverNode.getProver().getProvingJobSource(), ProvingJobConsumerSchema];
    }
  }

  // Add node stop function to signal handlers
  signalHandlers.push(node.stop.bind(node));

  // Add a txs bot if requested
  if (options.bot) {
    const { addBot } = await import('./start_bot.js');

    const pxeConfig = extractRelevantOptions<PXEConfig & CliPXEOptions>(options, allPxeConfigMappings, 'pxe');
    const wallet = await EmbeddedWallet.create(node, { pxeConfig });

    await addBot(options, signalHandlers, services, wallet, node, telemetry, undefined);
  }

  if (nodeConfig.enableAutoShutdown && networkName !== 'local' && followsCanonicalRollup) {
    try {
      await setupAutoShutdown(
        nodeConfig,
        nodeConfig.registryAddress,
        (nodeConfig.rollupVersion as number | 'canonical') ?? 'canonical',
        { genesisArchiveRoot, vkTreeRoot: getVKTreeRoot(), protocolContractsHash },
        signalHandlers,
      );
    } catch {
      /* no-op */
    }
  }

  return { config: nodeConfig };
}
