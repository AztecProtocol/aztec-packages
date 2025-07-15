/**
 * Test fixtures and utilities to set up and run a test using multiple validators
 */
import { type AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import type { SentTx } from '@aztec/aztec.js';
import { SecretValue } from '@aztec/foundation/config';
import { addLogNameHandler, removeLogNameHandler } from '@aztec/foundation/log';
import { bufferToHex } from '@aztec/foundation/string';
import type { DateProvider } from '@aztec/foundation/timer';
import type { ProverNodeConfig, ProverNodeDeps } from '@aztec/prover-node';
import type { PXEService } from '@aztec/pxe/server';
import type { PublicDataTreeLeaf } from '@aztec/stdlib/trees';

import getPort from 'get-port';
import { AsyncLocalStorage } from 'node:async_hooks';

import { TEST_PEER_CHECK_INTERVAL_MS } from './fixtures.js';
import { createAndSyncProverNode, getPrivateKeyFromIndex } from './utils.js';
import { getEndToEndTestTelemetryClient } from './with_telemetry_utils.js';

// Setup snapshots will create a node with index 0, and run extra bootstrap with
// index 1, so all of our loops here need to start from 2 to avoid running validators with the same key
export const ATTESTER_PRIVATE_KEYS_START_INDEX = 2;
// We use slasher keys after the first 10 anvil keys, note that this requires anvil to be started with more than the default 10 accounts
export const SLASHER_PRIVATE_KEYS_START_INDEX = 12;

export interface NodeContext {
  node: AztecNodeService;
  pxeService: PXEService;
  txs: SentTx[];
}

export function generatePrivateKeys(startIndex: number, numberOfKeys: number): `0x${string}`[] {
  const privateKeys: `0x${string}`[] = [];
  // Do not start from 0 as it is used during setup
  for (let i = startIndex; i < startIndex + numberOfKeys; i++) {
    privateKeys.push(`0x${getPrivateKeyFromIndex(i)!.toString('hex')}`);
  }
  return privateKeys;
}

export async function createNodes(
  config: AztecNodeConfig,
  dateProvider: DateProvider,
  bootstrapNodeEnr: string,
  numNodes: number,
  bootNodePort: number,
  prefilledPublicData?: PublicDataTreeLeaf[],
  dataDirectory?: string,
  metricsPort?: number,
  indexOffset = 0,
): Promise<AztecNodeService[]> {
  const nodePromises: Promise<AztecNodeService>[] = [];
  const loggerIdStorage = new AsyncLocalStorage<string>();
  const logNameHandler = (module: string) =>
    loggerIdStorage.getStore() ? `${module}:${loggerIdStorage.getStore()}` : module;
  addLogNameHandler(logNameHandler);

  for (let i = 0; i < numNodes; i++) {
    const index = indexOffset + i;
    // We run on ports from the bootnode upwards
    const port = bootNodePort + 1 + index;

    const dataDir = dataDirectory ? `${dataDirectory}-${index}` : undefined;
    const nodePromise = createNode(
      config,
      dateProvider,
      port,
      bootstrapNodeEnr,
      index,
      prefilledPublicData,
      dataDir,
      metricsPort,
      loggerIdStorage,
    );
    nodePromises.push(nodePromise);
  }
  const nodes = await Promise.all(nodePromises);

  // Sanity check that we have a sequencer if required
  const seqClient = nodes[0].getSequencer();
  if (!seqClient && config.disableValidator === false) {
    throw new Error('Sequencer not found');
  }

  removeLogNameHandler(logNameHandler);
  return nodes;
}

// creates a P2P enabled instance of Aztec Node Service
export async function createNode(
  config: AztecNodeConfig,
  dateProvider: DateProvider,
  tcpPort: number,
  bootstrapNode: string | undefined,
  addressIndex: number,
  prefilledPublicData?: PublicDataTreeLeaf[],
  dataDirectory?: string,
  metricsPort?: number,
  loggerIdStorage?: AsyncLocalStorage<string>,
) {
  const createNode = async () => {
    const validatorConfig = await createValidatorConfig(config, bootstrapNode, tcpPort, addressIndex, dataDirectory);
    const telemetry = getEndToEndTestTelemetryClient(metricsPort);
    return await AztecNodeService.createAndSync(validatorConfig, { telemetry, dateProvider }, { prefilledPublicData });
  };
  return loggerIdStorage ? await loggerIdStorage.run(tcpPort.toString(), createNode) : createNode();
}

export async function createProverNode(
  config: AztecNodeConfig,
  tcpPort: number,
  bootstrapNode: string | undefined,
  addressIndex: number,
  proverNodeDeps: ProverNodeDeps & Required<Pick<ProverNodeDeps, 'dateProvider'>>,
  prefilledPublicData?: PublicDataTreeLeaf[],
  dataDirectory?: string,
  metricsPort?: number,
  loggerIdStorage?: AsyncLocalStorage<string>,
) {
  const createProverNode = async () => {
    const proverNodePrivateKey = getPrivateKeyFromIndex(ATTESTER_PRIVATE_KEYS_START_INDEX + addressIndex)!;
    const telemetry = getEndToEndTestTelemetryClient(metricsPort);

    const proverConfig: Partial<ProverNodeConfig> = {
      p2pIp: `127.0.0.1`,
      p2pPort: tcpPort ?? (await getPort()),
      p2pEnabled: true,
      peerCheckIntervalMS: TEST_PEER_CHECK_INTERVAL_MS,
      blockCheckIntervalMS: 1000,
      bootstrapNodes: bootstrapNode ? [bootstrapNode] : [],
    };
    const aztecNodeRpcTxProvider = undefined;
    return await createAndSyncProverNode(
      bufferToHex(proverNodePrivateKey),
      config,
      { ...proverConfig, dataDirectory },
      aztecNodeRpcTxProvider,
      prefilledPublicData,
      { ...proverNodeDeps, telemetry },
    );
  };
  return loggerIdStorage ? await loggerIdStorage.run(tcpPort.toString(), createProverNode) : createProverNode();
}

export async function createValidatorConfig(
  config: AztecNodeConfig,
  bootstrapNodeEnr?: string,
  port?: number,
  addressIndex: number = 1,
  dataDirectory?: string,
) {
  port = port ?? (await getPort());

  const attesterPrivateKey = bufferToHex(getPrivateKeyFromIndex(ATTESTER_PRIVATE_KEYS_START_INDEX + addressIndex)!);
  const slasherPrivateKey = bufferToHex(getPrivateKeyFromIndex(SLASHER_PRIVATE_KEYS_START_INDEX + addressIndex)!);

  config.validatorPrivateKeys = new SecretValue([attesterPrivateKey]);
  config.publisherPrivateKey = new SecretValue(attesterPrivateKey);
  config.slasherPrivateKey = new SecretValue(slasherPrivateKey);

  const nodeConfig: AztecNodeConfig = {
    ...config,
    p2pIp: `127.0.0.1`,
    p2pPort: port,
    p2pEnabled: true,
    peerCheckIntervalMS: TEST_PEER_CHECK_INTERVAL_MS,
    blockCheckIntervalMS: 1000,
    dataDirectory,
    bootstrapNodes: bootstrapNodeEnr ? [bootstrapNodeEnr] : [],
  };

  return nodeConfig;
}
