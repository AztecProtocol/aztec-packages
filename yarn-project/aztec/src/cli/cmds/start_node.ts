import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { type AztecNodeConfig, aztecNodeConfigMappings, getConfigEnvVars } from '@aztec/aztec-node';
import { Fr } from '@aztec/aztec.js';
import { getSponsoredFPCAddress } from '@aztec/cli/cli-utils';
import { getL1Config } from '@aztec/cli/config';
import { getPublicClient } from '@aztec/ethereum';
import { SecretValue } from '@aztec/foundation/config';
import type { NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import type { LogFn } from '@aztec/foundation/log';
import { type CliPXEOptions, type PXEConfig, allPxeConfigMappings } from '@aztec/pxe/config';
import { AztecNodeAdminApiSchema, AztecNodeApiSchema } from '@aztec/stdlib/interfaces/client';
import { P2PApiSchema } from '@aztec/stdlib/interfaces/server';
import {
  type TelemetryClientConfig,
  initTelemetryClient,
  telemetryClientConfigMappings,
} from '@aztec/telemetry-client';
import { TestWallet } from '@aztec/test-wallet/server';
import { getGenesisValues } from '@aztec/world-state/testing';

import { createAztecNode } from '../../sandbox/index.js';
import {
  extractNamespacedOptions,
  extractRelevantOptions,
  preloadCrsDataForVerifying,
  setupUpdateMonitor,
} from '../util.js';

export async function startNode(
  options: any,
  signalHandlers: (() => Promise<void>)[],
  services: NamespacedApiHandlers,
  adminServices: NamespacedApiHandlers,
  userLog: LogFn,
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

  if (options.proverNode) {
    userLog(`Running a Prover Node within a Node is not yet supported`);
    process.exit(1);
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

  if (!options.sequencer) {
    nodeConfig.disableValidator = true;
  } else {
    const sequencerConfig = {
      ...configFromEnvVars,
      ...extractNamespacedOptions(options, 'sequencer'),
    };
    // If no publisher private keys have been given, use the first validator key
    if (sequencerConfig.publisherPrivateKeys === undefined || !sequencerConfig.publisherPrivateKeys.length) {
      if (sequencerConfig.validatorPrivateKeys?.getValue().length) {
        sequencerConfig.publisherPrivateKeys = [new SecretValue(sequencerConfig.validatorPrivateKeys.getValue()[0])];
      }
    }
    nodeConfig.publisherPrivateKeys = sequencerConfig.publisherPrivateKeys;
  }

  if (nodeConfig.p2pEnabled) {
    // ensure bootstrapNodes is an array
    if (nodeConfig.bootstrapNodes && typeof nodeConfig.bootstrapNodes === 'string') {
      nodeConfig.bootstrapNodes = (nodeConfig.bootstrapNodes as string).split(',');
    }
  }

  const telemetryConfig = extractRelevantOptions<TelemetryClientConfig>(options, telemetryClientConfigMappings, 'tel');
  const telemetry = initTelemetryClient(telemetryConfig);

  // Create and start Aztec Node
  const node = await createAztecNode(nodeConfig, { telemetry }, { prefilledPublicData });

  // Add node and p2p to services list
  services.node = [node, AztecNodeApiSchema];
  services.p2p = [node.getP2P(), P2PApiSchema];
  adminServices.nodeAdmin = [node, AztecNodeAdminApiSchema];

  // Add node stop function to signal handlers
  signalHandlers.push(node.stop.bind(node));

  // Add a txs bot if requested
  if (options.bot) {
    const { addBot } = await import('./start_bot.js');

    const pxeConfig = extractRelevantOptions<PXEConfig & CliPXEOptions>(options, allPxeConfigMappings, 'pxe');
    const wallet = await TestWallet.create(node, pxeConfig);

    await addBot(options, signalHandlers, services, wallet, node, telemetry, undefined);
  }

  if (nodeConfig.autoUpdate !== 'disabled' && nodeConfig.autoUpdateUrl) {
    await setupUpdateMonitor(
      nodeConfig.autoUpdate,
      new URL(nodeConfig.autoUpdateUrl),
      followsCanonicalRollup,
      getPublicClient(nodeConfig!),
      nodeConfig.l1Contracts.registryAddress,
      signalHandlers,
      async config => node.setConfig((await AztecNodeAdminApiSchema.setConfig.parameters().parseAsync([config]))[0]),
    );
  }

  return { config: nodeConfig };
}
