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
  private log: Logger;

  constructor(private options: AvmSimulatorPoolOptions) {
    this.log = createLogger('simulator:avm-pool');
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
    this.createdCount = 0;
    this.log.info('AVM simulator pool destroyed');
  }

  private async checkout(): Promise<AvmIpcBackend> {
    const idx = this.available.pop();
    if (idx !== undefined) {
      return this.slots[idx]!;
    }

    if (this.createdCount < this.options.maxSize) {
      return await this.createSlot();
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

  private async createSlot(): Promise<AvmIpcBackend> {
    const { AvmBackend } = await import('@aztec/bb.js/aztec-avm');
    const backend = new AvmBackend({
      binaryPath: this.options.avmBinaryPath,
      wsdbSocketPath: this.options.wsdbSocketPath,
      cdbSocketPath: this.options.cdbSocketPath,
      logger: this.options.logger,
    });
    const idx = this.slots.length;
    this.slots.push(backend);
    this.createdCount++;
    this.log.debug(`Created AVM pool slot ${idx} (${this.createdCount}/${this.options.maxSize})`);
    return backend;
  }
}
