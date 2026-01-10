import { EthAddress } from '@aztec/foundation/eth-address';
import type { Logger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import type { ChainConfig } from '@aztec/stdlib/config';

import { type ChildProcess, fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

import { type P2PConfig, getP2PDefaultConfig } from '../config.js';
import { generatePeerIdPrivateKeys } from '../test-helpers/generate-peer-id-private-keys.js';
import { getPorts } from '../test-helpers/get-ports.js';
import { makeEnr, makeEnrs } from '../test-helpers/make-enrs.js';
import type {
  BenchReqRespCommand,
  BenchResultMessage,
  CollectorType,
  DistributionPattern,
} from './p2p_client_testbench_worker.js';

export interface ReqRespBenchmarkConfig {
  txCount: number;
  distribution: DistributionPattern;
  collectorType: CollectorType;
  timeoutMs: number;
  pinnedPeerIndex?: number;
  blockNumber?: number;
  seed?: number;
}

export interface ReqRespBenchmarkResult {
  txCount: number;
  distribution: DistributionPattern;
  collector: CollectorType;
  durationMs: number;
  fetchedCount: number;
  success: boolean;
  error?: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(__dirname, '../../dest/testbench/p2p_client_testbench_worker.js');

const testChainConfig: ChainConfig = {
  l1ChainId: 31337,
  rollupVersion: 1,
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
   * Creates a client configuration object for IPC.
   * Note: We send the raw peerIdPrivateKey string instead of SecretValue
   * because SecretValue.toJSON() returns '[Redacted]', losing the value.
   * The worker must re-wrap it in SecretValue.
   */
  private createClientConfig(
    clientIndex: number,
    port: number,
    otherNodes: string[],
  ): Omit<P2PConfig, 'peerIdPrivateKey'> & { peerIdPrivateKey: string } & Partial<ChainConfig> {
    return {
      ...getP2PDefaultConfig(),
      p2pEnabled: true,
      peerIdPrivateKey: this.peerIdPrivateKeys[clientIndex],
      listenAddress: '127.0.0.1',
      p2pIp: '127.0.0.1',
      p2pPort: port,
      bootstrapNodes: [...otherNodes],
      ...this.p2pConfig,
    } as Omit<P2PConfig, 'peerIdPrivateKey'> & { peerIdPrivateKey: string } & Partial<ChainConfig>;
  }

  /**
   * Spawns a worker process and returns a promise that resolves when the worker is ready.
   * Config uses raw string for peerIdPrivateKey (not SecretValue) for IPC serialization.
   */
  private spawnWorkerProcess(
    config: Omit<P2PConfig, 'peerIdPrivateKey'> & { peerIdPrivateKey: string } & Partial<ChainConfig>,
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
      }, 30000); // 30 second timeout

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
      await sleep(10000);

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
      await sleep(10000);

      this.logger.info(`Changing port for client ${clientIndex} to ${newPort}`);

      // Update the port in the ports array
      this.ports[clientIndex] = newPort;

      // Update the port in the peerEnrs array
      this.peerEnrs[clientIndex] = await makeEnr(this.peerIdPrivateKeys[clientIndex], newPort, testChainConfig);

      // Maximum seed with 10 other peers to allow peer discovery to connect them at a smoother rate
      const otherNodes = this.peerEnrs.filter(
        (_, ind) => ind !== clientIndex && ind < Math.min(this.peerEnrs.length, 10),
      );

      this.logger.info(`Changing port for client ${clientIndex} to ${newPort} with other nodes `, otherNodes);

      const config = this.createClientConfig(clientIndex, newPort, otherNodes);
      const [childProcess, readySignal] = this.spawnWorkerProcess(config, clientIndex);

      this.processes[clientIndex] = childProcess;

      // Wait for the process to be ready with a timeout
      await Promise.race([
        readySignal,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout waiting for client ${clientIndex} to be ready`)), 30000),
        ),
      ]);
    } catch (error) {
      this.logger.error(`Error during changePort for client ${clientIndex}:`, error);
      // Only clean up the specific process that had an issue
      await this.terminateProcess(this.processes[clientIndex], clientIndex);
      throw error;
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
      } catch {
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
              } catch {
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

  /**
   * Run a req/resp benchmark across all worker clients.
   *
   * This sends a BENCH_REQRESP command to all workers:
   * - Aggregator (client 0) runs the collector and returns timing results
   * - Responders (clients 1..N) populate their tx pools based on distribution
   *
   * All workers generate the same txs deterministically from a shared seed,
   * then filter based on their peerIndex and distribution pattern.
   */
  async runReqRespBenchmark(config: ReqRespBenchmarkConfig): Promise<ReqRespBenchmarkResult> {
    const peerCount = this.processes.length;
    if (peerCount < 2) {
      throw new Error('Need at least 2 peers to run req/resp benchmark');
    }

    const seed = config.seed ?? Date.now();
    const blockNumber = config.blockNumber ?? 1;

    this.logger.info(
      `Starting req/resp benchmark: txCount=${config.txCount}, distribution=${config.distribution}, collector=${config.collectorType}`,
    );

    const readyPromises: Promise<void>[] = [];
    let resultPromise: Promise<BenchResultMessage> | null = null;

    for (let i = 0; i < peerCount; i++) {
      const isAggregator = i === 0;
      const cmd: BenchReqRespCommand = {
        type: 'BENCH_REQRESP',
        txCount: config.txCount,
        peerCount,
        distribution: config.distribution,
        collectorType: config.collectorType,
        timeoutMs: config.timeoutMs,
        isAggregator,
        peerIndex: i,
        pinnedPeerIndex: config.pinnedPeerIndex,
        blockNumber,
        seed,
      };

      this.processes[i].send(cmd);

      if (isAggregator) {
        resultPromise = this.waitForBenchResult(i, config.timeoutMs + 30000);
      } else {
        readyPromises.push(this.waitForBenchReady(i, 30000));
      }
    }

    await Promise.all(readyPromises);
    this.logger.info('All responder peers ready, waiting for aggregator result...');

    if (!resultPromise) {
      throw new Error('No aggregator result promise');
    }

    const result = await resultPromise;

    this.logger.info(
      `Benchmark complete: fetched=${result.fetchedCount}/${config.txCount}, duration=${result.durationMs.toFixed(0)}ms, success=${result.success}`,
    );

    return {
      txCount: config.txCount,
      distribution: config.distribution,
      collector: config.collectorType,
      durationMs: result.durationMs,
      fetchedCount: result.fetchedCount,
      success: result.success,
      error: result.error,
    };
  }

  private waitForBenchReady(clientIndex: number, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for BENCH_READY from client ${clientIndex}`));
      }, timeoutMs);

      const handler = (msg: any) => {
        if (msg.type === 'BENCH_READY') {
          clearTimeout(timeout);
          this.processes[clientIndex].off('message', handler);
          resolve();
        } else if (msg.type === 'ERROR') {
          clearTimeout(timeout);
          this.processes[clientIndex].off('message', handler);
          reject(new Error(`Client ${clientIndex} error: ${msg.error}`));
        }
      };

      this.processes[clientIndex].on('message', handler);
    });
  }

  private waitForBenchResult(clientIndex: number, timeoutMs: number): Promise<BenchResultMessage> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for BENCH_RESULT from client ${clientIndex}`));
      }, timeoutMs);

      const handler = (msg: any) => {
        if (msg.type === 'BENCH_RESULT') {
          clearTimeout(timeout);
          this.processes[clientIndex].off('message', handler);
          resolve(msg as BenchResultMessage);
        } else if (msg.type === 'ERROR') {
          clearTimeout(timeout);
          this.processes[clientIndex].off('message', handler);
          reject(new Error(`Client ${clientIndex} error: ${msg.error}`));
        }
      };

      this.processes[clientIndex].on('message', handler);
    });
  }
}

export { WorkerClientManager, testChainConfig };
export type { DistributionPattern, CollectorType } from './p2p_client_testbench_worker.js';
