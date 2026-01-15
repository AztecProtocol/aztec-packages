import { type Logger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import type { Tx, TxHash } from '@aztec/stdlib/tx';

import { type ChildProcess, fork } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import type { P2PConfig } from '../../../config.js';
import { generatePeerIdPrivateKeys } from '../../../test-helpers/generate-peer-id-private-keys.js';
import { getPorts } from '../../../test-helpers/get-ports.js';
import { makeEnrs } from '../../../test-helpers/make-enrs.js';
import {
  type CollectorType,
  type SerializedP2PConfig,
  type WorkerCommand,
  type WorkerResponse,
  serializeBlockProposal,
  serializeTx,
  serializeTxHash,
} from './proposal_tx_collector_worker_protocol.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p2pRoot = path.resolve(__dirname, '../../../..');
const workerTsPath = path.join(__dirname, 'proposal_tx_collector_worker.ts');
const workerJsPath = path.join(p2pRoot, 'dest/client/test/tx_proposal_collector/proposal_tx_collector_worker.js');
const tsconfigPath = path.join(p2pRoot, 'tsconfig.json');

type PendingRequest = {
  resolve: (msg: WorkerResponse) => void;
  reject: (err: Error) => void;
  timeout: NodeJS.Timeout;
  workerIndex: number;
};

export class ProposalTxCollectorWorkerManager {
  public processes: ChildProcess[] = [];
  public peerIds: string[] = [];
  public peerEnrs: string[] = [];
  public ports: number[] = [];
  public peerIdPrivateKeys: string[] = [];

  private pending = new Map<string, PendingRequest>();
  private workerLogger: Logger;

  constructor(
    private logger: Logger,
    private p2pBaseConfig: P2PConfig,
  ) {
    this.workerLogger = logger.createChild('proposal-bench-workers');
  }

  async startWorkers(numberOfPeers: number): Promise<void> {
    this.peerIdPrivateKeys = generatePeerIdPrivateKeys(numberOfPeers);
    this.ports = await getPortsWithRetry(numberOfPeers, this.workerLogger);
    this.peerEnrs = await makeEnrs(this.peerIdPrivateKeys, this.ports, this.p2pBaseConfig);

    this.processes = [];
    this.peerIds = new Array(numberOfPeers);

    // Start workers in batches to avoid connection storms
    const BATCH_SIZE = 5;
    const BATCH_DELAY_MS = 500;

    for (let batchStart = 0; batchStart < numberOfPeers; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, numberOfPeers);
      const batchPromises: Promise<void>[] = [];

      for (let i = batchStart; i < batchEnd; i++) {
        const config = this.createWorkerConfig(i, this.ports[i], this.peerEnrs);
        const worker = this.spawnWorker(i);
        this.processes.push(worker);

        batchPromises.push(
          this.sendCommand(worker, i, {
            type: 'START',
            requestId: randomUUID(),
            clientIndex: i,
            config,
          })
            .then(msg => {
              if (msg.type !== 'READY') {
                throw new Error(`Unexpected response to START: ${msg.type}`);
              }
              this.peerIds[i] = msg.peerId;
            })
            .then(() => undefined),
        );
      }

      await Promise.all(batchPromises);

      // Delay between batches to allow connections to settle
      if (batchEnd < numberOfPeers) {
        await sleep(BATCH_DELAY_MS);
      }
    }
  }

  async waitForFullMesh(expectedPeers: number): Promise<void> {
    const index = 0;
    // With many peers, we only need partial connectivity - worker 0 needs to reach at least some responders
    const minConnections = Math.min(expectedPeers - 1, Math.max(5, Math.floor((expectedPeers - 1) * 0.5)));

    await retryUntil(
      async () => {
        const msg = await this.sendCommand(this.processes[index], index, {
          type: 'GET_PEER_COUNT',
          requestId: randomUUID(),
        });
        if (msg.type !== 'PEER_COUNT') {
          throw new Error(`Unexpected response to GET_PEER_COUNT: ${msg.type}`);
        }
        return msg.count >= minConnections;
      },
      `peer discovery for worker ${index} (need ${minConnections} connections)`,
      60,
      1,
    );
  }

  async setTxsForAllWorkers(txsByWorker: Tx[][]): Promise<void> {
    if (txsByWorker.length !== this.processes.length) {
      throw new Error(`Expected ${this.processes.length} tx lists, got ${txsByWorker.length}`);
    }

    await Promise.all(
      txsByWorker.map((txs, index) =>
        this.sendCommand(this.processes[index], index, {
          type: 'SET_TXS',
          requestId: randomUUID(),
          txs: txs.map(serializeTx),
        }),
      ),
    );
  }

  async setBlockProposalForAllWorkers(blockProposal: BlockProposal): Promise<void> {
    const serialized = serializeBlockProposal(blockProposal);
    await Promise.all(
      this.processes.map((process, index) =>
        this.sendCommand(process, index, {
          type: 'SET_BLOCK_PROPOSAL',
          requestId: randomUUID(),
          blockProposal: serialized,
        }),
      ),
    );
  }

  async runCollector(
    collectorType: CollectorType,
    txHashes: TxHash[],
    blockProposal: BlockProposal,
    pinnedPeerId: string | undefined,
    timeoutMs: number,
  ): Promise<{ durationMs: number; fetchedCount: number }> {
    if (this.processes.length === 0) {
      throw new Error('No workers started');
    }

    const msg = await this.sendCommand(
      this.processes[0],
      0,
      {
        type: 'RUN_COLLECTOR',
        requestId: randomUUID(),
        collectorType,
        txHashes: txHashes.map(serializeTxHash),
        blockProposal: serializeBlockProposal(blockProposal),
        pinnedPeerId,
        peerIds: this.peerIds.slice(1),
        timeoutMs,
      },
      timeoutMs + 30_000,
    );

    if (msg.type !== 'COLLECTOR_RESULT') {
      throw new Error(`Unexpected response to RUN_COLLECTOR: ${msg.type}`);
    }

    return { durationMs: msg.durationMs, fetchedCount: msg.fetchedCount };
  }

  async stopAll(): Promise<void> {
    // Cancel all pending requests first
    for (const [requestId, pending] of this.pending.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Worker manager stopping'));
      this.pending.delete(requestId);
    }

    const stopPromises = this.processes.map((process, index) => this.terminateProcess(process, index));
    await Promise.allSettled(stopPromises);

    this.processes = [];
    this.peerIds = [];
    this.peerEnrs = [];
    this.ports = [];
    this.peerIdPrivateKeys = [];
  }

  private createWorkerConfig(clientIndex: number, port: number, peerEnrs: string[]): SerializedP2PConfig {
    return {
      ...this.p2pBaseConfig,
      p2pEnabled: true,
      debugDisableColocationPenalty: true,
      p2pDisableStatusHandshake: true,
      bootstrapNodeEnrVersionCheck: false,
      peerIdPrivateKey: this.peerIdPrivateKeys[clientIndex],
      listenAddress: '127.0.0.1',
      p2pIp: '127.0.0.1',
      p2pPort: port,
      bootstrapNodes: peerEnrs,
      maxPeerCount: Math.max(peerEnrs.length * 2, 100),
      bootstrapNodesAsFullPeers: true,
      peerCheckIntervalMS: 1000,
      // Increase dial timeout and reduce parallel dials to avoid connection storms
      dialTimeoutMs: 10_000,
      individualRequestTimeoutMs: 30_000,
    };
  }

  private spawnWorker(index: number): ChildProcess {
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

    const worker = fork(workerPath, {
      cwd: p2pRoot,
      execArgv,
      env,
    });

    worker.on('message', msg => {
      this.handleWorkerMessage(index, msg as WorkerResponse);
    });

    worker.on('disconnect', () => {
      this.workerLogger.warn(`Worker ${index} disconnected`);
      this.rejectPendingForWorker(index, new Error(`Worker ${index} disconnected`));
    });

    worker.on('error', err => {
      this.workerLogger.warn(`Worker ${index} error`, { error: err?.message ?? String(err) });
      this.rejectPendingForWorker(index, err instanceof Error ? err : new Error(String(err)));
    });

    worker.on('exit', (code, signal) => {
      if (code !== 0) {
        this.workerLogger.warn(`Worker ${index} exited unexpectedly`, { code, signal });
      }
      this.rejectPendingForWorker(index, new Error(`Worker ${index} exited`));
    });

    return worker;
  }

  private sendCommand(process: ChildProcess, workerIndex: number, command: WorkerCommand, timeoutMs = 60_000) {
    return new Promise<WorkerResponse>((resolve, reject) => {
      if (!process.send || !process.connected || process.exitCode !== null) {
        reject(new Error(`Worker ${workerIndex} IPC not available for ${command.type}`));
        return;
      }

      const timeout = setTimeout(() => {
        this.pending.delete(command.requestId);
        reject(new Error(`Timeout waiting for ${command.type} (worker ${workerIndex})`));
      }, timeoutMs);

      this.pending.set(command.requestId, { resolve, reject, timeout, workerIndex });

      try {
        process.send(command, undefined, undefined, err => {
          if (!err) {
            return;
          }
          if (!this.pending.has(command.requestId)) {
            return;
          }
          clearTimeout(timeout);
          this.pending.delete(command.requestId);
          reject(err);
        });
      } catch (err: any) {
        clearTimeout(timeout);
        this.pending.delete(command.requestId);
        reject(err);
      }
    });
  }

  private handleWorkerMessage(workerIndex: number, msg: WorkerResponse) {
    const pending = this.pending.get(msg.requestId);
    if (!pending) {
      this.workerLogger.warn(`Unexpected worker message without pending request`, { workerIndex, msg });
      return;
    }

    clearTimeout(pending.timeout);
    this.pending.delete(msg.requestId);

    if (msg.type === 'ERROR') {
      pending.reject(new Error(msg.error));
      return;
    }

    pending.resolve(msg);
  }

  private rejectPendingForWorker(workerIndex: number, error: Error) {
    for (const [requestId, pending] of this.pending.entries()) {
      if (pending.workerIndex !== workerIndex) {
        continue;
      }
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pending.delete(requestId);
    }
  }

  private async terminateProcess(process: ChildProcess, index: number): Promise<void> {
    if (!process || process.killed || process.exitCode !== null) {
      return;
    }

    const exitPromise = new Promise<void>(resolve => process.once('exit', () => resolve()));

    // First try graceful stop
    const requestId = randomUUID();
    const stopPromise = this.sendCommand(process, index, { type: 'STOP', requestId }, 5_000).catch(() => undefined);

    // Set up force kill after 5 seconds
    const forceKillTimeout = setTimeout(() => {
      if (!process.killed && process.exitCode === null) {
        try {
          process.kill('SIGKILL');
        } catch {
          // Ignore errors when force killing
        }
      }
    }, 5_000);

    try {
      // Wait for either stop command response or process exit
      await Promise.race([stopPromise, exitPromise, sleep(5_000)]);

      // Give process a moment to exit gracefully
      await Promise.race([exitPromise, sleep(2_000)]);
    } finally {
      clearTimeout(forceKillTimeout);

      // Final cleanup - ensure process is killed
      if (!process.killed && process.exitCode === null) {
        try {
          process.kill('SIGKILL');
        } catch {
          // Ignore errors
        }
      }
    }
  }
}

async function getPortsWithRetry(peers: number, logger: Logger): Promise<number[]> {
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const ports = await getPorts(peers);
      if (ports.length !== peers) {
        throw new Error(`Expected ${peers} ports, got ${ports.length}`);
      }
      return ports;
    } catch (err: any) {
      const isLast = attempt === maxAttempts - 1;
      if (isLast) {
        throw new Error(`Failed to get ports after ${maxAttempts} attempts: ${err?.message ?? String(err)}`);
      }
      logger.warn(`getPorts attempt ${attempt + 1}/${maxAttempts} failed; retrying...`);
      await sleep(500);
    }
  }

  throw new Error('unreachable');
}
