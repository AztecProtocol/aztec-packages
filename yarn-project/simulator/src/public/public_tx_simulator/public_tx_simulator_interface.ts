import type { PublicTxResult } from '@aztec/stdlib/avm';
import type { Tx } from '@aztec/stdlib/tx';

/** Handle returned by simulate(), allowing the caller to await the result or cancel. */
export interface SimulationHandle {
  /** The promise that resolves with the simulation result. */
  result: Promise<PublicTxResult>;
  /**
   * Cancel the simulation if one is in progress.
   * This signals the underlying simulator (e.g., C++) to stop at the next safe point.
   * Safe to call even if no simulation is in progress.
   *
   * @param waitTimeoutMs - If provided, wait up to this many ms for the simulation to actually stop.
   * @returns Promise that resolves when cancellation is signaled (and optionally when simulation stops)
   */
  cancel(waitTimeoutMs?: number): Promise<void>;
}

export interface PublicTxSimulatorInterface {
  simulate(tx: Tx): SimulationHandle;
}

export interface MeasuredPublicTxSimulatorInterface {
  simulate(tx: Tx, txLabel: string): SimulationHandle;
}
