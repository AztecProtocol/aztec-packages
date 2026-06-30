import { AvmService } from '@aztec/bb-avm-sim';
import { type Logger, createLogger } from '@aztec/foundation/log';

/**
 * Something that can run AVM simulations, independent of the underlying transport (a single external
 * process, a pool of them, or an in-process stub). Callers hold this and never see how the work is dispatched.
 */
export interface AvmSimulator {
  /**
   * Run a fast simulation and return the msgpack-encoded result. If `signal` aborts, the backend stops the
   * simulation at the next cancellation checkpoint. Pooling backends check out an exclusive simulator for the
   * duration of the call (blocking until one is free) and release it when done — transparently to the caller.
   */
  simulate(inputBuffer: Uint8Array, signal?: AbortSignal): Promise<Uint8Array>;
  /** Run a simulation collecting proving hints and return the msgpack-encoded result. */
  simulateWithHints(inputBuffer: Uint8Array): Promise<Uint8Array>;
  /** Release any resources held (e.g. terminate backing processes). */
  destroy?(): Promise<void>;
}

export interface AvmSimulatorPoolOptions {
  /** Maximum number of concurrent AVM processes. If not set, defaults to AVM_MAX_CONCURRENT_SIMULATIONS env var or 4. */
  maxSize?: number;
  /** Path to the bb-avm-sim binary. If omitted, the generated package resolves it. */
  avmBinaryPath?: string;
  /** IPC path for the shared WSDB server. */
  wsdbIpcPath: string;
  /** IPC path for the shared CDB server. */
  cdbIpcPath: string;
  /** Optional logger function for AVM process output. */
  logger?: (msg: string) => void;
}

/** Lazily manages local bb-avm-sim processes for parallel AVM simulation. */
export class AvmSimulatorPool implements AvmSimulator {
  private slots: Array<AvmSimulator | null> = [];
  private available: number[] = [];
  private waiters: Array<{ resolve: (simulator: AvmSimulator) => void; reject: (error: Error) => void }> = [];
  private createdCount = 0;
  private log: Logger;
  private maxSize: number;

  constructor(private options: AvmSimulatorPoolOptions) {
    this.log = createLogger('simulator:avm-pool');
    this.maxSize = options.maxSize ?? parseInt(process.env.AVM_MAX_CONCURRENT_SIMULATIONS ?? '4', 10);
  }

  static spawn(options: AvmSimulatorPoolOptions): Promise<AvmSimulatorPool> {
    return Promise.resolve(new AvmSimulatorPool(options));
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.destroy();
  }

  async simulate(inputBuffer: Uint8Array, signal?: AbortSignal): Promise<Uint8Array> {
    const simulator = await this.checkout();
    try {
      return await simulator.simulate(inputBuffer, signal);
    } finally {
      this.return(simulator);
    }
  }

  async simulateWithHints(inputBuffer: Uint8Array): Promise<Uint8Array> {
    const simulator = await this.checkout();
    try {
      return await simulator.simulateWithHints(inputBuffer);
    } finally {
      this.return(simulator);
    }
  }

  /** Destroy all AVM processes in the pool. */
  async destroy(): Promise<void> {
    for (const waiter of this.waiters) {
      waiter.reject(new Error('AVM simulator pool destroyed'));
    }
    this.waiters = [];

    const destroyPromises: Promise<void>[] = [];
    for (const slot of this.slots) {
      if (slot?.destroy) {
        destroyPromises.push(slot.destroy());
      }
    }
    await Promise.all(destroyPromises);

    this.slots = [];
    this.available = [];
    this.createdCount = 0;
    this.log.info('AVM simulator pool destroyed');
  }

  /** Check out an AVM simulator from the pool, blocking until one is free. Caller must return() it when done. */
  private async checkout(): Promise<AvmSimulator> {
    const idx = this.available.pop();
    if (idx !== undefined && this.slots[idx]) {
      return this.slots[idx]!;
    }

    if (this.createdCount < this.maxSize || (idx !== undefined && !this.slots[idx])) {
      return await this.createSlot(idx);
    }

    return new Promise<AvmSimulator>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  /** Return an AVM simulator to the pool after use. */
  private return(simulator: AvmSimulator): void {
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

  private async createSlot(reuseIdx?: number): Promise<AvmSimulator> {
    const simulator = await AvmSimulatorProcess.spawn({
      binaryPath: this.options.avmBinaryPath,
      wsdbIpcPath: this.options.wsdbIpcPath,
      cdbIpcPath: this.options.cdbIpcPath,
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

class AvmSimulatorProcess implements AvmSimulator {
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
