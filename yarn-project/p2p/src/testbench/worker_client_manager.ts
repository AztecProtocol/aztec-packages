import { EthAddress } from '@aztec/foundation/eth-address';
import type { Logger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import type { ChainConfig } from '@aztec/stdlib/config';

import { type ChildProcess, fork } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { type P2PConfig, getP2PDefaultConfig } from '../config.js';
import { generatePeerIdPrivateKeys } from '../test-helpers/generate-peer-id-private-keys.js';
import { getPorts } from '../test-helpers/get-ports.js';
import { makeEnr, makeEnrs } from '../test-helpers/make-enrs.js';
import { BENCHMARK_CONSTANTS } from '../test-helpers/testbench-utils.js';
import type { BenchReqRespCommand, BenchResultMessage, DistributionPattern } from './p2p_client_testbench_worker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p2pRoot = path.resolve(__dirname, '../..');
const workerTsPath = path.join(__dirname, 'p2p_client_testbench_worker.ts');
const workerJsPath = path.join(p2pRoot, 'dest/testbench/p2p_client_testbench_worker.js');
const tsconfigPath = path.join(p2pRoot, 'tsconfig.json');

const testChainConfig: ChainConfig = {
  l1ChainId: 31337,
  rollupVersion: 1,
  rollupAddress: EthAddress.random(),
};

export interface ReqRespBenchmarkConfig {
  txCount: number;
  distribution: DistributionPattern;
  timeoutMs: number;
  pinnedPeerIndex?: number;
  blockNumber?: number;
  seed?: number;
}

export interface ReqRespBenchmarkResult {
  txCount: number;
  distribution: DistributionPattern;
  durationMs: number;
  fetchedCount: number;
  success: boolean;
  error?: string;
}

class WorkerClientManager {
  public processes: ChildProcess[] = [];
  public peerIdPrivateKeys: string[] = [];
  public peerEnrs: string[] = [];
  public ports: number[] = [];
  public peerIds: string[] = [];
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
    });
  }

  /**
   * Creates a client configuration object for IPC.
   * Note: We send the raw peerIdPrivateKey string instead of SecretValue
   * because SecretValue.toJSON() returns '[Redacted]', losing the value.
   * The worker must re-wrap it in SecretValue.
   * We also omit priceBumpPercentage since it's a bigint and can't be
   * serialized over IPC (which uses JSON under the hood).
   */
  private createClientConfig(
    clientIndex: number,
    port: number,
    otherNodes: string[],
  ): Omit<P2PConfig, 'peerIdPrivateKey' | 'priceBumpPercentage'> & { peerIdPrivateKey: string } & Partial<ChainConfig> {
    const { priceBumpPercentage: _, ...config } = {
      ...getP2PDefaultConfig(),
      p2pEnabled: true,
      peerIdPrivateKey: this.peerIdPrivateKeys[clientIndex],
      listenAddress: '127.0.0.1',
      p2pIp: '127.0.0.1',
      p2pPort: port,
      bootstrapNodes: [...otherNodes],
      ...this.p2pConfig,
    };
    return config as Omit<P2PConfig, 'peerIdPrivateKey' | 'priceBumpPercentage'> & {
      peerIdPrivateKey: string;
    } & Partial<ChainConfig>;
  }

  /**
   * Spawns a worker process and returns a promise that resolves when the worker is ready.
   * Config uses raw string for peerIdPrivateKey (not SecretValue) for IPC serialization.
   */
  private spawnWorkerProcess(
    config: Omit<P2PConfig, 'peerIdPrivateKey' | 'priceBumpPercentage'> & {
      peerIdPrivateKey: string;
    } & Partial<ChainConfig>,
    clientIndex: number,
  ): [ChildProcess, Promise<void>] {
    const useCompiled = existsSync(workerJsPath);
    const workerPath = useCompiled ? workerJsPath : workerTsPath;

    const execArgv = [...process.execArgv];
    if (!useCompiled && !execArgv.includes('ts-node/esm')) {
      execArgv.push('--loader', 'ts-node/esm');
    }

    const env = {
      ...process.env,
      TS_NODE_PROJECT: tsconfigPath,
    };

    const childProcess = fork(workerPath, {
      cwd: p2pRoot,
      execArgv,
      env,
    });
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
      let resolved = false;

      const timeout = setTimeout(() => {
        if (resolved) {
          return;
        }
        resolved = true;
        childProcess.off('message', messageHandler);
        childProcess.off('exit', exitHandler);
        reject(new Error(`Timeout waiting for worker ${clientIndex} to be ready`));
      }, BENCHMARK_CONSTANTS.WORKER_READY_TIMEOUT_MS);

      const messageHandler = (msg: any) => {
        if (resolved) {
          return;
        }
        // Only handle READY or ERROR messages; ignore others (e.g., GOSSIP_RECEIVED)
        if (msg.type === 'READY') {
          resolved = true;
          clearTimeout(timeout);
          childProcess.off('message', messageHandler);
          childProcess.off('exit', exitHandler);
          if (typeof msg.peerId === 'string') {
            this.peerIds[clientIndex] = msg.peerId;
          }
          resolve();
        } else if (msg.type === 'ERROR') {
          resolved = true;
          clearTimeout(timeout);
          childProcess.off('message', messageHandler);
          childProcess.off('exit', exitHandler);
          reject(new Error(msg.error));
        }
        // Ignore other message types and keep waiting for READY/ERROR
      };

      const exitHandler = (code: number | null) => {
        if (resolved) {
          return;
        }
        resolved = true;
        clearTimeout(timeout);
        childProcess.off('message', messageHandler);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Worker ${clientIndex} exited with code ${code} before becoming ready`));
        }
      };

      childProcess.on('message', messageHandler);
      childProcess.once('exit', exitHandler);
    });

    return [childProcess, readySignal];
  }

  /**
   * Creates a number of worker clients in separate processes.
   * All are configured to connect to each other and overridden with the test-specific config.
   *
   * @param numberOfClients - The number of clients to create
   * @param options - Optional overrides for seeding/bootstrapping strategy
   * @returns The ENRs of the created clients
   */
  async makeWorkerClients(
    numberOfClients: number,
    options: {
      bootstrapMode?: 'subset' | 'all';
      seedPeerLimit?: number;
      batchSize?: number;
      batchDelayMs?: number;
    } = {},
  ) {
    try {
      const bootstrapMode = options.bootstrapMode ?? (this.p2pConfig.bootstrapNodesAsFullPeers ? 'all' : 'subset');
      const seedPeerLimit = options.seedPeerLimit ?? 10;
      const batchSize = options.batchSize ?? (bootstrapMode === 'all' ? Math.min(5, numberOfClients) : numberOfClients);
      const batchDelayMs = options.batchDelayMs ?? (bootstrapMode === 'all' ? 500 : 0);

      this.messageReceivedByClient = new Array(numberOfClients).fill(0);
      this.peerIdPrivateKeys = generatePeerIdPrivateKeys(numberOfClients);
      this.ports = await getPorts(numberOfClients);
      this.peerEnrs = await makeEnrs(this.peerIdPrivateKeys, this.ports, testChainConfig);
      this.peerIds = new Array(numberOfClients);

      this.processes = [];
      const readySignals: Promise<void>[] = [];

      for (let batchStart = 0; batchStart < numberOfClients; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize, numberOfClients);
        const batchPromises: Promise<void>[] = [];

        for (let i = batchStart; i < batchEnd; i++) {
          this.logger.info(`Creating client ${i}`);

          const otherNodes =
            bootstrapMode === 'all'
              ? this.peerEnrs.filter((_, ind) => ind !== i)
              : this.peerEnrs.filter((_, ind) => ind < Math.min(i, seedPeerLimit));

          const config = this.createClientConfig(i, this.ports[i], otherNodes);
          const [childProcess, readySignal] = this.spawnWorkerProcess(config, i);

          readySignals.push(readySignal);
          batchPromises.push(readySignal);
          this.processes.push(childProcess);
        }

        await Promise.all(batchPromises);

        if (batchEnd < numberOfClients && batchDelayMs > 0) {
          await sleep(batchDelayMs);
        }
      }

      await sleep(BENCHMARK_CONSTANTS.PEER_DISCOVERY_WAIT_MS);

      await Promise.race([
        Promise.all(readySignals),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Timeout waiting for all workers to be ready')),
            BENCHMARK_CONSTANTS.WORKER_READY_TIMEOUT_MS,
          ),
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

      await Promise.race([
        readySignal,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`Timeout waiting for client ${clientIndex} to be ready`)),
            BENCHMARK_CONSTANTS.WORKER_READY_TIMEOUT_MS,
          ),
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
      const forceKillTimeout = setTimeout(() => {
        this.logger.warn(`Process ${index} didn't exit gracefully, force killing...`);
        try {
          process.kill('SIGKILL');
        } catch (e) {
          this.logger.error(`Error force killing process ${index}:`, e);
        }
      }, BENCHMARK_CONSTANTS.GRACEFUL_SHUTDOWN_TIMEOUT_MS);

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
          }, BENCHMARK_CONSTANTS.CLEANUP_TIMEOUT_MS);
        }),
      ]);
    } catch (error) {
      this.logger.error('Error during cleanup:', error);
    }

    this.processes = [];
    this.peerIds = [];
    this.logger.info('All worker processes cleaned up');
  }

  /**
   * Checks that the aggregator (client 0) has sufficient peer connections before running a benchmark.
   * This prevents benchmark cases from starting with degraded connectivity after a previous case
   * caused connection failures.
   */
  async waitForConnectivity(minPeers: number, timeoutMs: number = 15_000): Promise<number> {
    const waitInterval = 1000;
    let waited = 0;

    while (waited < timeoutMs) {
      const count = await this.getPeerCount(0, 5000);
      if (count >= minPeers) {
        this.logger.info(`Connectivity check passed: ${count}/${minPeers} peers connected`);
        return count;
      }
      this.logger.debug(`Waiting for connectivity: ${count}/${minPeers} (waited ${waited}ms)`);
      await sleep(waitInterval);
      waited += waitInterval;
    }

    const finalCount = await this.getPeerCount(0, 5000);
    this.logger.warn(`Connectivity check: only ${finalCount}/${minPeers} peers after ${timeoutMs}ms`);
    return finalCount;
  }

  private getPeerCount(clientIndex: number, timeoutMs: number): Promise<number> {
    return new Promise<number>(resolve => {
      let resolved = false;

      const handler = (msg: any) => {
        if (resolved) {
          return;
        }
        if (msg.type === 'PEER_COUNT') {
          resolved = true;
          clearTimeout(timeout);
          this.processes[clientIndex].off('message', handler);
          resolve(msg.count as number);
        }
      };

      const timeout = setTimeout(() => {
        if (resolved) {
          return;
        }
        resolved = true;
        this.processes[clientIndex].off('message', handler);
        resolve(0);
      }, timeoutMs);

      this.processes[clientIndex].on('message', handler);
      this.processes[clientIndex].send({ type: 'GET_PEER_COUNT' });
    });
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
    const pinnedPeerId = config.pinnedPeerIndex !== undefined ? this.peerIds[config.pinnedPeerIndex] : undefined;

    this.logger.info(`Starting req/resp benchmark: txCount=${config.txCount}, distribution=${config.distribution}`);

    const readyPromises: Promise<void>[] = [];

    for (let i = 1; i < peerCount; i++) {
      const cmd: BenchReqRespCommand = {
        type: 'BENCH_REQRESP',
        txCount: config.txCount,
        peerCount,
        distribution: config.distribution,
        timeoutMs: config.timeoutMs,
        isAggregator: false,
        peerIndex: i,
        pinnedPeerIndex: config.pinnedPeerIndex,
        pinnedPeerId,
        blockNumber,
        seed,
      };

      this.processes[i].send(cmd);
      readyPromises.push(this.waitForBenchReady(i, 30000));
    }

    await Promise.all(readyPromises);
    this.logger.info('All responder peers ready, starting aggregator benchmark...');

    const aggregatorCmd: BenchReqRespCommand = {
      type: 'BENCH_REQRESP',
      txCount: config.txCount,
      peerCount,
      distribution: config.distribution,
      timeoutMs: config.timeoutMs,
      isAggregator: true,
      peerIndex: 0,
      pinnedPeerIndex: config.pinnedPeerIndex,
      pinnedPeerId,
      blockNumber,
      seed,
    };

    this.processes[0].send(aggregatorCmd);
    const aggregatorBudgetMs = config.timeoutMs + BENCHMARK_CONSTANTS.MAX_PEER_WAIT_MS + 30000;
    const result = await this.waitForBenchResult(0, aggregatorBudgetMs);

    this.logger.info(
      `Benchmark complete: fetched=${result.fetchedCount}/${config.txCount}, duration=${result.durationMs.toFixed(0)}ms, success=${result.success}`,
    );

    return {
      txCount: config.txCount,
      distribution: config.distribution,
      durationMs: result.durationMs,
      fetchedCount: result.fetchedCount,
      success: result.success,
      error: result.error,
    };
  }

  private waitForBenchReady(clientIndex: number, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let resolved = false;

      const handler = (msg: any) => {
        if (resolved) {
          return;
        }
        if (msg.type === 'BENCH_READY') {
          resolved = true;
          clearTimeout(timeout);
          this.processes[clientIndex].off('message', handler);
          resolve();
        } else if (msg.type === 'ERROR') {
          resolved = true;
          clearTimeout(timeout);
          this.processes[clientIndex].off('message', handler);
          reject(new Error(`Client ${clientIndex} error: ${msg.error}`));
        }
      };

      const timeout = setTimeout(() => {
        if (resolved) {
          return;
        }
        resolved = true;
        this.processes[clientIndex].off('message', handler);
        reject(new Error(`Timeout waiting for BENCH_READY from client ${clientIndex}`));
      }, timeoutMs);

      this.processes[clientIndex].on('message', handler);
    });
  }

  private waitForBenchResult(clientIndex: number, timeoutMs: number): Promise<BenchResultMessage> {
    return new Promise((resolve, reject) => {
      let resolved = false;

      const handler = (msg: any) => {
        if (resolved) {
          return;
        }
        if (msg.type === 'BENCH_RESULT') {
          resolved = true;
          clearTimeout(timeout);
          this.processes[clientIndex].off('message', handler);
          resolve(msg as BenchResultMessage);
        } else if (msg.type === 'ERROR') {
          resolved = true;
          clearTimeout(timeout);
          this.processes[clientIndex].off('message', handler);
          reject(new Error(`Client ${clientIndex} error: ${msg.error}`));
        }
      };

      const timeout = setTimeout(() => {
        if (resolved) {
          return;
        }
        resolved = true;
        this.processes[clientIndex].off('message', handler);
        reject(new Error(`Timeout waiting for BENCH_RESULT from client ${clientIndex}`));
      }, timeoutMs);

      this.processes[clientIndex].on('message', handler);
    });
  }
}

export { WorkerClientManager, testChainConfig };
export type { DistributionPattern } from './p2p_client_testbench_worker.js';
