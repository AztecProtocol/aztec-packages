import { getSchnorrAccountContractArtifact } from '@aztec/accounts/schnorr/lazy';
import { BackendType, Barretenberg, BarretenbergSync } from '@aztec/bb.js';
import type { Logger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { protocolContractNames } from '@aztec/protocol-contracts';
import { LazyProtocolContractsProvider } from '@aztec/protocol-contracts/providers/lazy';
import { ContractStore } from '@aztec/pxe/client/lazy';
import { getContractClassFromArtifact } from '@aztec/stdlib/contract';

import { existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import type { TXEForeignCallInput } from './index.js';
import type { ForeignCallResult } from './utils/encoding.js';

void Barretenberg.initSingleton({ backend: BackendType.Wasm, skipSrsInit: true, threads: 1 });
void BarretenbergSync.initSingleton({ backend: BackendType.Wasm });

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
  | { type: 'spawned' }
  | { type: 'ready'; warmMs?: number; error?: SerializedError };

interface WorkerSlot {
  worker: Worker;
  sessions: Set<number>;
  inFlightRequestIds: Set<number>;
  ready: Promise<void>;
  resolveReady: () => void;
  rejectReady: (err: Error) => void;
  /** Set to true once the 'ready' message has been received (success or failure). */
  warmed: boolean;
  /** Wall-clock at which `new Worker()` was invoked, used to attribute startup cost. */
  spawnStart: number;
  /** Wall-clock at which the worker posted 'spawned' (i.e. its module graph finished loading). */
  spawnedAt?: number;
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
  /** Number of worker threads. Defaults to `min(cpus().length, 16)`. */
  workers?: number;
}

/**
 * Main-thread router that owns a pool of TXE worker threads. Each worker thread runs its own
 * {@link TXEDispatcher} and handles foreign-call requests for the sessions assigned to it.
 *
 * Routing is sticky by `session_id`: the first request for a new session is sent to the worker
 * with the fewest currently-assigned sessions; subsequent requests for that session always go to
 * the same worker. This keeps each session's state — TXESession, native world state, KV stores —
 * single-threaded within a worker, while different sessions can execute truly in parallel.
 *
 * Protocol-contracts cache: the main thread opens a single LMDB store, registers the 6 canonical
 * protocol contracts, and passes the directory to each worker via `workerData`. Workers then
 * open the same LMDB env as a second handle and skip the registration step. This avoids each
 * worker re-running `loadContractArtifact` + the LMDB writes for the same 6 contracts.
 */
export class TXEDispatcherPool {
  private readonly workers: WorkerSlot[] = [];
  private readonly sessionToWorker = new Map<number, number>();
  private readonly pending = new Map<number, PendingRequest>();
  private nextRequestId = 0;
  private readonly readyPromise: Promise<void>;

  constructor(
    private readonly logger: Logger,
    opts: TXEDispatcherPoolOptions = {},
  ) {
    const n = Math.max(1, opts.workers ?? Math.min(cpus().length, 16));
    this.readyPromise = this.start(n);
  }

  /** Resolves once every worker has acknowledged readiness. */
  public ready(): Promise<void> {
    return this.readyPromise;
  }

  private async start(n: number): Promise<void> {
    const poolStart = Date.now();
    // Build the shared protocol-contracts LMDB BEFORE spawning workers, so each worker can open
    // it as a reader instead of duplicating the artifact load + LMDB writes 8 times.
    const { dataDir: contractStoreSourceDir, schnorrClassId } = await this.buildSharedContractStore();
    const setupMs = Date.now() - poolStart;
    this.logger.info(`Built shared protocol-contracts store`, { contractStoreSourceDir, schnorrClassId, ms: setupMs });

    const workerPath = resolveWorkerBundlePath();
    for (let i = 0; i < n; i++) {
      const spawnStart = Date.now();
      const w = new Worker(workerPath, { workerData: { contractStoreSourceDir, schnorrClassId } });
      let resolveReady!: () => void;
      let rejectReady!: (err: Error) => void;
      const ready = new Promise<void>((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
      });
      const slot: WorkerSlot = {
        worker: w,
        sessions: new Set(),
        inFlightRequestIds: new Set(),
        ready,
        resolveReady,
        rejectReady,
        warmed: false,
        spawnStart,
      };
      this.workers.push(slot);
      w.on('message', (msg: WorkerMessage) => this.handleMessage(i, msg));
      w.on('error', err => this.handleWorkerError(i, err));
      w.on('exit', code => {
        if (code !== 0) {
          this.handleWorkerError(i, new Error(`Worker ${i} exited with code ${code}`));
        }
      });
      w.postMessage({ type: 'warm' });
    }
    this.logger.info(`Started TXE dispatcher pool with ${n} workers; warming up...`);
    try {
      await Promise.all(this.workers.map(s => s.ready));
      this.logger.info(`TXE dispatcher pool warmed`, { workers: n, wallClockMs: Date.now() - poolStart });
    } catch (err) {
      this.logger.error('TXE dispatcher pool warm-up failed', err);
      throw err;
    }
  }

  /**
   * Opens a fresh LMDB at a tmp dir and writes the 6 canonical protocol contracts AND the
   * SchnorrAccount artifact into it. Workers clone the resulting `data.mdb` and look the
   * SchnorrAccount artifact up by class id, skipping the per-worker
   * `getSchnorrAccountContractArtifact` + `computeArtifactHash` work entirely.
   *
   * Returns the directory path and the SchnorrAccount class id (hex). The store is intentionally
   * not closed here: keeping the writer handle alive avoids LMDB removing the tmp directory
   * mid-flight (see `openTmpStore`'s cleanup hook).
   */
  private async buildSharedContractStore(): Promise<{ dataDir: string; schnorrClassId: string }> {
    const kvStore = await openTmpStore('txe-shared-contracts', true, undefined, 2);
    const dataDir = kvStore.dataDirectory;
    const contractStore = new ContractStore(kvStore);
    const provider = new LazyProtocolContractsProvider();
    const [protocolContracts, schnorrArtifact] = await Promise.all([
      Promise.all(protocolContractNames.map(name => provider.getProtocolContractArtifact(name))),
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
   * Routes a session-dispose request to the worker that owns the session. Fire-and-forget; we
   * don't await the worker's cleanup (LMDB close + native world state close can take 10s of ms
   * each and there's no value in blocking the caller).
   */
  disposeSession(sessionId: number): void {
    const workerIdx = this.sessionToWorker.get(sessionId);
    if (workerIdx === undefined) {
      return;
    }
    this.sessionToWorker.delete(sessionId);
    const slot = this.workers[workerIdx];
    if (!slot) {
      return;
    }
    slot.sessions.delete(sessionId);
    slot.worker.postMessage({ type: 'dispose-session', sessionId });
  }

  // eslint-disable-next-line camelcase
  async resolve_foreign_call(callData: TXEForeignCallInput): Promise<ForeignCallResult> {
    const sessionId = callData.session_id;
    let workerIdx = this.sessionToWorker.get(sessionId);
    if (workerIdx === undefined) {
      workerIdx = this.pickLeastLoadedWorker();
      this.sessionToWorker.set(sessionId, workerIdx);
      this.workers[workerIdx].sessions.add(sessionId);
      this.logger.debug(`Routing new session ${sessionId} to worker ${workerIdx}`);
    }

    const slot = this.workers[workerIdx];
    await slot.ready;

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

  private pickLeastLoadedWorker(): number {
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
      case 'spawned':
        this.handleSpawned(workerIdx);
        return;
      case 'ready':
        this.handleReady(workerIdx, msg);
        return;
    }
  }

  private handleResult(workerIdx: number, msg: WorkerMessage & { type: 'result' }): void {
    const pending = this.pending.get(msg.requestId);
    if (!pending) {
      return;
    }
    this.pending.delete(msg.requestId);
    this.workers[workerIdx]?.inFlightRequestIds.delete(msg.requestId);
    if (msg.ok) {
      pending.resolve(msg.value);
    } else {
      pending.reject(deserializeError(msg.error));
    }
  }

  private handleSpawned(workerIdx: number): void {
    const slot = this.workers[workerIdx];
    if (!slot || slot.spawnedAt !== undefined) {
      return;
    }
    slot.spawnedAt = Date.now();
    this.logger.debug(`Worker ${workerIdx} spawned`, { spawnMs: slot.spawnedAt - slot.spawnStart });
  }

  private handleReady(workerIdx: number, msg: WorkerMessage & { type: 'ready' }): void {
    const slot = this.workers[workerIdx];
    if (!slot || slot.warmed) {
      return;
    }
    slot.warmed = true;
    if (msg.error) {
      slot.rejectReady(deserializeError(msg.error));
    } else {
      const spawnMs = slot.spawnedAt !== undefined ? slot.spawnedAt - slot.spawnStart : undefined;
      this.logger.debug(`Worker ${workerIdx} ready`, {
        spawnMs,
        warmMs: msg.warmMs,
        totalMs: Date.now() - slot.spawnStart,
      });
      slot.resolveReady();
    }
  }

  private handleWorkerError(workerIdx: number, err: Error): void {
    this.logger.error(`TXE worker ${workerIdx} crashed; sessions assigned to it will fail`, err);
    const slot = this.workers[workerIdx];
    if (!slot) {
      return;
    }
    if (!slot.warmed) {
      slot.warmed = true;
      slot.rejectReady(err);
    }
    for (const requestId of slot.inFlightRequestIds) {
      const pending = this.pending.get(requestId);
      if (pending) {
        pending.reject(err);
        this.pending.delete(requestId);
      }
    }
    slot.inFlightRequestIds.clear();
    for (const sessionId of slot.sessions) {
      this.sessionToWorker.delete(sessionId);
    }
    slot.sessions.clear();
  }
}
