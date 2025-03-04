import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { ClientIvcProof } from '@aztec/stdlib/proofs';
import { mockTx } from '@aztec/stdlib/testing';

import { assert } from 'console';
import getPort from 'get-port';
import path from 'path';
import { fileURLToPath } from 'url';

import { WorkerClientManager, testChainConfig } from './worker_client_manager.js';

const logger = createLogger('testbench-ports');
const NUMBER_OF_ITERATIONS = 2;
const NODES_TO_CHANGE_PORT = 5;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test Summary:
// - Start 20 clients
// - For NUMBER_OF_ITERATIONS iterations:
//    - Send a tx from a random client
//    - Allow for it to propagate to all other clients
//    - change the port for NODES_TO_CHANGE_PORT random clients
//    - Wait for two peer manager heartbeats
describe('Port Change', () => {
  it(
    'should change port and propagate the gossip message correctly',
    async () => {
      // Use 20 node configuration for this test
      const configPath = path.join(__dirname, '../../testbench/configurations', 'normal-degree-20-nodes.json');
      const config = await import(configPath, { assert: { type: 'json' } });
      const testConfig = { ...testChainConfig, ...config.default };
      const numberOfClients = config.default.numberOfClients;

      // Setup clients in separate processes
      const workerClientManager = new WorkerClientManager(logger, testConfig);
      await workerClientManager.makeWorkerClients(numberOfClients);

      // wait a bit longer for all peers to be ready
      await sleep(10000);
      logger.info('Workers Ready');

      // Run test multiple times for each client
      for (let i = 0; i < NUMBER_OF_ITERATIONS; i++) {
        // Pick a random client
        const clientIndex = Math.floor(Math.random() * numberOfClients);

        // Send tx from random client
        const tx = await mockTx(1, {
          clientIvcProof: ClientIvcProof.random(),
        });

        workerClientManager.processes[clientIndex].send({ type: 'SEND_TX', tx: tx.toBuffer() });
        logger.info(`Transaction sent from client ${clientIndex}`);

        // Give time for message propagation
        await sleep(15000);
        logger.info('Checking message propagation results');

        // Check message propagation results
        const numberOfClientsThatReceivedMessage = workerClientManager.numberOfClientsThatReceivedMessage();
        logger.info(`Number of clients that received message: ${numberOfClientsThatReceivedMessage}`);

        assert(numberOfClientsThatReceivedMessage === numberOfClients - 1);
        logger.info('All clients received message');

        workerClientManager.purgeMessageReceivedByClient();

        logger.info(`Iteration ${i + 1} done`);

        // change port for NODES_TO_CHANGE_PORT random clients
        for (let j = 0; j < NODES_TO_CHANGE_PORT; j++) {
          const clientIndexToChangePort = Math.floor(Math.random() * numberOfClients);
          logger.info(`Changing port for client ${clientIndexToChangePort}`);
          await workerClientManager.changePort(clientIndexToChangePort, await getPort());
        }

        // wait for two peer manager heartbeats
        await sleep(config.default.peerCheckIntervalMS * 2);
      }

      logger.info('Test passed, cleaning up');

      // cleanup
      await workerClientManager.cleanup();
    },
    20 * 60 * 1000,
  );
});
