import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import type { ChainConfig } from '@aztec/stdlib/config';
import { ClientIvcProof } from '@aztec/stdlib/proofs';
import { mockTx } from '@aztec/stdlib/testing';

import assert from 'assert';
import { type ChildProcess, fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

import { type P2PConfig, getP2PDefaultConfig } from '../config.js';
import { generatePeerIdPrivateKeys } from '../test-helpers/generate-peer-id-private-keys.js';
import { getPorts } from '../test-helpers/get-ports.js';
import { makeEnr, makeEnrs } from '../test-helpers/make-enrs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(__dirname, '../../dest/testbench/p2p_client_testbench_worker.js');
const logger = createLogger('testbench');

const testChainConfig: ChainConfig = {
  l1ChainId: 31337,
  version: 1,
  l1Contracts: {
    rollupAddress: EthAddress.random(),
  },
};

class WorkerClientManager {
  public processes: ChildProcess[] = [];
  public peerIdPrivateKeys: string[] = [];
  public peerEnrs: string[] = [];
  public ports: number[] = [];
  private p2pConfig: Partial<P2PConfig>;
  private logger: Logger;
  private messageReceivedByClient: number[] = [];

  constructor(logger: Logger, p2pConfig: Partial<P2PConfig>) {
    this.logger = logger;
    this.p2pConfig = p2pConfig;
  }

  destroy() {
    this.cleanup().catch((error: Error) => {
      this.logger.error('Failed to cleanup worker client manager', error);
      process.exit(1);
    });
  }

  /**
   * Creates address strings from a port
   */
  private getAddresses(port: number) {
    return {
      addr: `127.0.0.1:${port}`,
      listenAddr: `0.0.0.0:${port}`,
    };
  }

  /**
   * Creates a client configuration object
   */
  private createClientConfig(clientIndex: number, port: number, otherNodes: string[]) {
    const { addr, listenAddr } = this.getAddresses(port);

    return {
      ...getP2PDefaultConfig(),
      p2pEnabled: true,
      peerIdPrivateKey: this.peerIdPrivateKeys[clientIndex],
      tcpListenAddress: listenAddr,
      udpListenAddress: listenAddr,
      tcpAnnounceAddress: addr,
      udpAnnounceAddress: addr,
      bootstrapNodes: [...otherNodes],
      ...this.p2pConfig,
    };
  }

  /**
   * Spawns a worker process and returns a promise that resolves when the worker is ready
   */
  private spawnWorkerProcess(
    config: P2PConfig & Partial<ChainConfig>,
    clientIndex: number,
  ): [ChildProcess, Promise<void>] {
    const childProcess = fork(workerPath);
    childProcess.send({ type: 'START', config, clientIndex });

    // Handle unexpected child process exit
    childProcess.on('exit', (code, signal) => {
      if (code !== 0) {
        this.logger.warn(`Worker ${clientIndex} exited unexpectedly with code ${code} and signal ${signal}`);
      }
    });

    childProcess.on('message', (msg: any) => {
      if (msg.type === 'GOSSIP_RECEIVED') {
        this.messageReceivedByClient[clientIndex] = msg.count;
      }
    });

    // Create ready signal promise
    const readySignal = new Promise<void>((resolve, reject) => {
      // Set a timeout to avoid hanging indefinitely
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for worker ${clientIndex} to be ready`));
      }, 15000); // 15 second timeout

      childProcess.once('message', (msg: any) => {
        clearTimeout(timeout);
        if (msg.type === 'READY') {
          resolve();
        }
        // For future use
        if (msg.type === 'ERROR') {
          reject(new Error(msg.error));
        }
      });

      // Also resolve/reject if process exits before sending message
      childProcess.once('exit', code => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Worker ${clientIndex} exited with code ${code} before becoming ready`));
        }
      });
    });

    return [childProcess, readySignal];
  }

  /**
   * Creates a number of worker clients in separate processes
   * All are configured to connect to each other and overrided with the test specific config
   *
   * @param numberOfClients - The number of clients to create
   * @returns The ENRs of the created clients
   */
  async makeWorkerClients(numberOfClients: number) {
    try {
      this.messageReceivedByClient = new Array(numberOfClients).fill(0);
      this.peerIdPrivateKeys = generatePeerIdPrivateKeys(numberOfClients);
      this.ports = await getPorts(numberOfClients);
      this.peerEnrs = await makeEnrs(this.peerIdPrivateKeys, this.ports, testChainConfig);

      this.processes = [];
      const readySignals: Promise<void>[] = [];

      for (let i = 0; i < numberOfClients; i++) {
        this.logger.info(`Creating client ${i}`);

        // Maximum seed with 10 other peers to allow peer discovery to connect them at a smoother rate
        const otherNodes = this.peerEnrs.filter((_, ind) => ind < Math.min(i, 10));

        const config = this.createClientConfig(i, this.ports[i], otherNodes);
        const [childProcess, readySignal] = this.spawnWorkerProcess(config, i);

        readySignals.push(readySignal);
        this.processes.push(childProcess);
      }

      // Wait for peers to all connect with each other
      await sleep(4000);

      // Wait for all peers to be booted up with timeout
      await Promise.race([
        Promise.all(readySignals),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout waiting for all workers to be ready')), 30000),
        ),
      ]);

      return this.peerEnrs;
    } catch (error) {
      // Clean up any processes that were created if there's an error
      this.logger.error('Error during makeWorkerClients:', error);
      await this.cleanup();
      throw error;
    }
  }

  purgeMessageReceivedByClient() {
    this.messageReceivedByClient = new Array(this.processes.length).fill(0);
  }

  numberOfClientsThatReceivedMessage() {
    return this.messageReceivedByClient.filter(count => count > 0).length;
  }

  /**
   * Changes the port for a specific client
   *
   * @param clientIndex - The index of the client to change port for
   * @param newPort - The new port to use
   */
  async changePort(clientIndex: number, newPort: number) {
    try {
      if (clientIndex < 0 || clientIndex >= this.processes.length) {
        throw new Error(`Invalid client index: ${clientIndex}`);
      }

      this.processes[clientIndex].send({ type: 'STOP' });

      // Wait for the process to be ready with a timeout
      await sleep(1000);

      this.logger.info(`Changing port for client ${clientIndex} to ${newPort}`);

      // Update the port in the ports array
      this.ports[clientIndex] = newPort;

      // Update the port in the peerEnrs array
      this.peerEnrs[clientIndex] = await makeEnr(this.peerIdPrivateKeys[clientIndex], newPort, testChainConfig);

      // Maximum seed with 10 other peers to allow peer discovery to connect them at a smoother rate
      const otherNodes = this.peerEnrs.filter(
        (_, ind) => ind !== clientIndex && ind < Math.min(this.peerEnrs.length, 10),
      );

      const config = this.createClientConfig(clientIndex, newPort, otherNodes);
      const [childProcess, readySignal] = this.spawnWorkerProcess(config, clientIndex);

      this.processes[clientIndex] = childProcess;

      // Wait for the process to be ready with a timeout
      await Promise.race([
        readySignal,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout waiting for client ${clientIndex} to be ready`)), 15000),
        ),
      ]);
    } catch (error) {
      this.logger.error(`Error during changePort for client ${clientIndex}:`, error);
      // Only clean up the specific process that had an issue
      await this.terminateProcess(this.processes[clientIndex], clientIndex);
      throw error;
    }
  }

  public getNewPort(): number {
    while (true) {
      const port = Math.floor(Math.random() * 65535);
      if (!this.ports.includes(port)) {
        return port;
      }
    }
  }

  /**
   * Terminate a single process with timeout and force kill if needed
   */
  private terminateProcess(process: ChildProcess, index: number): Promise<void> {
    if (!process || process.killed) {
      return Promise.resolve();
    }

    return new Promise<void>(resolve => {
      // Set a timeout for the graceful exit
      const forceKillTimeout = setTimeout(() => {
        this.logger.warn(`Process ${index} didn't exit gracefully, force killing...`);
        try {
          process.kill('SIGKILL'); // Force kill
        } catch (e) {
          this.logger.error(`Error force killing process ${index}:`, e);
        }
      }, 5000); // 5 second timeout for graceful exit

      // Listen for process exit
      process.once('exit', () => {
        clearTimeout(forceKillTimeout);
        resolve();
      });

      // Try to gracefully stop the process
      try {
        process.send({ type: 'STOP' });
      } catch (e) {
        // If sending the message fails, force kill immediately
        clearTimeout(forceKillTimeout);
        try {
          process.kill('SIGKILL');
        } catch (killError) {
          this.logger.error(`Error force killing process ${index}:`, killError);
        }
        resolve();
      }
    });
  }

  /**
   * Cleans up all worker processes with timeout and force kill if needed
   */
  async cleanup() {
    this.logger.info(`Cleaning up ${this.processes.length} worker processes`);

    // Create array of promises for each process termination
    const terminationPromises = this.processes.map((process, index) => this.terminateProcess(process, index));

    // Wait for all processes to terminate with a timeout
    try {
      await Promise.race([
        Promise.all(terminationPromises),
        new Promise<void>(resolve => {
          setTimeout(() => {
            this.logger.warn('Some processes did not terminate in time, force killing all remaining...');
            this.processes.forEach(p => {
              try {
                if (!p.killed) {
                  p.kill('SIGKILL');
                }
              } catch (e) {
                // Ignore errors when force killing
              }
            });
            resolve();
          }, 10000); // 10 second timeout for all processes
        }),
      ]);
    } catch (error) {
      this.logger.error('Error during cleanup:', error);
    }

    this.processes = [];
    this.logger.info('All worker processes cleaned up');
  }
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
    await sleep(30000);
    logger.info('Checking message propagation results');

    // Check message propagation results
    const numberOfClientsThatReceivedMessage = workerClientManager.numberOfClientsThatReceivedMessage();
    logger.info(`Number of clients that received message: ${numberOfClientsThatReceivedMessage}`);

    assert(numberOfClientsThatReceivedMessage === numberOfClients - 1);

    workerClientManager.purgeMessageReceivedByClient();

    logger.info('First iteration done, changing port for client 0');

    // change port for client 0
    await workerClientManager.changePort(0, workerClientManager.getNewPort());

    // wait a bit longer for all peers to be ready
    await sleep(5000);
    logger.info('Workers Ready');

    // send tx from client 0
    const tx2 = await mockTx(1, {
      clientIvcProof: ClientIvcProof.random(),
    });
    workerClientManager.processes[0].send({ type: 'SEND_TX', tx: tx2.toBuffer() });
    logger.info('Transaction sent from client 0');

    // Give time for message propagation
    await sleep(30000);

    const numberOfClientsThatReceivedMessage2 = workerClientManager.numberOfClientsThatReceivedMessage();
    logger.info(`Number of clients that received message: ${numberOfClientsThatReceivedMessage2}`);

    assert(numberOfClientsThatReceivedMessage2 === numberOfClients - 1);

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
