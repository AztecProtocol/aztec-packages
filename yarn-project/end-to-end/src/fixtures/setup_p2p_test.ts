/**
 * Test fixtures and utilities to set up and run a test using multiple validators
 */
import { type AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { type SentTx } from '@aztec/aztec.js';
import { type PublicDataTreeLeaf } from '@aztec/circuits.js';
import { addLogNameHandler, removeLogNameHandler } from '@aztec/foundation/log';
import { type DateProvider } from '@aztec/foundation/timer';
import { type PXEService } from '@aztec/pxe';

import getPort from 'get-port';
import { AsyncLocalStorage } from 'node:async_hooks';

import { TEST_PEER_CHECK_INTERVAL_MS } from './fixtures.js';
import { getPrivateKeyFromIndex } from './utils.js';
import { getEndToEndTestTelemetryClient } from './with_telemetry_utils.js';

// Setup snapshots will create a node with index 0, so all of our loops here
// need to start from 1 to avoid running validators with the same key
export const PROPOSER_PRIVATE_KEYS_START_INDEX = 1;
export const ATTESTER_PRIVATE_KEYS_START_INDEX = 1001;

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
): Promise<AztecNodeService[]> {
  const nodePromises: Promise<AztecNodeService>[] = [];
  const loggerIdStorage = new AsyncLocalStorage<string>();
  const logNameHandler = (module: string) =>
    loggerIdStorage.getStore() ? `${module}:${loggerIdStorage.getStore()}` : module;
  addLogNameHandler(logNameHandler);

  for (let i = 0; i < numNodes; i++) {
    // We run on ports from the bootnode upwards
    const port = bootNodePort + i + 1;

    const dataDir = dataDirectory ? `${dataDirectory}-${i}` : undefined;
    const nodePromise = createNode(
      config,
      dateProvider,
      port,
      bootstrapNodeEnr,
      i,
      prefilledPublicData,
      dataDir,
      metricsPort,
      loggerIdStorage,
    );
    nodePromises.push(nodePromise);
  }
  const nodes = await Promise.all(nodePromises);
  removeLogNameHandler(logNameHandler);
  return nodes;
}

// creates a P2P enabled instance of Aztec Node Service
export async function createNode(
  config: AztecNodeConfig,
  dateProvider: DateProvider,
  tcpPort: number,
  bootstrapNode: string | undefined,
  accountIndex: number,
  prefilledPublicData?: PublicDataTreeLeaf[],
  dataDirectory?: string,
  metricsPort?: number,
  loggerIdStorage?: AsyncLocalStorage<string>,
) {
  const createNode = async () => {
    const validatorConfig = await createValidatorConfig(config, bootstrapNode, tcpPort, accountIndex, dataDirectory);
    const telemetry = getEndToEndTestTelemetryClient(metricsPort);
    return await AztecNodeService.createAndSync(validatorConfig, { telemetry, dateProvider }, { prefilledPublicData });
  };
  return loggerIdStorage ? await loggerIdStorage.run(tcpPort.toString(), createNode) : createNode();
}

export async function createValidatorConfig(
  config: AztecNodeConfig,
  bootstrapNodeEnr?: string,
  port?: number,
  accountIndex: number = 1,
  dataDirectory?: string,
) {
  port = port ?? (await getPort());

  const attesterPrivateKey: `0x${string}` = `0x${getPrivateKeyFromIndex(
    ATTESTER_PRIVATE_KEYS_START_INDEX + accountIndex,
  )!.toString('hex')}`;
  const proposerPrivateKey: `0x${string}` = `0x${getPrivateKeyFromIndex(
    PROPOSER_PRIVATE_KEYS_START_INDEX + accountIndex,
  )!.toString('hex')}`;

  config.validatorPrivateKey = attesterPrivateKey;
  config.publisherPrivateKey = proposerPrivateKey;

  const nodeConfig: AztecNodeConfig = {
    ...config,
    udpListenAddress: `0.0.0.0:${port}`,
    tcpListenAddress: `0.0.0.0:${port}`,
    tcpAnnounceAddress: `127.0.0.1:${port}`,
    udpAnnounceAddress: `127.0.0.1:${port}`,
    p2pEnabled: true,
    peerCheckIntervalMS: TEST_PEER_CHECK_INTERVAL_MS,
    blockCheckIntervalMS: 1000,
    transactionProtocol: '',
    dataDirectory,
    bootstrapNodes: bootstrapNodeEnr ? [bootstrapNodeEnr] : [],
  };

  return nodeConfig;
}
