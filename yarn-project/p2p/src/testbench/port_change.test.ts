import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { ClientIvcProof } from '@aztec/stdlib/proofs';
import { mockTx } from '@aztec/stdlib/testing';

import getPort from 'get-port';
import path from 'path';
import { fileURLToPath } from 'url';

import type { P2PConfig } from '../config.js';
import { WorkerClientManager, testChainConfig } from './worker_client_manager.js';

const NUMBER_OF_ITERATIONS = 2;
const NODES_TO_CHANGE_PORT = 1;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test Summary:
// - Start 5 clients
// - For NUMBER_OF_ITERATIONS iterations:
//    - Send a tx from a random client
//    - Allow for it to propagate to all other clients
//    - change the port for NODES_TO_CHANGE_PORT random clients
//    - Wait for two peer manager heartbeats
describe('Port Change', () => {
  let workerClientManager: WorkerClientManager;
  let numberOfClients: number;
  let testConfig: P2PConfig;
  const logger = createLogger('testbench-ports');

  beforeEach(async () => {
    logger.info('Starting test setup');
    // Use 5 node configuration for this test
    const configPath = path.join(__dirname, '../../testbench/configurations', 'normal-degree-5-nodes.json');
    logger.info(`Loading config from ${configPath}`);
    const config = await import(configPath, { with: { type: 'json' } });
    testConfig = {
      ...testChainConfig,
      ...config.default,
      boostrapNodeEnrVersionCheck: false,
      bootstrapNodesAsFullPeers: true,
    };
    numberOfClients = config.default.numberOfClients;
    logger.info(`Creating ${numberOfClients} clients`);

    workerClientManager = new WorkerClientManager(logger, testConfig);
    await workerClientManager.makeWorkerClients(numberOfClients);

    // wait a bit longer for all peers to be ready
    await sleep(10000);
    logger.info('Workers Ready');
  }, 30 * 1000);

  it(
    'should change port and propagate the gossip message correctly',
    async () => {
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
        await sleep(10_000); // Hopefully it will never take this long
        logger.info('Checking message propagation results');

        // Check message propagation results
        const numberOfClientsThatReceivedMessage = workerClientManager.numberOfClientsThatReceivedMessage();
        logger.info(`Number of clients that received message: ${numberOfClientsThatReceivedMessage}`);

        expect(numberOfClientsThatReceivedMessage).toBe(numberOfClients - 1);
        logger.info('All clients received message');

        workerClientManager.purgeMessageReceivedByClient();

        logger.info(`Iteration ${i + 1} done`);

        // change port for NODES_TO_CHANGE_PORT random clients
        for (let j = 0; j < NODES_TO_CHANGE_PORT; j++) {
          const clientIndexToChangePort = Math.floor(Math.random() * numberOfClients);
          logger.info(`Changing port for client ${clientIndexToChangePort}`);
          await workerClientManager.changePort(clientIndexToChangePort, await getPort());

          // wait for 4 peer manager heartbeats for discovery
          await sleep(testConfig.peerCheckIntervalMS * 4);
        }
      }

      logger.info('Test passed');
    },
    20 * 60 * 1000,
  );

  afterEach(async () => {
    logger.info('Cleaning up');
    await workerClientManager.cleanup();
  });
});
