import { type ChainConfig, emptyChainConfig } from '@aztec/circuit-types/config';
import { mockTx } from '@aztec/circuit-types/testing';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';

import type { PeerId } from '@libp2p/interface';
import { type ChildProcess, fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

import { type P2PConfig, getP2PDefaultConfig } from '../config.js';
import { generatePeerIdPrivateKeys } from '../test-helpers/generate-peer-id-private-keys.js';
import { getPorts } from '../test-helpers/get-ports.js';
import { makeEnrs } from '../test-helpers/make-enrs.js';
import { createLibP2PPeerIdFromPrivateKey } from '../util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(__dirname, '../../dest/testbench/p2p_client_testbench_worker.js');
const logger = createLogger('testbench');

describe.skip('Gossipsub', () => {
  let processes: ChildProcess[];

  let p2pBaseConfig: P2PConfig;

  beforeEach(() => {
    processes = [];
    p2pBaseConfig = { ...emptyChainConfig, ...getP2PDefaultConfig(), l1ChainId: 0 };
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
    const readies = [];
    for (let i = 0; i < numberOfClients; i++) {
      logger.info(`\n\n\n\n\n\n\nCreating client ${i}\n\n\n\n\n\n\n`);
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
      const readyPromise = new Promise((resolve, reject) => {
        childProcess.once('message', (msg: any) => {
          if (msg.type === 'READY') {
            resolve(undefined);
          }
          if (msg.type === 'ERROR') {
            reject(new Error(msg.error));
          }
        });
      });
      readies.push(readyPromise);
      await readyPromise;

      processes.push(childProcess);
    }

    await Promise.all(readies);
    // Wait for peers to all connect with each other
    await sleep(4000);

    return { peerEnrs, peerIdPrivateKeys };
  }
  it('Should propagate a tx to all peers with a throttled degree and large node set', async () => {
    // No network partition, all nodes should receive
    const numberOfClients = 12;
    const rollupAddress = EthAddress.ZERO;

    const gossips: any[] = [];

    // Setup clients in separate processes
    const testConfig: Partial<P2PConfig> = {
      maxPeerCount: numberOfClients + 20,
      gossipsubInterval: 700,
      gossipsubD: 2,
      gossipsubDlo: 2,
      gossipsubDhi: 2,
      gossipsubDLazy: 2,
      peerCheckIntervalMS: 2500,

      // Increased
      gossipsubMcacheGossip: 12,
      gossipsubMcacheLength: 12,
      gossipsubFloodPublish: false,

      l1ChainId: 0,
      l1Contracts: {
        rollupAddress,
      },
    };

    const { peerIdPrivateKeys } = await makeWorkerClients(numberOfClients, testConfig);

    const peerIds = await Promise.all(peerIdPrivateKeys.map(key => createLibP2PPeerIdFromPrivateKey(key)));

    for (let i = 0; i < peerIds.length; i++) {
      logger.info(`Peer ${i} ID: ${peerIds[i].toString()}`);
    }

    // Track gossip message counts from all processes
    const gossipCounts = new Map<number, number>();
    processes.forEach((proc, i) => {
      proc.on('message', (msg: any) => {
        if (msg.type === 'GOSSIP_RECEIVED') {
          gossipCounts.set(i, msg.count);
          gossips.push(msg);
        }
      });
    });

    logger.info(`\n\n\n\n\n\n\nSENDING TX\n\n\n\n\n\n\n`);

    // Send tx from client 3
    const tx = await mockTx();
    processes[0].send({ type: 'SEND_TX', tx: tx.toBuffer() });

    // Give time for message propagation
    await sleep(15000);
    logger.info(`\n\n\n\n\n\n\nWoke up\n\n\n\n\n\n\n`);

    const peerIdStrings = peerIds.map(peerId => peerId.toString());

    for (const gossip of gossips) {
      const sender = peerIdStrings.findIndex(peerId => peerId === gossip.sender.toString());
      const receiver = gossip.clientIndex;
      logger.info(
        `Transmission ${gossip.time} ${sender} -> ${receiver}, meshes ${Array.from(gossip.mesh as PeerId[])
          .map((x: PeerId, _: number) => x.toString())
          .map(x => peerIdStrings.findIndex(peerId => peerId === x.toString()))}`,
      );
    }

    // Count how many processes received the message
    const spiesTriggered = Array.from(gossipCounts.values()).filter(count => count > 0).length;

    // Expect all nodes apart from the one that sent it to receive the message
    expect(spiesTriggered).toEqual(numberOfClients - 1); // All nodes apart from the one that sent it
  }, 500_000);
});
