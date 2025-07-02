import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { ClientIvcProof } from '@aztec/stdlib/proofs';
import { mockTx } from '@aztec/stdlib/testing';

import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';

import { WorkerClientManager, testChainConfig } from './worker_client_manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = createLogger('testbench');

async function main() {
  try {
    // Read configuration file name from command line args
    const configFile = process.argv[2];
    if (!configFile) {
      throw new Error('Configuration file must be provided as first argument');
    }

    const configPath = path.join(__dirname, '../../testbench/configurations', configFile);
    const config = await import(configPath, { with: { type: 'json' } });
    const testConfig = { ...testChainConfig, ...config.default };
    const numberOfClients = config.default.numberOfClients;

    // Setup clients in separate processes
    const workerClientManager = new WorkerClientManager(logger, testConfig);
    await workerClientManager.makeWorkerClients(numberOfClients);

    // wait a bit longer for all peers to be ready
    await sleep(5000);
    logger.info('Workers Ready');

    // Send tx from client 0
    const tx = await mockTx(1, {
      clientIvcProof: ClientIvcProof.random(),
    });

    workerClientManager.processes[0].send({ type: 'SEND_TX', tx: tx.toBuffer() });
    logger.info('Transaction sent from client 0');

    // Give time for message propagation
    await sleep(10000);
    logger.info('Checking message propagation results');

    // Check message propagation results
    const numberOfClientsThatReceivedMessage = workerClientManager.numberOfClientsThatReceivedMessage();
    logger.info(`Number of clients that received message: ${numberOfClientsThatReceivedMessage}`);

    assert(numberOfClientsThatReceivedMessage === numberOfClients - 1);

    logger.info('Test passed, cleaning up');

    // cleanup
    await workerClientManager.cleanup();
  } catch (error) {
    logger.error('Test failed with error:', error);
    process.exit(1);
  }
}

main().catch(error => {
  logger.error('Unhandled error:', error);
});
