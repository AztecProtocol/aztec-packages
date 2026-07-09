import type { PublicContractsDB } from './public_db_sources.js';

/**
 * Identifies the contract data a single simulation reads. The AVM's contract-data lookups during a
 * `simulate` call are answered from `contractsDB`; `forkId` and `timestamp` scope those lookups to the
 * world-state fork being simulated against. How this reaches the AVM (in-process call, IPC callback
 * server, ...) is the implementation's concern — callers only supply the context.
 */
export interface AvmContractsDBContext {
  contractsDB: PublicContractsDB;
  forkId: number;
  timestamp: bigint;
}

/**
 * Something that can run AVM simulations, independent of how the work is dispatched (a single external
 * process, a pool of them, or an in-process stub). Callers hold this and never see the underlying transport.
 */
export interface AvmSimulator {
  /**
   * Run a fast simulation and return the msgpack-encoded result. `context` supplies the contracts DB whose
   * data the simulation reads. If `signal` aborts, the simulation stops at the next cancellation checkpoint.
   */
  simulate(inputBuffer: Uint8Array, context: AvmContractsDBContext, signal?: AbortSignal): Promise<Uint8Array>;
  /** Run a simulation collecting proving hints and return the msgpack-encoded result. */
  simulateWithHints(inputBuffer: Uint8Array): Promise<Uint8Array>;
  /** Release any resources held by the underlying implementation. */
  destroy?(): Promise<void>;
}
