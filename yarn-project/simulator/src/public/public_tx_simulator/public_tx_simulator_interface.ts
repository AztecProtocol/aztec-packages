import type { PublicTxResult } from '@aztec/stdlib/avm';
import type { Tx } from '@aztec/stdlib/tx';

export interface PublicTxSimulatorInterface {
  simulate(tx: Tx): Promise<PublicTxResult>;
  /**
   * Cancel the current simulation if one is in progress.
   * This signals the underlying simulator to stop at the next safe point.
   * Safe to call even if no simulation is in progress.
   * Optional - not all implementations support cancellation.
   *
   * @param waitTimeoutMs - If provided, wait up to this many ms for the simulation to actually stop.
   *                        Cancellation is cooperative: signaling it only sets a flag the simulator
   *                        checks at certain points, so if it's mid slow-operation it won't stop until
   *                        that completes.
   * @returns Promise that resolves when cancellation is signaled (and optionally when simulation stops)
   */
  cancel?(waitTimeoutMs?: number): Promise<void>;
}

export interface MeasuredPublicTxSimulatorInterface {
  simulate(tx: Tx, txLabel: string): Promise<PublicTxResult>;
  /**
   * Cancel the current simulation if one is in progress.
   * This signals the underlying simulator to stop at the next safe point.
   * Safe to call even if no simulation is in progress.
   * Optional - not all implementations support cancellation.
   *
   * @param waitTimeoutMs - If provided, wait up to this many ms for the simulation to actually stop.
   * @returns Promise that resolves when cancellation is signaled (and optionally when simulation stops)
   */
  cancel?(waitTimeoutMs?: number): Promise<void>;
}
