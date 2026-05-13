import { type Logger, createLogger } from '@aztec/foundation/log';

/**
 * Minimal interface for an out-of-process AVM simulator that speaks msgpack over IPC.
 *
 * Intentionally aligned with `IMsgpackBackendAsync` from bb.js — `AvmBackend` (which spawns
 * `aztec-avm` and routes msgpack via UDS) and `AvmSimulatorPool` (a worker pool of those backends)
 * both implement this. Anything that wants to run an AVM simulation can take this interface and
 * not care which it got.
 */
export interface AvmIpcBackend {
  call(inputBuffer: Uint8Array): Promise<Uint8Array>;
  cancel?(): Promise<void>;
  destroy?(): Promise<void>;
}

export interface AvmSimulatorPoolOptions {
  /** Maximum number of concurrent AVM processes. If not set, defaults to AVM_MAX_CONCURRENT_SIMULATIONS env var or 4. */
  maxSize?: number;
  /** Path to the aztec-avm binary. */
  avmBinaryPath: string;
  /** Socket path for the shared WSDB server. */
  wsdbSocketPath: string;
  /** Socket path for the shared CDB server. */
  cdbSocketPath: string;
  /** Optional logger function for AVM process output. */
  logger?: (msg: string) => void;
}

/**
 * Pool of AVM backends for parallel simulation.
 * Implements AvmIpcBackend so it's a drop-in replacement for a single backend.
 * Each call() checks out a slot (a separate aztec-avm process), forwards the
 * request, and returns the slot to the pool when done.
 * Slots are created lazily on first use, up to maxSize.
 */
export class AvmSimulatorPool implements AvmIpcBackend {
  private slots: Array<AvmIpcBackend | null> = [];
  private available: number[] = [];
  private waiters: Array<{ resolve: (backend: AvmIpcBackend) => void; reject: (error: Error) => void }> = [];
  private createdCount = 0;
  private log: Logger;
  private maxSize: number;

  constructor(private options: AvmSimulatorPoolOptions) {
    this.log = createLogger('simulator:avm-pool');
    this.maxSize = options.maxSize ?? parseInt(process.env.AVM_MAX_CONCURRENT_SIMULATIONS ?? '4', 10);
  }

  /**
   * Resolve the aztec-avm binary path via {@link findAvmBinary} and return a ready-to-use
   * pool. Encapsulates the dynamic bb.js import that callers would otherwise repeat.
   */
  static async spawn(options: Omit<AvmSimulatorPoolOptions, 'avmBinaryPath'>): Promise<AvmSimulatorPool> {
    const { findAvmBinary } = await import('@aztec/bb.js/platform');
    const avmBinaryPath = findAvmBinary();
    if (!avmBinaryPath) {
      throw new Error('aztec-avm binary not found');
    }
    return new AvmSimulatorPool({ ...options, avmBinaryPath });
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.destroy();
  }

  /** Send a request to any available AVM process. Blocks if all are busy. */
  async call(inputBuffer: Uint8Array): Promise<Uint8Array> {
    const backend = await this.checkout();
    try {
      return await backend.call(inputBuffer);
    } finally {
      this.return(backend);
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

  /** Check out an AVM backend from the pool. Caller must return() it when done. */
  async checkout(): Promise<AvmIpcBackend> {
    const idx = this.available.pop();
    if (idx !== undefined && this.slots[idx]) {
      return this.slots[idx]!;
    }

    // Create a new slot if under max (or replacing a dead slot)
    if (this.createdCount < this.maxSize || (idx !== undefined && !this.slots[idx])) {
      return await this.createSlot(idx);
    }

    return new Promise<AvmIpcBackend>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  /** Return an AVM backend to the pool after use. */
  return(backend: AvmIpcBackend): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve(backend);
    } else {
      const idx = this.slots.indexOf(backend);
      if (idx >= 0) {
        this.available.push(idx);
      }
    }
  }

  private async createSlot(reuseIdx?: number): Promise<AvmIpcBackend> {
    const { AvmBackend } = await import('@aztec/bb.js/aztec-avm');
    const backend = new AvmBackend({
      binaryPath: this.options.avmBinaryPath,
      wsdbSocketPath: this.options.wsdbSocketPath,
      cdbSocketPath: this.options.cdbSocketPath,
      logger: this.options.logger,
    });
    if (reuseIdx !== undefined && reuseIdx < this.slots.length) {
      this.slots[reuseIdx] = backend;
    } else {
      this.slots.push(backend);
      this.createdCount++;
    }
    this.log.debug(`Created AVM pool slot (${this.createdCount}/${this.maxSize})`);
    return backend;
  }
}
