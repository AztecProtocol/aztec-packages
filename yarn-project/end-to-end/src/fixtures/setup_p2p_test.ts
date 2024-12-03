/**
 * Test fixtures and utilities to set up and run a test using multiple validators
 */
import { type AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { type SentTx, createDebugLogger } from '@aztec/aztec.js';
import { type AztecAddress } from '@aztec/circuits.js';
import { type PXEService } from '@aztec/pxe';

import getPort from 'get-port';

import { getPrivateKeyFromIndex } from './utils.js';
import { getEndToEndTestTelemetryClient } from './with_telemetry_utils.js';

// Setup snapshots will create a node with index 0, so all of our loops here
// need to start from 1 to avoid running validators with the same key
export const PRIVATE_KEYS_START_INDEX = 1;

export interface NodeContext {
  node: AztecNodeService;
  pxeService: PXEService;
  txs: SentTx[];
  account: AztecAddress;
}

export function generateNodePrivateKeys(startIndex: number, numberOfNodes: number): `0x${string}`[] {
  const nodePrivateKeys: `0x${string}`[] = [];
  // Do not start from 0 as it is used during setup
  for (let i = startIndex; i < startIndex + numberOfNodes; i++) {
    nodePrivateKeys.push(`0x${getPrivateKeyFromIndex(i)!.toString('hex')}`);
  }
  return nodePrivateKeys;
}

export function createNodes(
  config: AztecNodeConfig,
  bootstrapNodeEnr: string,
  numNodes: number,
  bootNodePort: number,
  dataDirectory?: string,
  metricsPort?: number,
): Promise<AztecNodeService[]> {
  const nodePromises = [];
  for (let i = 0; i < numNodes; i++) {
    // We run on ports from the bootnode upwards
    const port = bootNodePort + i + 1;

    const dataDir = dataDirectory ? `${dataDirectory}-${i}` : undefined;
    const nodePromise = createNode(config, port, bootstrapNodeEnr, i + PRIVATE_KEYS_START_INDEX, dataDir, metricsPort);
    nodePromises.push(nodePromise);
  }
  return Promise.all(nodePromises);
}

// creates a P2P enabled instance of Aztec Node Service
export async function createNode(
  config: AztecNodeConfig,
  tcpPort: number,
  bootstrapNode: string | undefined,
  publisherAddressIndex: number,
  dataDirectory?: string,
  metricsPort?: number,
) {
  const validatorConfig = await createValidatorConfig(
    config,
    bootstrapNode,
    tcpPort,
    publisherAddressIndex,
    dataDirectory,
  );

  const telemetryClient = await getEndToEndTestTelemetryClient(metricsPort, /*serviceName*/ `node:${tcpPort}`);

  return await AztecNodeService.createAndSync(validatorConfig, {
    telemetry: telemetryClient,
    logger: createDebugLogger(`aztec:node-${tcpPort}`),
  });
}

export async function createValidatorConfig(
  config: AztecNodeConfig,
  bootstrapNodeEnr?: string,
  port?: number,
  accountIndex: number = 1,
  dataDirectory?: string,
) {
  port = port ?? (await getPort());

  const privateKey = getPrivateKeyFromIndex(accountIndex);
  const privateKeyHex: `0x${string}` = `0x${privateKey!.toString('hex')}`;

  config.publisherPrivateKey = privateKeyHex;
  config.validatorPrivateKey = privateKeyHex;

  const nodeConfig: AztecNodeConfig = {
    ...config,
    udpListenAddress: `0.0.0.0:${port}`,
    tcpListenAddress: `0.0.0.0:${port}`,
    tcpAnnounceAddress: `127.0.0.1:${port}`,
    udpAnnounceAddress: `127.0.0.1:${port}`,
    p2pEnabled: true,
    blockCheckIntervalMS: 1000,
    transactionProtocol: '',
    dataDirectory,
    bootstrapNodes: bootstrapNodeEnr ? [bootstrapNodeEnr] : [],
  };

  return nodeConfig;
}
