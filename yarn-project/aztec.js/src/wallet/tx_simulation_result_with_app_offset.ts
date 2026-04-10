import type { ZodFor } from '@aztec/foundation/schemas';
import { optional } from '@aztec/foundation/schemas';
import { PrivateKernelTailCircuitPublicInputs } from '@aztec/stdlib/kernel';
import {
  type NestedProcessReturnValues,
  PrivateExecutionResult,
  PublicSimulationOutput,
  type SimulationStats,
  SimulationStatsSchema,
  TxSimulationResult,
} from '@aztec/stdlib/tx';

import { z } from 'zod';

/**
 * Extends TxSimulationResult with the app call offset, which tracks where the app's calls begin in the flattened
 * array of calls. Tracking of app call offset is a wallet-level concern: the wallet may wrap the app payload in an
 * entrypoint or may prepend calls (this is typically done for fee payments).
 */
export class TxSimulationResultWithAppOffset extends TxSimulationResult {
  constructor(
    privateExecutionResult: PrivateExecutionResult,
    publicInputs: PrivateKernelTailCircuitPublicInputs,
    publicOutput?: PublicSimulationOutput,
    stats?: SimulationStats,
    /**
     * Index of the app's first call in a flattened array of calls.
     *   0 = app call is the root execution itself (DefaultEntrypoint / NO_FROM).
     *   1..N = wallet prepended calls before the app call.
     *   undefined = wallet did not send the field; use heuristic fallback.
     */
    public readonly appCallOffset: number | undefined = undefined,
  ) {
    super(privateExecutionResult, publicInputs, publicOutput, stats);
  }

  /**
   * Returns the private return values that correspond to the provided app call.
   * @param appCallIndex - Index of the app call within the app calls.
   */
  getPrivateReturnValuesOfAppCall(appCallIndex: number = 0): NestedProcessReturnValues | undefined {
    const all = this.getPrivateReturnValues();

    if (this.appCallOffset === undefined) {
      // appCallOffset was not sent. Apply the pre-offset heuristic for backwards compatibility.
      // If there are nested calls, the app was wrapped in an account contract entrypoint and its return values
      // live in nested[appCallIndex]. Otherwise the app call is the root execution.
      if ((all?.nested?.length ?? 0) > 0) {
        return all?.nested?.[appCallIndex];
      }
      if (appCallIndex !== 0) {
        throw new Error('App call index cannot be defined when there is single root app call');
      }
      return all;
    }

    // appCallOffset is defined on the flattened array of calls where entrypoint occupies index 0 and the app's
    // first call occupies index appCallOffset. appCallIndex 0 with appCallOffset 0 means the root itself.
    if (this.appCallOffset === 0 && appCallIndex === 0) {
      return all;
    }
    // For all other cases, index into nested: subtract 1 because nested[0] corresponds to flat index 1 (first nested).
    return all?.nested?.[appCallIndex + this.appCallOffset - 1];
  }

  /**
   * Creates a TxSimulationResultWithAppOffset from an existing TxSimulationResult, attaching the app call offset
   * computed by the wallet (i.e. how many calls precede the first app call in the flattened execution tree).
   * @param result - The simulation result to wrap.
   * @param appCallOffset - The index of the app's first call in the flattened execution tree.
   */
  static fromResultAndOffset(result: TxSimulationResult, appCallOffset: number): TxSimulationResultWithAppOffset {
    return new TxSimulationResultWithAppOffset(
      result.privateExecutionResult,
      result.publicInputs,
      result.publicOutput,
      result.stats,
      appCallOffset,
    );
  }

  static override async random() {
    const base = await TxSimulationResult.random();
    return TxSimulationResultWithAppOffset.fromResultAndOffset(base, 0);
  }

  static override get schema(): ZodFor<TxSimulationResultWithAppOffset> {
    return z
      .object({
        privateExecutionResult: PrivateExecutionResult.schema,
        publicInputs: PrivateKernelTailCircuitPublicInputs.schema,
        publicOutput: PublicSimulationOutput.schema.optional(),
        stats: optional(SimulationStatsSchema),
        appCallOffset: optional(z.number()),
      })
      .transform(
        ({ privateExecutionResult, publicInputs, publicOutput, stats, appCallOffset }) =>
          new TxSimulationResultWithAppOffset(privateExecutionResult, publicInputs, publicOutput, stats, appCallOffset),
      );
  }
}
