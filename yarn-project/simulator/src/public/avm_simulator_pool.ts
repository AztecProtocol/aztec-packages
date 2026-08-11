import { AvmService } from '@aztec/bb-avm-sim';
import { AbortError } from '@aztec/foundation/error';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';

import type { AvmContractsDBContext, AvmSimulator } from './avm_simulator.js';
import { CdbIpcServer } from './cdb_ipc_server.js';

export interface AvmSimulatorPoolOptions {
  /** Maximum number of concurrent AVM processes. If not set, defaults to AVM_MAX_CONCURRENT_SIMULATIONS env var or 4. */
  maxSize?: number;
  /** Path to the bb-avm-sim binary. If omitted, the generated package resolves it. */
  avmBinaryPath?: string;
  /** IPC path for the shared WSDB server. */
  wsdbIpcPath: string;
  /** Optional logger function for AVM process output. */
  logger?: (msg: string) => void;
  /**
   * Flat delay between environmental spawn failures (default 1s). No backoff: sequencers live on
   * ~6s slots, so sleeping longer than this after a failure costs whole blocks while the machine may
   * have recovered — and a spawn attempt is cheap. Spawning never gives up on its own; the caller's
   * deadline (abort signal) is the bound.
   */
  spawnRetryIntervalMs?: number;
  /** Process spawner override. Test hook; defaults to spawning a real bb-avm-sim via the generated AvmService. */
  spawnProcess?: (options: AvmProcessSpawnOptions) => Promise<AvmProcessHandle>;
}

/** Options handed to the process spawner for each new pool slot. */
export interface AvmProcessSpawnOptions {
  binaryPath?: string;
  wsdbIpcPath: string;
  cdbIpcPath: string;
  logger?: (msg: string) => void;
}

/**
 * A handle to a single bb-avm-sim service: it runs serialized simulations and connects back to the
 * shared CDB/WSDB servers for state, but is unaware of which fork's contract data it is reading — that is
 * routed by the fork id baked into the input buffer. The underlying service owns its process lifecycle
 * (including respawn-on-death), so a handle stays usable for the life of the pool.
 */
export interface AvmProcessHandle {
  simulate(inputBuffer: Uint8Array, signal?: AbortSignal): Promise<Uint8Array>;
  simulateWithHints(inputBuffer: Uint8Array): Promise<Uint8Array>;
  destroy(): Promise<void>;
}

/**
 * The generated service flags errors caused by the death of the underlying process (rather than by the
 * request itself) with `retry: true`. That distinction is interpreted here and goes no further: process
 * lifecycle is invisible to the pool's callers.
 */
function isProcessFailure(err: unknown): boolean {
  return err instanceof Error && (err as Error & { retry?: unknown }).retry === true;
}

/** Sleep that wakes early (without throwing) when the signal aborts; callers re-check the signal. */
async function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    return sleep(ms);
  }
  let onAbort: () => void;
  const aborted = new Promise<void>(resolve => {
    onAbort = resolve;
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    await Promise.race([sleep(ms), aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort!);
  }
}

// After a cancellation is requested, how long the C++ process gets to cancel cooperatively (SIGUSR1
// checkpoint) before it is SIGKILLed. Killing is safe: the service respawns its process lazily, so the
// pool slot recovers instead of being leaked to a wedged simulation.
const CANCEL_KILL_GRACE_MS = 5_000;

/**
 * The public-execution AVM backend: a lazily-grown pool of bb-avm-sim services plus the CDB server that
 * answers those processes' contract-data callbacks. Callers hold this as an {@link AvmSimulator}; the pool,
 * the CDB server, its IPC path, and fork-id routing are all hidden behind that interface. Each `simulate`
 * registers the call's contracts DB on the CDB server for the duration of the simulation (keyed by fork id
 * so concurrent simulations on different forks don't collide) and unregisters it once the call returns.
 *
 * Process lifecycle is invisible to callers, exactly as when the simulator ran in-process: a simulation
 * either produces a result, fails on its own merits, or runs until the caller's deadline aborts it.
 * Environmental trouble is absorbed here — spawn failures retry indefinitely on a backoff ladder (bounded
 * only by the caller's abort signal), and a simulation whose process dies is re-issued on the respawned
 * process. The one deliberate exception: an input that kills the process twice is treated as a failing
 * transaction, so a simulator-crashing tx gets evicted instead of burning a process per block forever.
 */
export class AvmSimulatorPool implements AvmSimulator {
  private slots: AvmProcessHandle[] = [];
  private available: number[] = [];
  private waiters: Array<{ resolve: (simulator: AvmProcessHandle) => void; reject: (error: Error) => void }> = [];
  private createdCount = 0;
  private destroyed = false;
  private log: Logger;
  private maxSize: number;
  private cdbServer: CdbIpcServer;
  private readonly spawnRetryIntervalMs: number;
  private readonly spawnProcess: (options: AvmProcessSpawnOptions) => Promise<AvmProcessHandle>;

  constructor(private options: AvmSimulatorPoolOptions) {
    this.log = createLogger('simulator:avm-pool');
    this.maxSize = options.maxSize ?? parseInt(process.env.AVM_MAX_CONCURRENT_SIMULATIONS ?? '4', 10);
    this.cdbServer = new CdbIpcServer();
    this.spawnRetryIntervalMs = options.spawnRetryIntervalMs ?? 1_000;
    this.spawnProcess = options.spawnProcess ?? (spawnOptions => AvmSimulatorProcess.spawn(spawnOptions));
  }

  static async spawn(options: AvmSimulatorPoolOptions): Promise<AvmSimulatorPool> {
    const pool = new AvmSimulatorPool(options);
    // Always start one process up front so the first simulate() doesn't pay process spawn/connect cost.
    // This is also where configuration errors (missing binary) surface, fast and fatally.
    await pool.prewarm();
    return pool;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.destroy();
  }

  async simulate(inputBuffer: Uint8Array, context: AvmContractsDBContext, signal?: AbortSignal): Promise<Uint8Array> {
    // Register the fork's contracts DB so the C++ AVM's callbacks (which carry this fork id) route to it,
    // and unregister once the simulation returns — registration is only needed while the call is running.
    this.cdbServer.registerFork(context.forkId, context.contractsDB, context.timestamp);
    try {
      return await this.runOnPool(simulator => simulator.simulate(inputBuffer, signal), signal);
    } finally {
      this.cdbServer.unregisterFork(context.forkId);
    }
  }

  async simulateWithHints(inputBuffer: Uint8Array): Promise<Uint8Array> {
    // The hinted path makes no contract-data callbacks, so no CDB registration is needed.
    return await this.runOnPool(simulator => simulator.simulateWithHints(inputBuffer));
  }

  /** Destroy all AVM services in the pool and close the CDB server. */
  async destroy(): Promise<void> {
    this.destroyed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter.reject(new Error('AVM simulator pool destroyed'));
    }

    await Promise.all(this.slots.map(slot => slot.destroy()));

    this.slots = [];
    this.available = [];
    this.createdCount = 0;
    await this.cdbServer.close();
    this.log.info('AVM simulator pool destroyed');
  }

  /**
   * Eagerly spawn up to `count` AVM processes (capped at maxSize) and leave them available, so the
   * first simulate() doesn't pay process spawn/connect cost. Idempotent.
   */
  async prewarm(count = 1): Promise<void> {
    const target = Math.min(count, this.maxSize);
    const created: AvmProcessHandle[] = [];
    while (this.createdCount < target) {
      created.push(await this.checkout());
    }
    // Hand the checked-out processes back to the pool so checkout() reuses them.
    for (const simulator of created) {
      this.return(simulator);
    }
  }

  /**
   * Run a call on a pooled service. A call that fails because its process died is re-issued on the
   * respawned process; a second death for the same input is attributed to the input and surfaces as an
   * ordinary error (the pre-IPC equivalent — a native crash — took down the whole node, so a failed tx
   * is strictly gentler). Non-process failures surface as-is: they are the simulation's own verdict.
   */
  private async runOnPool<T>(fn: (simulator: AvmProcessHandle) => Promise<T>, signal?: AbortSignal): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const simulator = await this.checkout(signal);
      try {
        return await fn(simulator);
      } catch (err) {
        if (!isProcessFailure(err) || signal?.aborted) {
          throw err;
        }
        if (attempt > 0) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(
            `AVM simulator process died twice running this simulation; attributing the failure to the input: ${message}`,
            { cause: err },
          );
        }
        this.log.warn(`AVM process died during simulation; re-issuing once on the respawned process`, { err });
      } finally {
        this.return(simulator);
      }
    }
  }

  /** Check out an AVM service from the pool, blocking until one is free. Caller must return() it when done. */
  private async checkout(signal?: AbortSignal): Promise<AvmProcessHandle> {
    if (this.destroyed) {
      throw new Error('AVM simulator pool destroyed');
    }
    const idx = this.available.pop();
    if (idx !== undefined) {
      return this.slots[idx];
    }

    if (this.createdCount < this.maxSize) {
      return await this.createSlot(signal);
    }

    return new Promise<AvmProcessHandle>((resolve, reject) => {
      const waiter = { resolve, reject };
      if (signal) {
        const onAbort = () => {
          const at = this.waiters.indexOf(waiter);
          if (at >= 0) {
            this.waiters.splice(at, 1);
            reject(new AbortError('AVM checkout aborted'));
          }
        };
        signal.addEventListener('abort', onAbort, { once: true });
        waiter.resolve = simulator => {
          signal.removeEventListener('abort', onAbort);
          resolve(simulator);
        };
        waiter.reject = err => {
          signal.removeEventListener('abort', onAbort);
          reject(err);
        };
      }
      this.waiters.push(waiter);
    });
  }

  /** Return an AVM service to the pool after use. */
  private return(simulator: AvmProcessHandle): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve(simulator);
    } else {
      const idx = this.slots.indexOf(simulator);
      if (idx >= 0) {
        this.available.push(idx);
      }
    }
  }

  private async createSlot(signal?: AbortSignal): Promise<AvmProcessHandle> {
    // Reserve the slot count synchronously, before the async spawn, so concurrent checkouts can't all
    // observe `createdCount < maxSize` and overshoot the pool (the count is only bumped once control has
    // yielded on the await). Roll back the reservation if the spawn is abandoned.
    this.createdCount++;
    try {
      const simulator = await this.spawnUntilUp(signal);
      this.slots.push(simulator);
      this.log.debug(`Created AVM pool slot (${this.createdCount}/${this.maxSize})`);
      return simulator;
    } catch (err) {
      this.createdCount--;
      throw err;
    }
  }

  /**
   * Spawn a service, retrying environmental failures on a flat cadence indefinitely — the bound is
   * the caller's own deadline (abort signal), matching the pre-IPC contract where a simulation either
   * completed or was deadlined out. The cadence is deliberately fast and constant: an attempt is cheap,
   * a slow one self-paces inside the backend's connect backstop, and backing off would cost a
   * ~6s-slot sequencer whole blocks after the machine has already recovered. Configuration errors
   * (missing binary, flagged non-retryable by the generated service) throw immediately; the boot-time
   * prewarm is where those are meant to surface.
   */
  private async spawnUntilUp(signal?: AbortSignal): Promise<AvmProcessHandle> {
    for (let failures = 0; ; failures++) {
      if (this.destroyed) {
        throw new Error('AVM simulator pool destroyed');
      }
      if (signal?.aborted) {
        throw new AbortError('AVM process spawn aborted');
      }
      try {
        return await this.spawnProcess({
          binaryPath: this.options.avmBinaryPath,
          wsdbIpcPath: this.options.wsdbIpcPath,
          cdbIpcPath: this.cdbServer.ipcPath,
          logger: this.options.logger,
        });
      } catch (err) {
        if (!isProcessFailure(err)) {
          throw err;
        }
        this.log.warn(
          `Failed to spawn AVM process (attempt ${failures + 1}); retrying in ${this.spawnRetryIntervalMs}ms`,
          { err },
        );
        await abortableSleep(this.spawnRetryIntervalMs, signal);
      }
    }
  }
}

class AvmSimulatorProcess implements AvmProcessHandle {
  private constructor(private service: AvmService) {}

  static async spawn(options: AvmProcessSpawnOptions): Promise<AvmSimulatorProcess> {
    const service = await AvmService.spawn({
      binaryPath: options.binaryPath,
      transport: 'uds',
      logger: options.logger,
      extraArgs: ['--wsdb', options.wsdbIpcPath, '--cdb', options.cdbIpcPath],
      // Each simulation is self-contained (state comes from the WSDB/CDB servers, routed by fork id),
      // so a fresh process can safely serve the next call after a death.
      respawn: true,
    });
    return new AvmSimulatorProcess(service);
  }

  public async simulate(inputBuffer: Uint8Array, signal?: AbortSignal): Promise<Uint8Array> {
    let killTimer: NodeJS.Timeout | undefined;
    // Cooperative cancellation first: SIGUSR1 makes the C++ process stop at its next cancellation
    // checkpoint. If it doesn't respond within the grace (wedged in a slow op), SIGKILL it — the
    // service respawns lazily, so this reclaims the pool slot rather than leaking it.
    const onAbort = () => {
      this.service.sendProcessSignal('SIGUSR1');
      killTimer = setTimeout(() => this.service.sendProcessSignal('SIGKILL'), CANCEL_KILL_GRACE_MS);
    };
    if (signal?.aborted) {
      onAbort();
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      return (await this.service.simulate({ inputs: inputBuffer })).result;
    } finally {
      signal?.removeEventListener('abort', onAbort);
      if (killTimer !== undefined) {
        clearTimeout(killTimer);
      }
    }
  }

  public async simulateWithHints(inputBuffer: Uint8Array): Promise<Uint8Array> {
    return (await this.service.simulateWithHints({ inputs: inputBuffer })).result;
  }

  public async destroy(): Promise<void> {
    await this.service.destroy();
  }
}
