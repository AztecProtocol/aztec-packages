import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import type { PeerInfo } from '@aztec/stdlib/interfaces/server';
import { ClientIvcProof } from '@aztec/stdlib/proofs';
import { mockTx } from '@aztec/stdlib/testing';

import { assert } from 'console';
import path from 'path';
import { fileURLToPath } from 'url';

import { WorkerClientManager, testChainConfig } from './worker_client_manager.js';

const logger = createLogger('testbench-ports');
const NUMBER_OF_MESSAGE_PROPAGATION_ITERATIONS = 2;
const TRUSTED_PEERS_NUMBER = 5;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test Summary:
// - Start 20 clients
// - Shutdown first TRUSTED_PEERS_NUMBER
// - For NUMBER_OF_MESSAGE_PROPAGATION_ITERATIONS iterations:
//    - Send a tx from a random client
//    - Allow for it to propagate to all other clients
// - Verify that for each client there are all trusted peers present and not pruned
describe('Trusted Peers', () => {
  it(
    'should not prune trusted peers',
    async () => {
      // Use 20 node configuration for this test
      const configPath = path.join(__dirname, '../../testbench/configurations', 'normal-degree-20-nodes.json');
      const config = await import(configPath, { assert: { type: 'json' } });
      const testConfig = { ...testChainConfig, ...config.default };
      const numberOfClients = config.default.numberOfClients;

      // Setup clients in separate processes
      const workerClientManager = new WorkerClientManager(logger, testConfig);
      await workerClientManager.makeWorkerClients(numberOfClients, TRUSTED_PEERS_NUMBER);

      // wait a bit longer for all peers to be ready
      await sleep(5000);
      logger.info('Workers Ready');

      // Shutdown first TRUSTED_PEERS_NUMBER clients
      for (let i = 0; i < TRUSTED_PEERS_NUMBER; i++) {
        // Wait for the client to be stopped
        await workerClientManager.terminateProcess(workerClientManager.processes[i], i);
      }

      // Propagate the tx to all other clients
      for (let i = 0; i < NUMBER_OF_MESSAGE_PROPAGATION_ITERATIONS; i++) {
        // Pick a random client
        const clientIndex = Math.floor(TRUSTED_PEERS_NUMBER + Math.random() * (numberOfClients - TRUSTED_PEERS_NUMBER));

        // Send tx from random client
        const tx = await mockTx(1, {
          clientIvcProof: ClientIvcProof.random(),
        });

        workerClientManager.processes[clientIndex].send({ type: 'SEND_TX', tx: tx.toBuffer() });
        logger.info(`Transaction sent from client ${clientIndex}`);

        // Give time for message propagation
        await sleep(7000);
      }

      const trustedPeersEnrs: string[] = workerClientManager.peerIds.slice(0, TRUSTED_PEERS_NUMBER);

      let numberOfUntrustedPeers = 0;

      // For other clients, they should be in the peer list anyway
      // because they are trusted peers
      for (let i = TRUSTED_PEERS_NUMBER; i < numberOfClients; i++) {
        const peers = workerClientManager.processes[i].send({ type: 'PEERS' });
        logger.info(`Peers for client ${i}: ${peers}`);
        workerClientManager.processes[i].on('message', (msg: any) => {
          if (msg.type === 'PEERS') {
            logger.info(`Peers for client ${i}: ${msg.peers}`);

            // Check if the peers include the trusted peers
            const peersEnrs = msg.peers.map((peer: PeerInfo) => peer.id);

            logger.info(`Trusted peers: ${trustedPeersEnrs}`);
            logger.info(`Peers: ${peersEnrs}`);

            if (!trustedPeersEnrs.every(id => peersEnrs.includes(id))) {
              numberOfUntrustedPeers++;
            }
          }
        });
      }

      assert(numberOfUntrustedPeers === 0);

      logger.info('Test passed');

      // cleanup
      for (let i = TRUSTED_PEERS_NUMBER; i < numberOfClients; i++) {
        workerClientManager.processes[i].send({ type: 'STOP' });
      }

      await workerClientManager.cleanup();
    },
    20 * 60 * 1000,
  );
});
