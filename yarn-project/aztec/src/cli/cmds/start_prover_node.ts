import { getInitialTestAccounts } from '@aztec/accounts/testing';
import { Fr } from '@aztec/aztec.js';
import { getSponsoredFPCAddress } from '@aztec/cli/cli-utils';
import { NULL_KEY, getPublicClient } from '@aztec/ethereum';
import type { NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import { Agent, makeUndiciFetch } from '@aztec/foundation/json-rpc/undici';
import type { LogFn } from '@aztec/foundation/log';
import { ProvingJobConsumerSchema, createProvingJobBrokerClient } from '@aztec/prover-client/broker';
import {
  type ProverNodeConfig,
  createProverNode,
  getProverNodeConfigFromEnv,
  proverNodeConfigMappings,
} from '@aztec/prover-node';
import { P2PApiSchema, ProverNodeApiSchema, type ProvingJobBroker } from '@aztec/stdlib/interfaces/server';
import { initTelemetryClient, makeTracedFetch, telemetryClientConfigMappings } from '@aztec/telemetry-client';
import { getGenesisValues } from '@aztec/world-state/testing';

import { mnemonicToAccount } from 'viem/accounts';

import { getL1Config } from '../get_l1_config.js';
import { extractRelevantOptions, preloadCrsDataForVerifying, setupUpdateMonitor } from '../util.js';
import { getVersions } from '../versioning.js';
import { startProverBroker } from './start_prover_broker.js';

export async function startProverNode(
  options: any,
  signalHandlers: (() => Promise<void>)[],
  services: NamespacedApiHandlers,
  userLog: LogFn,
): Promise<{ config: ProverNodeConfig }> {
  if (options.node || options.sequencer || options.pxe || options.p2pBootstrap || options.txe) {
    userLog(`Starting a prover-node with --node, --sequencer, --pxe, --p2p-bootstrap, or --txe is not supported.`);
    process.exit(1);
  }

  let proverConfig = {
    ...getProverNodeConfigFromEnv(), // get default config from env
    ...extractRelevantOptions<ProverNodeConfig>(options, proverNodeConfigMappings, 'proverNode'), // override with command line options
  };

  if (!options.archiver && !proverConfig.archiverUrl) {
    userLog('--archiver.archiverUrl is required to start a Prover Node without --archiver option');
    process.exit(1);
  }

  if (!proverConfig.publisherPrivateKey || proverConfig.publisherPrivateKey === NULL_KEY) {
    if (!options.l1Mnemonic) {
      userLog(`--l1-mnemonic is required to start a Prover Node without --node.publisherPrivateKey`);
      process.exit(1);
    }
    const hdAccount = mnemonicToAccount(options.l1Mnemonic);
    const privKey = hdAccount.getHdKey().privateKey;
    proverConfig.publisherPrivateKey = `0x${Buffer.from(privKey!).toString('hex')}`;
  }

  if (!proverConfig.l1Contracts.registryAddress || proverConfig.l1Contracts.registryAddress.isZero()) {
    throw new Error('L1 registry address is required to start a Prover Node with --archiver option');
  }

  const followsCanonicalRollup = typeof proverConfig.rollupVersion !== 'number';
  const { addresses, config } = await getL1Config(
    proverConfig.l1Contracts.registryAddress,
    proverConfig.l1RpcUrls,
    proverConfig.l1ChainId,
    proverConfig.rollupVersion,
  );
  proverConfig.l1Contracts = addresses;
  proverConfig = { ...proverConfig, ...config };

  const testAccounts = proverConfig.testAccounts ? (await getInitialTestAccounts()).map(a => a.address) : [];
  const sponsoredFPCAccounts = proverConfig.sponsoredFPC ? [await getSponsoredFPCAddress()] : [];
  const initialFundedAccounts = testAccounts.concat(sponsoredFPCAccounts);

  userLog(`Initial funded accounts: ${initialFundedAccounts.map(a => a.toString()).join(', ')}`);
  const { genesisArchiveRoot, prefilledPublicData } = await getGenesisValues(initialFundedAccounts);

  userLog(`Genesis archive root: ${genesisArchiveRoot.toString()}`);

  if (!Fr.fromHexString(config.genesisArchiveTreeRoot).equals(genesisArchiveRoot)) {
    throw new Error(
      `The computed genesis archive tree root ${genesisArchiveRoot} does not match the expected genesis archive tree root ${config.genesisArchiveTreeRoot} for the rollup deployed at ${addresses.rollupAddress}`,
    );
  }

  const telemetry = initTelemetryClient(extractRelevantOptions(options, telemetryClientConfigMappings, 'tel'));

  let broker: ProvingJobBroker;
  if (proverConfig.proverBrokerUrl) {
    // at 1TPS we'd enqueue ~1k tube proofs and ~1k AVM proofs immediately
    // set a lower connectio  limit such that we don't overload the server
    const fetch = makeTracedFetch([1, 2, 3], false, makeUndiciFetch(new Agent({ connections: 100 })));
    broker = createProvingJobBrokerClient(proverConfig.proverBrokerUrl, getVersions(proverConfig), fetch);
  } else if (options.proverBroker) {
    ({ broker } = await startProverBroker(options, signalHandlers, services, userLog));
  } else {
    userLog(`--prover-broker-url or --prover-broker is required to start a Prover Node`);
    process.exit(1);
  }

  if (proverConfig.proverAgentCount === 0) {
    userLog(
      `Running prover node without local prover agent. Connect one or more prover agents to this node or pass --proverAgent.proverAgentCount`,
    );
  }

  await preloadCrsDataForVerifying(proverConfig, userLog);

  const proverNode = await createProverNode(proverConfig, { telemetry, broker }, { prefilledPublicData });
  services.proverNode = [proverNode, ProverNodeApiSchema];

  if (proverNode.getP2P()) {
    services.p2p = [proverNode.getP2P()!, P2PApiSchema];
  }

  if (!proverConfig.proverBrokerUrl) {
    services.provingJobSource = [proverNode.getProver().getProvingJobSource(), ProvingJobConsumerSchema];
  }

  signalHandlers.push(proverNode.stop.bind(proverNode));

  await proverNode.start();

  if (proverConfig.autoUpdate !== 'disabled' && proverConfig.autoUpdateUrl) {
    await setupUpdateMonitor(
      proverConfig.autoUpdate,
      new URL(proverConfig.autoUpdateUrl),
      followsCanonicalRollup,
      getPublicClient(proverConfig),
      proverConfig.l1Contracts.registryAddress,
      signalHandlers,
    );
  }
  return { config: proverConfig };
}
