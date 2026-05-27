import { getSchnorrAccountContractArtifact } from '@aztec/accounts/schnorr/lazy';
import { BackendType, Barretenberg, BarretenbergSync } from '@aztec/bb.js';
import type { Logger } from '@aztec/foundation/log';
import { openEphemeralStore } from '@aztec/kv-store/lmdb-v2';
import { LazyProtocolContractsProvider } from '@aztec/protocol-contracts/providers/lazy';
import { ContractStore } from '@aztec/pxe/client/lazy';
import { getContractClassFromArtifact } from '@aztec/stdlib/contract';

import { existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import { TXE_REQUIRED_PROTOCOL_CONTRACTS } from './index.js';
import type { TXEForeignCallInput } from './index.js';
import type { ForeignCallResult } from './utils/encoding.js';

void Barretenberg.initSingleton({ backend: BackendType.Wasm, skipSrsInit: true, threads: 1 });
void BarretenbergSync.initSingleton({ backend: BackendType.Wasm });

/**
 * Opens a fresh LMDB in a tmp dir and writes the protocol contracts in
 * {@link TXE_REQUIRED_PROTOCOL_CONTRACTS} plus the SchnorrAccount artifact, returning the
 * directory path and the SchnorrAccount class id (hex). The store handle is intentionally kept
 * alive: closing it would trigger the ephemeral-store cleanup hook and remove the tmp
 * directory, so any worker that has not yet cloned would find it missing.
 */
export async function buildSharedContractStore(): Promise<{ dataDir: string; schnorrClassId: string }> {
  const kvStore = await openEphemeralStore('txe-shared-contracts', undefined, 2);
  const dataDir = kvStore.dataDirectory;
  const contractStore = new ContractStore(kvStore);
  const provider = new LazyProtocolContractsProvider();
  const [protocolContracts, schnorrArtifact] = await Promise.all([
    Promise.all(TXE_REQUIRED_PROTOCOL_CONTRACTS.map(name => provider.getProtocolContractArtifact(name))),
    getSchnorrAccountContractArtifact(),
  ]);
  const schnorrClass = await getContractClassFromArtifact(schnorrArtifact);
  await Promise.all([
    ...protocolContracts.flatMap(({ instance, artifact, contractClass }) => [
      contractStore.addContractArtifact(artifact, contractClass),
      contractStore.addContractInstance(instance),
    ]),
    contractStore.addContractArtifact(schnorrArtifact, schnorrClass),
  ]);
  return { dataDir, schnorrClassId: schnorrClass.id.toString() };
}

/**
 * Resolves `worker.bundle.js` whether this code is running unbundled (next to dispatcher_pool.js
 * inside `dest/`) or bundled into `dest/bin/index.js` (one directory deeper). `import.meta.url`
 * refers to whichever module the calling code actually lives in; we try both relative locations
 * and use whichever exists.
 */
function resolveWorkerBundlePath(): URL {
  const candidates = [new URL('./worker.bundle.js', import.meta.url), new URL('../worker.bundle.js', import.meta.url)];
  return candidates.find(u => existsSync(fileURLToPath(u))) ?? candidates[0];
}

interface SerializedError {
  message: string;
  name?: string;
  stack?: string;
}

type WorkerMessage =
  | { type: 'result'; requestId: number; ok: true; value: ForeignCallResult }
  | { type: 'result'; requestId: number; ok: false; error: SerializedError }
  | {
      type: 'memstat';
      sessions: number;
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
      arrayBuffers: number;
    };

interface WorkerSlot {
  worker: Worker;
  sessions: Set<number>;
  inFlightRequestIds: Set<number>;
}

interface PendingRequest {
  resolve: (value: ForeignCallResult) => void;
  reject: (err: Error) => void;
  workerIdx: number;
}

function deserializeError(payload: SerializedError | undefined): Error {
  if (!payload) {
    return new Error('Worker returned an error with no payload');
  }
  const err = new Error(payload.message);
  if (payload.name) {
    err.name = payload.name;
  }
  if (payload.stack) {
    err.stack = payload.stack;
  }
  return err;
}

export interface TXEDispatcherPoolOptions {
  /** Number of worker threads */
  workers?: number;
}

/**
 * Main-thread router that owns a pool of TXE worker threads. Each worker runs its own
 * {@link TXEDispatcher} and handles foreign-call requests for the sessions assigned to it.
 *
 * Routing is sticky by `session_id`: new sessions go to a freshly spawned worker (up to
 * `maxWorkers`) or, once the cap is reached, to the existing worker with the fewest sessions.
 * Each session's state — TXESession, native world state, KV stores — stays single-threaded
 * within its worker; different sessions run in parallel across workers.
 *
 * The main thread builds a shared protocol-contracts LMDB once and passes its path via
 * `workerData`. Workers clone the data file on demand instead of re-registering the contracts.
 */
export class TXEDispatcherPool {
  private readonly workers: WorkerSlot[] = [];
  private readonly sessionToWorker = new Map<number, number>();
  private readonly pending = new Map<number, PendingRequest>();
  private nextRequestId = 0;
  private readonly maxWorkers: number;
  private readonly readyPromise: Promise<void>;
  private contractStoreSourceDir?: string;
  private schnorrClassId?: string;
  private workerPath?: URL;

  constructor(
    private readonly logger: Logger,
    opts: TXEDispatcherPoolOptions = {},
  ) {
    // TXE still doesn't scale well beyond 16 workers due to contention
    this.maxWorkers = Math.max(1, opts.workers ?? Math.min(cpus().length, 16));
    this.readyPromise = this.init();
  }

  /** Resolves once the shared protocol-contracts store is built. Workers spawn lazily on demand. */
  public ready(): Promise<void> {
    return this.readyPromise;
  }

  private async init(): Promise<void> {
    const t0 = Date.now();
    const { dataDir, schnorrClassId } = await buildSharedContractStore();
    this.contractStoreSourceDir = dataDir;
    this.schnorrClassId = schnorrClassId;
    this.workerPath = resolveWorkerBundlePath();
    this.logger.debug(`TXE dispatcher pool ready (lazy spawn, cap=${this.maxWorkers})`, {
      contractStoreSourceDir: dataDir,
      schnorrClassId,
      ms: Date.now() - t0,
    });
  }

  /**
   * Spawns a fresh worker and returns its index in `this.workers`. Caller must have awaited
   * `init()` so the shared contract store path is set. Messages posted before the worker has
   * finished loading are queued by Node's worker_threads transport.
   */
  private spawnWorker(): number {
    const workerIdx = this.workers.length;
    const w = new Worker(this.workerPath!, {
      workerData: { contractStoreSourceDir: this.contractStoreSourceDir, schnorrClassId: this.schnorrClassId },
    });
    const slot: WorkerSlot = {
      worker: w,
      sessions: new Set(),
      inFlightRequestIds: new Set(),
    };
    this.workers.push(slot);
    w.on('message', (msg: WorkerMessage) => this.handleMessage(workerIdx, msg));
    w.on('error', err => this.handleWorkerError(workerIdx, err));
    w.on('exit', code => {
      if (code !== 0) {
        this.handleWorkerError(workerIdx, new Error(`Worker ${workerIdx} exited with code ${code}`));
      }
    });
    this.logger.debug(`Spawning TXE worker ${workerIdx} on demand`, {
      cap: this.maxWorkers,
      poolSize: this.workers.length,
    });
    return workerIdx;
  }

  /** Routes a session-dispose request to the worker that owns the session. Fire-and-forget. */
  disposeSession(sessionId: number): void {
    const workerIdx = this.sessionToWorker.get(sessionId);
    if (workerIdx === undefined) {
      throw new Error(`disposeSession: no worker mapped for session ${sessionId}`);
    }
    this.sessionToWorker.delete(sessionId);
    const slot = this.workers[workerIdx];
    if (!slot) {
      throw new Error(`disposeSession: worker ${workerIdx} (session ${sessionId}) missing from pool`);
    }
    slot.sessions.delete(sessionId);
    slot.worker.postMessage({ type: 'dispose-session', sessionId });
  }

  // eslint-disable-next-line camelcase
  async resolve_foreign_call(callData: TXEForeignCallInput): Promise<ForeignCallResult> {
    // Make sure the shared contract store + worker bundle path are in place before we spawn.
    await this.readyPromise;
    const sessionId = callData.session_id;
    let workerIdx = this.sessionToWorker.get(sessionId);
    if (workerIdx === undefined) {
      workerIdx = this.pickOrSpawnWorker();
      this.sessionToWorker.set(sessionId, workerIdx);
      this.workers[workerIdx].sessions.add(sessionId);
      this.logger.debug(`Routing new session ${sessionId} to worker ${workerIdx}`);
    }

    const slot = this.workers[workerIdx];
    const requestId = this.nextRequestId++;
    return new Promise<ForeignCallResult>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, workerIdx: workerIdx! });
      slot.inFlightRequestIds.add(requestId);
      slot.worker.postMessage({ type: 'foreign-call', requestId, callData });
    });
  }

  /** Terminates all workers. Used by tests; production TXE exits the process directly. */
  async shutdown(): Promise<void> {
    const slots = this.workers.splice(0, this.workers.length);
    await Promise.all(slots.map(s => s.worker.terminate()));
    for (const [requestId, pending] of this.pending) {
      pending.reject(new Error('TXE dispatcher pool was shut down'));
      this.pending.delete(requestId);
    }
  }

  /**
   * Returns the index of the worker that should handle a new session. Spawns a fresh worker if
   * the pool hasn't reached its cap; otherwise picks the existing worker with the fewest
   * assigned sessions. Always returns a valid index into `this.workers`.
   */
  private pickOrSpawnWorker(): number {
    if (this.workers.length < this.maxWorkers) {
      return this.spawnWorker();
    }
    let minIdx = 0;
    let minCount = this.workers[0].sessions.size;
    for (let i = 1; i < this.workers.length; i++) {
      const count = this.workers[i].sessions.size;
      if (count < minCount) {
        minIdx = i;
        minCount = count;
      }
    }
    return minIdx;
  }

  private handleMessage(workerIdx: number, msg: WorkerMessage): void {
    switch (msg.type) {
      case 'result':
        this.handleResult(workerIdx, msg);
        return;
      case 'memstat':
        this.logger.debug(`worker ${workerIdx} memstat`, {
          worker: workerIdx,
          sessions: msg.sessions,
          rssMiB: Math.round(msg.rss / 1024 / 1024),
          heapTotalMiB: Math.round(msg.heapTotal / 1024 / 1024),
          heapUsedMiB: Math.round(msg.heapUsed / 1024 / 1024),
          externalMiB: Math.round(msg.external / 1024 / 1024),
          arrayBuffersMiB: Math.round(msg.arrayBuffers / 1024 / 1024),
        });
        return;
    }
  }

  private handleResult(workerIdx: number, msg: WorkerMessage & { type: 'result' }): void {
    const pending = this.pending.get(msg.requestId);
    if (!pending) {
      throw new Error(`handleResult: request ${msg.requestId} (worker ${workerIdx}) not in pending map`);
    }
    this.pending.delete(msg.requestId);
    const slot = this.workers[workerIdx];
    if (!slot) {
      throw new Error(`handleResult: worker ${workerIdx} (request ${msg.requestId}) missing from pool`);
    }
    slot.inFlightRequestIds.delete(msg.requestId);
    if (msg.ok) {
      pending.resolve(msg.value);
    } else {
      pending.reject(deserializeError(msg.error));
    }
  }

  private handleWorkerError(workerIdx: number, err: Error): void {
    this.logger.error(`TXE worker ${workerIdx} crashed; sessions assigned to it will fail`, err);
    const slot = this.workers[workerIdx];
    if (!slot) {
      throw new Error(`handleWorkerError: worker ${workerIdx} missing from pool (orig err: ${err.message})`);
    }
    for (const requestId of slot.inFlightRequestIds) {
      const pending = this.pending.get(requestId);
      if (!pending) {
        throw new Error(`handleWorkerError: in-flight request ${requestId} (worker ${workerIdx}) not in pending map`);
      }
      pending.reject(err);
      this.pending.delete(requestId);
    }
    slot.inFlightRequestIds.clear();
    for (const sessionId of slot.sessions) {
      this.sessionToWorker.delete(sessionId);
    }
    slot.sessions.clear();
  }
}
