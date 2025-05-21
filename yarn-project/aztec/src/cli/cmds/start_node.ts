import { getInitialTestAccounts } from '@aztec/accounts/testing';
import { type AztecNodeConfig, aztecNodeConfigMappings, getConfigEnvVars } from '@aztec/aztec-node';
import { EthAddress, Fr } from '@aztec/aztec.js';
import { getSponsoredFPCAddress } from '@aztec/cli/cli-utils';
import { NULL_KEY, getAddressFromPrivateKey, getPublicClient } from '@aztec/ethereum';
import type { NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import type { LogFn } from '@aztec/foundation/log';
import { AztecNodeAdminApiSchema, AztecNodeApiSchema, type PXE } from '@aztec/stdlib/interfaces/client';
import { P2PApiSchema } from '@aztec/stdlib/interfaces/server';
import {
  type TelemetryClientConfig,
  initTelemetryClient,
  telemetryClientConfigMappings,
} from '@aztec/telemetry-client';
import { getGenesisValues } from '@aztec/world-state/testing';

import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';

import { createAztecNode, deployContractsToL1 } from '../../sandbox/index.js';
import { getL1Config } from '../get_l1_config.js';
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
  // options specifically namespaced with --node.<option>
  const nodeSpecificOptions = extractNamespacedOptions(options, 'node');

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

  const testAccounts = nodeConfig.testAccounts ? (await getInitialTestAccounts()).map(a => a.address) : [];
  const sponsoredFPCAccounts = nodeConfig.sponsoredFPC ? [await getSponsoredFPCAddress()] : [];
  const initialFundedAccounts = testAccounts.concat(sponsoredFPCAccounts);

  userLog(`Initial funded accounts: ${initialFundedAccounts.map(a => a.toString()).join(', ')}`);

  const { genesisArchiveRoot, prefilledPublicData, fundingNeeded } = await getGenesisValues(initialFundedAccounts);

  userLog(`Genesis archive root: ${genesisArchiveRoot.toString()}`);

  const followsCanonicalRollup =
    typeof nodeConfig.rollupVersion !== 'number' || (nodeConfig.rollupVersion as unknown as string) === 'canonical';

  // Deploy contracts if needed
  if (nodeSpecificOptions.deployAztecContracts || nodeSpecificOptions.deployAztecContractsSalt) {
    let account;
    if (nodeSpecificOptions.publisherPrivateKey) {
      account = privateKeyToAccount(nodeSpecificOptions.publisherPrivateKey);
    } else if (options.l1Mnemonic) {
      account = mnemonicToAccount(options.l1Mnemonic);
    } else {
      throw new Error('--node.publisherPrivateKey or --l1-mnemonic is required to deploy L1 contracts');
    }
    // REFACTOR: We should not be calling a method from sandbox on the prod start flow
    await deployContractsToL1(nodeConfig, account!, undefined, {
      assumeProvenThroughBlockNumber: nodeSpecificOptions.assumeProvenThroughBlockNumber,
      salt: nodeSpecificOptions.deployAztecContractsSalt,
      genesisArchiveRoot,
      feeJuicePortalInitialBalance: fundingNeeded,
    });
  }
  // If not deploying, validate that any addresses and config provided are correct.
  else {
    if (!nodeConfig.l1Contracts.registryAddress || nodeConfig.l1Contracts.registryAddress.isZero()) {
      throw new Error('L1 registry address is required to start Aztec Node without --deploy-aztec-contracts option');
    }
    const { addresses, config } = await getL1Config(
      nodeConfig.l1Contracts.registryAddress,
      nodeConfig.l1RpcUrls,
      nodeConfig.l1ChainId,
      nodeConfig.rollupVersion,
    );

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
  }

  // if no publisher private key, then use l1Mnemonic
  if (!options.archiver) {
    // expect archiver url in node config
    const archiverUrl = nodeConfig.archiverUrl;
    if (!archiverUrl) {
      userLog('Archiver Service URL is required to start Aztec Node without --archiver option');
      throw new Error('Archiver Service URL is required to start Aztec Node without --archiver option');
    }
    nodeConfig.archiverUrl = archiverUrl;
  }

  if (!options.sequencer) {
    nodeConfig.disableValidator = true;
  } else {
    const sequencerConfig = {
      ...configFromEnvVars,
      ...extractNamespacedOptions(options, 'sequencer'),
    };
    let account;
    if (!sequencerConfig.publisherPrivateKey || sequencerConfig.publisherPrivateKey === NULL_KEY) {
      if (sequencerConfig.validatorPrivateKey) {
        sequencerConfig.publisherPrivateKey = sequencerConfig.validatorPrivateKey as `0x${string}`;
      } else if (!options.l1Mnemonic) {
        userLog(
          '--sequencer.publisherPrivateKey or --l1-mnemonic is required to start Aztec Node with --sequencer option',
        );
        throw new Error('Private key or Mnemonic is required to start Aztec Node with --sequencer option');
      } else {
        account = mnemonicToAccount(options.l1Mnemonic);
        const privKey = account.getHdKey().privateKey;
        sequencerConfig.publisherPrivateKey = `0x${Buffer.from(privKey!).toString('hex')}`;
      }
    }
    nodeConfig.publisherPrivateKey = sequencerConfig.publisherPrivateKey;
    nodeConfig.coinbase ??= EthAddress.fromString(getAddressFromPrivateKey(nodeConfig.publisherPrivateKey));
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

  // Add a PXE client that connects to this node if requested
  let pxe: PXE | undefined;
  if (options.pxe) {
    const { addPXE } = await import('./start_pxe.js');
    ({ pxe } = await addPXE(options, signalHandlers, services, userLog, { node }));
  }

  // Add a txs bot if requested
  if (options.bot) {
    const { addBot } = await import('./start_bot.js');
    await addBot(options, signalHandlers, services, { pxe, node, telemetry });
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
