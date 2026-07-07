import type { AvmSimulator } from './avm_simulator.js';
import { AvmSimulatorPool, type AvmSimulatorPoolOptions } from './avm_simulator_pool.js';
import { CdbIpcServer } from './cdb_ipc_server.js';
import type { PublicContractsDB } from './public_db_sources.js';

/**
 * An {@link AvmSimulator} bound to a single WSDB fork. Each `simulate` call registers the fork's contracts DB
 * on the CDB server so the C++ AVM's contract-data callbacks route to it, and unregisters it once the call
 * returns — registration is only needed while the simulation is running. `simulateWithHints` needs no
 * registration (the hinted path makes no CDB callbacks).
 */
class ForkedAvmSimulator implements AvmSimulator {
  constructor(
    private avmSimulator: AvmSimulator,
    private cdbServer: CdbIpcServer,
    private readonly forkId: number,
    private contractsDB: PublicContractsDB,
    private timestamp: bigint,
  ) {}

  async simulate(inputBuffer: Uint8Array, signal?: AbortSignal): Promise<Uint8Array> {
    this.cdbServer.registerFork(this.forkId, this.contractsDB, this.timestamp);
    try {
      return await this.avmSimulator.simulate(inputBuffer, signal);
    } finally {
      this.cdbServer.unregisterFork(this.forkId);
    }
  }

  simulateWithHints(inputBuffer: Uint8Array): Promise<Uint8Array> {
    return this.avmSimulator.simulateWithHints(inputBuffer);
  }
}

/** Options for {@link AvmExecutor.spawn}; the executor supplies `cdbIpcPath` from the CDB server it creates. */
export type AvmExecutorOptions = Omit<AvmSimulatorPoolOptions, 'cdbIpcPath'>;

/**
 * Owns the public-execution backend: the AVM simulator (a pool of external bb-avm-sim processes) and the CDB
 * server that answers those processes' contract-data callbacks. The two are created together (the pool is
 * wired to the CDB server's IPC path) and destroyed together, so callers plumb a single `AvmExecutor` rather
 * than the pair. Per-fork work goes through {@link forFork}, which hands out an {@link AvmSimulator} and
 * keeps the CDB server (and the fork binding) private.
 */
export class AvmExecutor implements AsyncDisposable {
  private constructor(
    private avmSimulator: AvmSimulator,
    private cdbServer: CdbIpcServer,
  ) {}

  static async spawn(options: AvmExecutorOptions): Promise<AvmExecutor> {
    const cdbServer = new CdbIpcServer();
    const avmSimulator = await AvmSimulatorPool.spawn({ ...options, cdbIpcPath: cdbServer.ipcPath });
    return new AvmExecutor(avmSimulator, cdbServer);
  }

  /** Bind to a fork: returns a simulator that registers the fork's contracts DB for the duration of each call. */
  forFork(forkId: number, contractsDB: PublicContractsDB, timestamp: bigint): AvmSimulator {
    return new ForkedAvmSimulator(this.avmSimulator, this.cdbServer, forkId, contractsDB, timestamp);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.avmSimulator.destroy?.();
    await this.cdbServer.close();
  }
}
