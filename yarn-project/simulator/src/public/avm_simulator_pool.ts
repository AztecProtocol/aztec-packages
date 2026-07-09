import { AvmService } from '@aztec/bb-avm-sim';
import { type Logger, createLogger } from '@aztec/foundation/log';

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
}

/**
 * A raw handle to a single bb-avm-sim process: it runs a serialized simulation and connects back to the
 * shared CDB/WSDB servers for state, but is unaware of which fork's contract data it is reading — that is
 * routed by the fork id baked into the input buffer.
 */
interface AvmProcessHandle {
  simulate(inputBuffer: Uint8Array, signal?: AbortSignal): Promise<Uint8Array>;
  simulateWithHints(inputBuffer: Uint8Array): Promise<Uint8Array>;
  destroy(): Promise<void>;
}

/**
 * The public-execution AVM backend: a lazily-grown pool of bb-avm-sim processes plus the CDB server that
 * answers those processes' contract-data callbacks. Callers hold this as an {@link AvmSimulator}; the pool,
 * the CDB server, its IPC path, and fork-id routing are all hidden behind that interface. Each `simulate`
 * registers the call's contracts DB on the CDB server for the duration of the simulation (keyed by fork id
 * so concurrent simulations on different forks don't collide) and unregisters it once the call returns.
 */
export class AvmSimulatorPool implements AvmSimulator {
  private slots: Array<AvmProcessHandle | null> = [];
  private available: number[] = [];
  private waiters: Array<{ resolve: (simulator: AvmProcessHandle) => void; reject: (error: Error) => void }> = [];
  private createdCount = 0;
  private log: Logger;
  private maxSize: number;
  private cdbServer: CdbIpcServer;

  constructor(private options: AvmSimulatorPoolOptions) {
    this.log = createLogger('simulator:avm-pool');
    this.maxSize = options.maxSize ?? parseInt(process.env.AVM_MAX_CONCURRENT_SIMULATIONS ?? '4', 10);
    this.cdbServer = new CdbIpcServer();
  }

  static async spawn(options: AvmSimulatorPoolOptions): Promise<AvmSimulatorPool> {
    const pool = new AvmSimulatorPool(options);
    // Always start one process up front so the first simulate() doesn't pay process spawn/connect cost.
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
      const simulator = await this.checkout();
      try {
        return await simulator.simulate(inputBuffer, signal);
      } finally {
        this.return(simulator);
      }
    } finally {
      this.cdbServer.unregisterFork(context.forkId);
    }
  }

  async simulateWithHints(inputBuffer: Uint8Array): Promise<Uint8Array> {
    // The hinted path makes no contract-data callbacks, so no CDB registration is needed.
    const simulator = await this.checkout();
    try {
      return await simulator.simulateWithHints(inputBuffer);
    } finally {
      this.return(simulator);
    }
  }

  /** Destroy all AVM processes in the pool and close the CDB server. */
  async destroy(): Promise<void> {
    for (const waiter of this.waiters) {
      waiter.reject(new Error('AVM simulator pool destroyed'));
    }
    this.waiters = [];

    const destroyPromises: Promise<void>[] = [];
    for (const slot of this.slots) {
      if (slot) {
        destroyPromises.push(slot.destroy());
      }
    }
    await Promise.all(destroyPromises);

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
      created.push(await this.createSlot());
    }
    // Hand the freshly-spawned processes back to the pool so checkout() reuses them.
    for (const simulator of created) {
      this.return(simulator);
    }
  }

  /** Check out an AVM process from the pool, blocking until one is free. Caller must return() it when done. */
  private async checkout(): Promise<AvmProcessHandle> {
    const idx = this.available.pop();
    if (idx !== undefined && this.slots[idx]) {
      return this.slots[idx]!;
    }

    if (this.createdCount < this.maxSize || (idx !== undefined && !this.slots[idx])) {
      return await this.createSlot(idx);
    }

    return new Promise<AvmProcessHandle>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  /** Return an AVM process to the pool after use. */
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

  private async createSlot(reuseIdx?: number): Promise<AvmProcessHandle> {
    const simulator = await AvmSimulatorProcess.spawn({
      binaryPath: this.options.avmBinaryPath,
      wsdbIpcPath: this.options.wsdbIpcPath,
      cdbIpcPath: this.cdbServer.ipcPath,
      logger: this.options.logger,
    });
    if (reuseIdx !== undefined && reuseIdx < this.slots.length) {
      this.slots[reuseIdx] = simulator;
    } else {
      this.slots.push(simulator);
      this.createdCount++;
    }
    this.log.debug(`Created AVM pool slot (${this.createdCount}/${this.maxSize})`);
    return simulator;
  }
}

class AvmSimulatorProcess implements AvmProcessHandle {
  private constructor(private service: AvmService) {}

  static async spawn(options: {
    binaryPath?: string;
    wsdbIpcPath: string;
    cdbIpcPath: string;
    logger?: (msg: string) => void;
  }): Promise<AvmSimulatorProcess> {
    const service = await AvmService.spawn({
      binaryPath: options.binaryPath,
      transport: 'uds',
      logger: options.logger,
      extraArgs: ['--wsdb', options.wsdbIpcPath, '--cdb', options.cdbIpcPath],
    });
    return new AvmSimulatorProcess(service);
  }

  public async simulate(inputBuffer: Uint8Array, signal?: AbortSignal): Promise<Uint8Array> {
    // Signal the C++ process to stop at its next cancellation checkpoint when the caller aborts.
    const onAbort = () => this.service.sendProcessSignal('SIGUSR1');
    if (signal?.aborted) {
      onAbort();
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      return (await this.service.simulate({ inputs: inputBuffer })).result;
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  public async simulateWithHints(inputBuffer: Uint8Array): Promise<Uint8Array> {
    return (await this.service.simulateWithHints({ inputs: inputBuffer })).result;
  }

  public async destroy(): Promise<void> {
    await this.service.destroy();
  }
}
