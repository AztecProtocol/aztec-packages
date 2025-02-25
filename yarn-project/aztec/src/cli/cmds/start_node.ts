import { getInitialTestAccounts } from '@aztec/accounts/testing';
import { aztecNodeConfigMappings, getConfigEnvVars as getNodeConfigEnvVars } from '@aztec/aztec-node';
import { AztecNodeApiSchema, type PXE } from '@aztec/circuits.js/interfaces/client';
import { P2PApiSchema } from '@aztec/circuits.js/interfaces/server';
import { NULL_KEY } from '@aztec/ethereum';
import { type NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import { type LogFn } from '@aztec/foundation/log';
import {
  type TelemetryClientConfig,
  initTelemetryClient,
  telemetryClientConfigMappings,
} from '@aztec/telemetry-client';
import { getGenesisValues } from '@aztec/world-state/testing';

import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';

import { createAztecNode, deployContractsToL1 } from '../../sandbox.js';
import { extractNamespacedOptions, extractRelevantOptions } from '../util.js';
import { validateL1Config } from '../validation.js';

export async function startNode(
  options: any,
  signalHandlers: (() => Promise<void>)[],
  services: NamespacedApiHandlers,
  userLog: LogFn,
) {
  // options specifically namespaced with --node.<option>
  const nodeSpecificOptions = extractNamespacedOptions(options, 'node');
  // All options that are relevant to the Aztec Node
  const nodeConfig = {
    ...extractRelevantOptions(options, aztecNodeConfigMappings, 'node'),
  };

  if (options.proverNode) {
    userLog(`Running a Prover Node within a Node is not yet supported`);
    process.exit(1);
  }

  const initialFundedAccounts = nodeConfig.testAccounts ? await getInitialTestAccounts() : [];
  const { genesisBlockHash, genesisArchiveRoot, prefilledPublicData } = await getGenesisValues(
    initialFundedAccounts.map(a => a.address),
  );

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
      genesisBlockHash,
      genesisArchiveRoot,
    });
  }
  // If not deploying, validate that the addresses and config provided are correct.
  // Eventually, we should be able to dynamically load this just by having the L1 governance address,
  // instead of only validating the config the user has entered.
  else {
    await validateL1Config({ ...getNodeConfigEnvVars(), ...nodeConfig });
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
    const sequencerConfig = extractNamespacedOptions(options, 'sequencer');
    let account;
    if (!sequencerConfig.publisherPrivateKey || sequencerConfig.publisherPrivateKey === NULL_KEY) {
      if (!options.l1Mnemonic) {
        userLog(
          '--sequencer.publisherPrivateKey or --l1-mnemonic is required to start Aztec Node with --sequencer option',
        );
        throw new Error('Private key or Mnemonic is required to start Aztec Node with --sequencer option');
      } else {
        account = mnemonicToAccount(options.l1Mnemonic);
        const privKey = account.getHdKey().privateKey;
        nodeConfig.publisherPrivateKey = `0x${Buffer.from(privKey!).toString('hex')}`;
      }
    } else {
      nodeConfig.publisherPrivateKey = sequencerConfig.publisherPrivateKey;
    }
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

  return { config: nodeConfig };
}
