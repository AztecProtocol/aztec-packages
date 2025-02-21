import { type ChainConfig, emptyChainConfig } from '@aztec/circuit-types/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';

import { type ChildProcess, fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

import { mockTx } from '../../../circuit-types/src/test/mocks.js';
import { type P2PConfig, getP2PDefaultConfig } from '../config.js';
import { generatePeerIdPrivateKeys } from '../test-helpers/generate-peer-id-private-keys.js';
import { getPorts } from '../test-helpers/get-ports.js';
import { makeEnrs } from '../test-helpers/make-enrs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(__dirname, '../../dest/testbench/p2p_client_testbench_worker.js');
const logger = createLogger('testbench');

describe('Gossipsub', () => {
  let processes: ChildProcess[];

  let p2pBaseConfig: P2PConfig;
  const testChainConfig: ChainConfig = {
    l1ChainId: 31337,
    version: 1,
    l1Contracts: {
      rollupAddress: EthAddress.random(),
    },
  };

  beforeEach(() => {
    processes = [];
    p2pBaseConfig = { ...getP2PDefaultConfig(), ...testChainConfig };
  });

  afterEach(async () => {
    // Kill all child processes
    await Promise.all(
      processes.map(
        proc =>
          new Promise<void>(resolve => {
            proc.once('exit', () => resolve());
            proc.send({ type: 'STOP' });
          }),
      ),
    );
  });

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
    const peerEnrs = await makeEnrs(peerIdPrivateKeys, ports, p2pBaseConfig);

    processes = [];
    let readySignals = [];
    for (let i = 0; i < numberOfClients; i++) {
      logger.info(`\n\n\n\n\n\n\nCreating client ${i}\n\n\n\n\n\n\n`);
      const addr = `127.0.0.1:${ports[i]}`;
      const listenAddr = `0.0.0.0:${ports[i]}`;

      // Maximum seed with 10 other peers to allow peer discovery to connect them at a smoother rate
      const otherNodes = peerEnrs.filter((_, ind) => ind < Math.min(i, 10));

      const config: P2PConfig & Partial<ChainConfig> = {
        ...p2pBaseConfig,
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

  it('Should propagate a tx to all peers with a throttled degree and large node set', async () => {
    // No network partition, all nodes should receive
    const numberOfClients = 5;

    // Setup clients in separate processes
    const testConfig: Partial<P2PConfig> = {
      maxPeerCount: numberOfClients + 20,
      gossipsubFloodPublish: false,
      debugDisableColocationPenalty: true,
      debugDisableMessageValidation: true,
      gossipsubInterval: 700,
      gossipsubD: 1,
      gossipsubDlo: 1,
      gossipsubDhi: 1,
      gossipsubDLazy: 1,
      peerCheckIntervalMS: 2500,

      // Increased
      gossipsubMcacheGossip: 12,
      gossipsubMcacheLength: 12,
    };

    await makeWorkerClients(numberOfClients, testConfig);

    // wait a bit longer for all peers to be ready
    await sleep(5000);
    logger.info(`\n\n\n\n\n\n\Workers Ready\n\n\n\n\n\n\n`);

    // Track gossip message counts from all processes
    const gossipCounts = new Map<number, number>();
    processes.forEach((proc, i) => {
      proc.on('message', (msg: any) => {
        if (msg.type === 'GOSSIP_RECEIVED') {
          gossipCounts.set(i, msg.count);
        }
      });
    });

    // Send tx from client 3
    const tx = await mockTx();
    processes[0].send({ type: 'SEND_TX', tx: tx.toBuffer() });

    // Give time for message propagation
    await sleep(15000);
    logger.info(`\n\n\n\n\n\n\nWoke up\n\n\n\n\n\n\n`);

    // Count how many processes received the message
    const spiesTriggered = Array.from(gossipCounts.values()).filter(count => count > 0).length;

    // Expect all nodes apart from the one that sent it to receive the message
    expect(spiesTriggered).toEqual(numberOfClients - 1); // All nodes apart from the one that sent it
  }, 500_000);
});
