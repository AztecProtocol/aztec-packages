/**
 * Something that can run AVM simulations, independent of how the work is dispatched (a single external
 * process, a pool of them, or an in-process stub). Callers hold this and never see the underlying transport.
 */
export interface AvmSimulator {
  /**
   * Run a fast simulation and return the msgpack-encoded result. If `signal` aborts, the simulation stops
   * at the next cancellation checkpoint.
   */
  simulate(inputBuffer: Uint8Array, signal?: AbortSignal): Promise<Uint8Array>;
  /** Run a simulation collecting proving hints and return the msgpack-encoded result. */
  simulateWithHints(inputBuffer: Uint8Array): Promise<Uint8Array>;
  /** Release any resources held by the underlying implementation. */
  destroy?(): Promise<void>;
}
