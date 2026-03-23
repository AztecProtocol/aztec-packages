import { type Logger, createLogger } from '@aztec/foundation/log';

import type { AvmIpcBackend } from './public_tx_simulator/cpp_public_tx_simulator.js';

export interface AvmSimulatorPoolOptions {
  /** Maximum number of concurrent AVM processes. */
  maxSize: number;
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
  private waiters: Array<(backend: AvmIpcBackend) => void> = [];
  private createdCount = 0;
  /** Backends currently in use by in-flight call()s. */
  private inFlight = new Set<AvmIpcBackend>();
  private log: Logger;

  constructor(private options: AvmSimulatorPoolOptions) {
    this.log = createLogger('simulator:avm-pool');
  }

  /** Send a request to any available AVM process. Blocks if all are busy. */
  async call(inputBuffer: Uint8Array): Promise<Uint8Array> {
    const backend = await this.checkout();
    this.inFlight.add(backend);
    try {
      return await backend.call(inputBuffer);
    } finally {
      this.inFlight.delete(backend);
      this.return(backend);
    }
  }

  /**
   * Cancel all in-flight simulations by sending SIGUSR1 to their AVM processes.
   * The C++ side sets a CancellationToken, causing the simulation to throw at
   * the next opcode check. The processes stay alive and are reusable.
   */
  async cancel(): Promise<void> {
    for (const backend of this.inFlight) {
      await backend.cancel?.();
    }
  }

  /** Destroy all AVM processes in the pool. */
  async destroy(): Promise<void> {
    for (const waiter of this.waiters) {
      waiter(null as any);
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
    this.inFlight.clear();
    this.createdCount = 0;
    this.log.info('AVM simulator pool destroyed');
  }

  private async checkout(): Promise<AvmIpcBackend> {
    const idx = this.available.pop();
    if (idx !== undefined && this.slots[idx]) {
      return this.slots[idx]!;
    }

    // Create a new slot if under max (or replacing a dead slot)
    if (this.createdCount < this.options.maxSize || (idx !== undefined && !this.slots[idx])) {
      return await this.createSlot(idx);
    }

    return new Promise<AvmIpcBackend>(resolve => {
      this.waiters.push(resolve);
    });
  }

  private return(backend: AvmIpcBackend): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(backend);
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
    this.log.debug(`Created AVM pool slot (${this.createdCount}/${this.options.maxSize})`);
    return backend;
  }
}
