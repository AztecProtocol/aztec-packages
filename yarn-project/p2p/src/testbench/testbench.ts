import { Tx } from '@aztec/circuit-types';
import { type ChainConfig } from '@aztec/circuit-types/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';

import { type ChildProcess, fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

import { type P2PConfig, getP2PDefaultConfig } from '../config.js';
import { generatePeerIdPrivateKeys } from '../test-helpers/generate-peer-id-private-keys.js';
import { getPorts } from '../test-helpers/get-ports.js';
import { makeEnrs } from '../test-helpers/make-enrs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(__dirname, '../../dest/testbench/p2p_client_testbench_worker.js');
const logger = createLogger('testbench');

let processes: ChildProcess[] = [];

const testChainConfig: ChainConfig = {
  l1ChainId: 31337,
  version: 1,
  l1Contracts: {
    rollupAddress: EthAddress.random(),
  },
};

/**
 * Cleanup function to kill all child processes
 */
async function cleanup() {
  logger.info('Cleaning up processes...');
  await Promise.all(
    processes.map(
      proc =>
        new Promise<void>(resolve => {
          proc.once('exit', () => resolve());
          proc.send({ type: 'STOP' });
        }),
    ),
  );
  process.exit(0);
}

// Handle cleanup on process termination
process.on('SIGINT', () => void cleanup());
process.on('SIGTERM', () => void cleanup());

/**
 * Creates a number of worker clients in separate processes
 * All are configured to connect to each other and overrided with the test specific config
 *
 * @param numberOfClients - The number of clients to create
 * @param p2pConfig - The P2P config to use for the clients
 * @returns The ENRs of the created clients
 */
async function makeWorkerClients(numberOfClients: number, p2pConfig: Partial<P2PConfig>) {
  const peerIdPrivateKeys = generatePeerIdPrivateKeys(numberOfClients);
  const ports = await getPorts(numberOfClients);
  const peerEnrs = await makeEnrs(peerIdPrivateKeys, ports, testChainConfig);

  processes = [];
  const readySignals: Promise<void>[] = [];
  for (let i = 0; i < numberOfClients; i++) {
    logger.info(`Creating client ${i}`);
    const addr = `127.0.0.1:${ports[i]}`;
    const listenAddr = `0.0.0.0:${ports[i]}`;

    // Maximum seed with 10 other peers to allow peer discovery to connect them at a smoother rate
    const otherNodes = peerEnrs.filter((_, ind) => ind < Math.min(i, 10));

    const config: P2PConfig & Partial<ChainConfig> = {
      ...getP2PDefaultConfig(),
      p2pEnabled: true,
      peerIdPrivateKey: peerIdPrivateKeys[i],
      tcpListenAddress: listenAddr,
      udpListenAddress: listenAddr,
      tcpAnnounceAddress: addr,
      udpAnnounceAddress: addr,
      bootstrapNodes: [...otherNodes],
      ...p2pConfig,
    };

    const childProcess = fork(workerPath);
    childProcess.send({ type: 'START', config, clientIndex: i });

    // Wait for ready signal
    readySignals.push(
      new Promise((resolve, reject) => {
        childProcess.once('message', (msg: any) => {
          if (msg.type === 'READY') {
            resolve(undefined);
          }
          if (msg.type === 'ERROR') {
            reject(new Error(msg.error));
          }
        });
      }),
    );

    processes.push(childProcess);
  }
  // Wait for peers to all connect with each other
  await sleep(4000);

  // Wait for all peers to be booted up
  await Promise.all(readySignals);

  return peerEnrs;
}

async function main() {
  try {
    // Read configuration file name from command line args
    const configFile = process.argv[2];
    if (!configFile) {
      throw new Error('Configuration file must be provided as first argument');
    }

    const configPath = path.join(__dirname, '../../testbench/configurations', configFile);
    const config = await import(configPath, { assert: { type: 'json' } });
    const testConfig = { ...testChainConfig, ...config.default };
    const numberOfClients = config.default.numberOfClients;

    // Setup clients in separate processes
    await makeWorkerClients(numberOfClients, testConfig);

    // wait a bit longer for all peers to be ready
    await sleep(5000);
    logger.info('Workers Ready');

    // Send tx from client 0
    const tx = await Tx.random(/* randomProof */ true);
    processes[0].send({ type: 'SEND_TX', tx: tx.toBuffer() });
    logger.info('Transaction sent from client 0');

    // Give time for message propagation
    await sleep(30000);
    logger.info('Checking message propagation results');

    await cleanup();
  } catch (error) {
    logger.error('Test failed with error:', error);
    await cleanup();
    process.exit(1);
  }
}

main().catch(error => {
  logger.error('Unhandled error:', error);
  cleanup().catch(() => process.exit(1));
});
