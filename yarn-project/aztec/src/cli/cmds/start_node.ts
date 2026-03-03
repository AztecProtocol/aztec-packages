import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { type AztecNodeConfig, aztecNodeConfigMappings, getConfigEnvVars } from '@aztec/aztec-node';
import { Fr } from '@aztec/aztec.js/fields';
import { getSponsoredFPCAddress } from '@aztec/cli/cli-utils';
import { getL1Config } from '@aztec/cli/config';
import { getPublicClient } from '@aztec/ethereum/client';
import { RegistryContract, RollupContract } from '@aztec/ethereum/contracts';
import { type NetworkNames, SecretValue } from '@aztec/foundation/config';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import { startHttpRpcServer } from '@aztec/foundation/json-rpc/server';
import { Agent, makeUndiciFetch } from '@aztec/foundation/json-rpc/undici';
import type { LogFn } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { ProvingJobConsumerSchema, createProvingJobBrokerClient } from '@aztec/prover-client/broker';
import { type CliPXEOptions, type PXEConfig, allPxeConfigMappings } from '@aztec/pxe/config';
import { AztecNodeAdminApiSchema, AztecNodeApiSchema } from '@aztec/stdlib/interfaces/client';
import { P2PApiSchema, ProverNodeApiSchema, type ProvingJobBroker } from '@aztec/stdlib/interfaces/server';
import {
  type TelemetryClientConfig,
  initTelemetryClient,
  makeTracedFetch,
  telemetryClientConfigMappings,
} from '@aztec/telemetry-client';
import { EmbeddedWallet } from '@aztec/wallets/embedded';
import { getGenesisValues } from '@aztec/world-state/testing';

import Koa from 'koa';

import { createAztecNode } from '../../local-network/index.js';
import {
  extractNamespacedOptions,
  extractRelevantOptions,
  preloadCrsDataForVerifying,
  setupVersionChecker,
} from '../util.js';
import { getVersions } from '../versioning.js';
import { startProverBroker } from './start_prover_broker.js';

const ROLLUP_POLL_INTERVAL_MS = 600_000;

/**
 * Waits until the canonical rollup's genesis archive root matches the expected local genesis root.
 * If the rollup is not yet compatible (e.g. during L1 contract upgrades), enters standby mode:
 * starts a lightweight HTTP server for K8s liveness probes and polls until a compatible rollup appears.
 */
async function waitForCompatibleRollup(
  publicClient: ReturnType<typeof getPublicClient>,
  registryAddress: EthAddress,
  rollupVersion: number | 'canonical',
  expectedGenesisRoot: Fr,
  port: number | undefined,
  userLog: LogFn,
): Promise<void> {
  const registry = new RegistryContract(publicClient, registryAddress);
  const rollupAddress = await registry.getRollupAddress(rollupVersion);
  const rollup = new RollupContract(publicClient, rollupAddress.toString());

  let l1GenesisRoot: Fr;
  try {
    l1GenesisRoot = await rollup.getGenesisArchiveTreeRoot();
  } catch (err: any) {
    throw new Error(
      `Could not retrieve genesis archive root from canonical rollup at ${rollupAddress}: ${err.message}`,
    );
  }

  if (l1GenesisRoot.equals(expectedGenesisRoot)) {
    return;
  }

  userLog(
    `Genesis root mismatch: expected ${expectedGenesisRoot}, got ${l1GenesisRoot} from rollup at ${rollupAddress}. ` +
      `Entering standby mode. Will poll every ${ROLLUP_POLL_INTERVAL_MS / 1000}s for a compatible rollup...`,
  );

  const standbyServer = await startHttpRpcServer({ getApp: () => new Koa(), isHealthy: () => true }, { port });
  userLog(`Standby status server listening on port ${standbyServer.port}`);

  try {
    while (true) {
      await sleep(ROLLUP_POLL_INTERVAL_MS);

      const currentRollupAddress = await registry.getRollupAddress(rollupVersion);
      const currentRollup = new RollupContract(publicClient, currentRollupAddress.toString());

      try {
        l1GenesisRoot = await currentRollup.getGenesisArchiveTreeRoot();
      } catch {
        userLog(`Failed to fetch genesis root from rollup at ${currentRollupAddress}. Retrying...`);
        continue;
      }

      if (l1GenesisRoot.equals(expectedGenesisRoot)) {
        userLog(`Compatible rollup found at ${currentRollupAddress}. Exiting standby mode.`);
        return;
      }

      userLog(`Still waiting. Rollup at ${currentRollupAddress} has genesis root ${l1GenesisRoot}.`);
    }
  } finally {
    await new Promise<void>((resolve, reject) => standbyServer.close(err => (err ? reject(err) : resolve())));
  }
}

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
      // Keep retrying up to 30s
      const fetch = makeTracedFetch(
        [1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3],
        false,
        makeUndiciFetch(new Agent({ connections: 100 })),
      );
      broker = createProvingJobBrokerClient(nodeConfig.proverBrokerUrl, getVersions(nodeConfig), fetch);
    } else if (options.proverBroker) {
      ({ broker } = await startProverBroker(options, signalHandlers, services, userLog));
    } else {
      userLog(`--prover-broker-url or --prover-broker is required to start a Prover Node`);
      process.exit(1);
    }
  }

  await preloadCrsDataForVerifying(nodeConfig, userLog);

  const testAccounts = nodeConfig.testAccounts ? (await getInitialTestAccountsData()).map(a => a.address) : [];
  const sponsoredFPCAccounts = nodeConfig.sponsoredFPC ? [await getSponsoredFPCAddress()] : [];
  const initialFundedAccounts = testAccounts.concat(sponsoredFPCAccounts);

  userLog(`Initial funded accounts: ${initialFundedAccounts.map(a => a.toString()).join(', ')}`);

  const { genesisArchiveRoot, prefilledPublicData } = await getGenesisValues(initialFundedAccounts);

  userLog(`Genesis archive root: ${genesisArchiveRoot.toString()}`);

  const followsCanonicalRollup =
    typeof nodeConfig.rollupVersion !== 'number' || (nodeConfig.rollupVersion as unknown as string) === 'canonical';

  if (!nodeConfig.l1Contracts.registryAddress || nodeConfig.l1Contracts.registryAddress.isZero()) {
    throw new Error('L1 registry address is required to start Aztec Node');
  }

  // Wait for a compatible rollup before proceeding with full L1 config fetch.
  // This prevents crashes when the canonical rollup hasn't been upgraded yet.
  const publicClient = getPublicClient(nodeConfig);
  const rollupVersion: number | 'canonical' = nodeConfig.rollupVersion ?? 'canonical';
  await waitForCompatibleRollup(
    publicClient,
    nodeConfig.l1Contracts.registryAddress,
    rollupVersion,
    genesisArchiveRoot,
    options.port,
    userLog,
  );

  const { addresses, config } = await getL1Config(
    nodeConfig.l1Contracts.registryAddress,
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

  // TODO(#12272): will clean this up.
  nodeConfig = {
    ...nodeConfig,
    l1Contracts: {
      ...addresses,
      slashFactoryAddress: nodeConfig.l1Contracts.slashFactoryAddress,
    },
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
  const node = await createAztecNode(nodeConfig, { telemetry, proverBroker: broker }, { prefilledPublicData });

  // Add node and p2p to services list
  services.node = [node, AztecNodeApiSchema];
  services.p2p = [node.getP2P(), P2PApiSchema];
  adminServices.nodeAdmin = [node, AztecNodeAdminApiSchema];

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

  if (nodeConfig.enableVersionCheck && networkName !== 'local') {
    const cacheDir = process.env.DATA_DIRECTORY ? `${process.env.DATA_DIRECTORY}/cache` : undefined;
    try {
      await setupVersionChecker(
        networkName,
        followsCanonicalRollup,
        getPublicClient(nodeConfig!),
        signalHandlers,
        cacheDir,
      );
    } catch {
      /* no-op */
    }
  }

  return { config: nodeConfig };
}
