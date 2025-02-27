import { assert } from 'console';
import { ClientIvcProof } from '@aztec/stdlib/proofs';
import { mockTx } from '@aztec/stdlib/testing';
import { sleep } from '@aztec/foundation/sleep';
import { createLogger } from '@aztec/foundation/log';
import { WorkerClientManager, testChainConfig } from './worker_client_manager.js';
import path from 'path';
import { fileURLToPath } from 'url';

const logger = createLogger('testbench-ports');
const NUMBER_OF_ITERATIONS = 5;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Port Change', () => {
  it('should change port and propagate the gossip message correctly', async () => {
    // Read configuration file name from command line args
    const configFileArg = process.argv.find((arg) => arg.startsWith('--configFile='));
    if (!configFileArg) {
      throw new Error('Configuration file must be provided as first argument');
    }

    const configFile = configFileArg.split('=')[1];

    const configPath = path.join(__dirname, '../../testbench/configurations', configFile);
    const config = await import(configPath, { assert: { type: 'json' } });
    const testConfig = { ...testChainConfig, ...config.default };
    const numberOfClients = config.default.numberOfClients;


    // Setup clients in separate processes
    const workerClientManager = new WorkerClientManager(logger, testConfig);
    await workerClientManager.makeWorkerClients(numberOfClients);

    // wait a bit longer for all peers to be ready
    await sleep(5000);
    logger.info('Workers Ready');

    // Run test multiple times with random clients
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
        await sleep(30000);
        logger.info('Checking message propagation results');

        // Check message propagation results
        const numberOfClientsThatReceivedMessage = workerClientManager.numberOfClientsThatReceivedMessage();
        logger.info(`Number of clients that received message: ${numberOfClientsThatReceivedMessage}`);

        assert(numberOfClientsThatReceivedMessage === numberOfClients - 1);

        workerClientManager.purgeMessageReceivedByClient();

        logger.info(`Iteration ${i + 1} done, changing port for client ${clientIndex}`);

        // change port for the client
        await workerClientManager.changePort(clientIndex, workerClientManager.getNewPort());

        // wait a bit longer for all peers to be ready
        await sleep(config.default.peerCheckIntervalMS * 2);
    }

    logger.info('Test passed, cleaning up');

    // cleanup
    await workerClientManager.cleanup();
  }, 20 * 60 * 1000);
});
