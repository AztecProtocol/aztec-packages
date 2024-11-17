/**
 * Test fixtures and utilities to set up and run a test using multiple validators
 */
import { type AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { type SentTx, createDebugLogger } from '@aztec/aztec.js';
import { type AztecAddress } from '@aztec/circuits.js';
import { type PXEService } from '@aztec/pxe';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import getPort from 'get-port';
import { generatePrivateKey } from 'viem/accounts';

import { getPrivateKeyFromIndex } from './utils.js';

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

export function generatePeerIdPrivateKey(): string {
  // magic number is multiaddr prefix: https://multiformats.io/multiaddr/ for secp256k1
  return '08021220' + generatePrivateKey().substr(2, 66);
}

export function generatePeerIdPrivateKeys(numberOfPeers: number): string[] {
  const peerIdPrivateKeys = [];
  for (let i = 0; i < numberOfPeers; i++) {
    peerIdPrivateKeys.push(generatePeerIdPrivateKey());
  }
  return peerIdPrivateKeys;
}

export function createNodes(
  config: AztecNodeConfig,
  peerIdPrivateKeys: string[],
  bootstrapNodeEnr: string,
  numNodes: number,
  bootNodePort: number,
  dataDirectory?: string,
): Promise<AztecNodeService[]> {
  const nodePromises = [];
  for (let i = 0; i < numNodes; i++) {
    // We run on ports from the bootnode upwards if a port if provided, otherwise we get a random port
    const port = bootNodePort + i + 1;

    const dataDir = dataDirectory ? `${dataDirectory}-${i}` : undefined;
    const nodePromise = createNode(config, peerIdPrivateKeys[i], port, bootstrapNodeEnr, i, dataDir);
    nodePromises.push(nodePromise);
  }
  return Promise.all(nodePromises);
}

// creates a P2P enabled instance of Aztec Node Service
export async function createNode(
  config: AztecNodeConfig,
  peerIdPrivateKey: string,
  tcpPort: number,
  bootstrapNode: string | undefined,
  publisherAddressIndex: number,
  dataDirectory?: string,
) {
  const validatorConfig = await createValidatorConfig(
    config,
    bootstrapNode,
    tcpPort,
    peerIdPrivateKey,
    publisherAddressIndex,
    dataDirectory,
  );
  return await AztecNodeService.createAndSync(
    validatorConfig,
    new NoopTelemetryClient(),
    createDebugLogger(`aztec:node-${tcpPort}`),
  );
}

export async function createValidatorConfig(
  config: AztecNodeConfig,
  bootstrapNodeEnr?: string,
  port?: number,
  peerIdPrivateKey?: string,
  accountIndex: number = 0,
  dataDirectory?: string,
) {
  peerIdPrivateKey = peerIdPrivateKey ?? generatePeerIdPrivateKey();
  port = port ?? (await getPort());

  const privateKey = getPrivateKeyFromIndex(accountIndex);
  const privateKeyHex: `0x${string}` = `0x${privateKey!.toString('hex')}`;

  config.publisherPrivateKey = privateKeyHex;
  config.validatorPrivateKey = privateKeyHex;

  const nodeConfig: AztecNodeConfig = {
    ...config,
    peerIdPrivateKey: peerIdPrivateKey,
    udpListenAddress: `0.0.0.0:${port}`,
    tcpListenAddress: `0.0.0.0:${port}`,
    tcpAnnounceAddress: `127.0.0.1:${port}`,
    udpAnnounceAddress: `127.0.0.1:${port}`,
    minTxsPerBlock: config.minTxsPerBlock,
    maxTxsPerBlock: config.maxTxsPerBlock,
    p2pEnabled: true,
    blockCheckIntervalMS: 1000,
    transactionProtocol: '',
    dataDirectory,
    bootstrapNodes: bootstrapNodeEnr ? [bootstrapNodeEnr] : [],
  };

  return nodeConfig;
}
