import type { ZodFor } from '@aztec/foundation/schemas';
import type { GasUsed } from '@aztec/stdlib/gas';
import type { PrivateKernelTailCircuitPublicInputs } from '@aztec/stdlib/kernel';
import {
  type NestedProcessReturnValues,
  type OffchainEffect,
  type PrivateExecutionResult,
  type PublicSimulationOutput,
  type SimulationStats,
  type Tx,
  TxSimulationResult,
} from '@aztec/stdlib/tx';

import { z } from 'zod';

/**
 * Wraps a TxSimulationResult with the app call offset, which tracks where the app's calls begin in the flattened array
 * of calls. Tracking of app call offset is a wallet-level concern: the wallet may wrap the app payload in an
 * entrypoint or may prepend calls (this is typically done for fee payments).
 */
export class TxSimulationResultWithAppOffset {
  constructor(
    /** The underlying simulation result obtained from PXE. */
    public readonly result: TxSimulationResult,
    /**
     * Index of the app's first call in a flattened array of calls.
     *   0 = entrypoint, 1..N = wallet prepended calls, N+1 = first app call.
     * When 0, the app call is the root execution itself (DefaultEntrypoint / NO_FROM).
     */
    public readonly appCallOffset: number,
  ) {}

  /**
   * Returns the private return values that correspond to the first app call.
   * @param appCallIndex - Index of the app call within the app calls.
   */
  getPrivateReturnValuesOfAppCall(appCallIndex: number = 0): NestedProcessReturnValues | undefined {
    const all = this.result.getPrivateReturnValues();
    if (!this.appCallOffset) {
      // appCallOffset is 0 implies that the app call is the root execution

      if (appCallIndex != 0) {
        throw new Error('App call index cannot be defined when there is single root app call');
      }

      return all;
    }
    // The app call offset is defined on the flattened array of calls where entrypoint occupies index 0. Here we are
    // indexing into nested calls array and for this reason we need to subtract 1.
    return all?.nested?.[appCallIndex + this.appCallOffset - 1];
  }

  getPublicReturnValues() {
    return this.result.getPublicReturnValues();
  }

  get offchainEffects(): OffchainEffect[] {
    return this.result.offchainEffects;
  }

  get publicInputs(): PrivateKernelTailCircuitPublicInputs {
    return this.result.publicInputs;
  }

  get publicOutput(): PublicSimulationOutput | undefined {
    return this.result.publicOutput;
  }

  get gasUsed(): GasUsed {
    return this.result.gasUsed;
  }

  get stats(): SimulationStats | undefined {
    return this.result.stats;
  }

  get privateExecutionResult(): PrivateExecutionResult {
    return this.result.privateExecutionResult;
  }

  getPrivateReturnValues() {
    return this.result.getPrivateReturnValues();
  }

  toSimulatedTx(): Promise<Tx> {
    return this.result.toSimulatedTx();
  }

  static async random() {
    return new TxSimulationResultWithAppOffset(await TxSimulationResult.random(), 0);
  }

  static get schema(): ZodFor<TxSimulationResultWithAppOffset> {
    return z
      .object({
        result: TxSimulationResult.schema,
        appCallOffset: z.number(),
      })
      .transform(({ result, appCallOffset }) => new TxSimulationResultWithAppOffset(result, appCallOffset));
  }
}
