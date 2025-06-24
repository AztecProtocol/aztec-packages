import type { Fr } from '@aztec/foundation/fields';

import type { Gas } from '../gas/gas.js';
import { GasFees } from '../gas/gas_fees.js';
import type { GasSettings } from '../gas/gas_settings.js';

/**
 * Compute the effective gas fees that should be used to compute the transaction fee.
 * This is the sum of the gas fees and the priority fees, but capped at the max fees per gas.
 */
export function computeEffectiveGasFees(gasFees: GasFees, gasSettings: GasSettings): GasFees {
  const { maxFeesPerGas, maxPriorityFeesPerGas } = gasSettings;
  const minBigInt = (f1: bigint, f2: bigint) => (f1 < f2 ? f1 : f2);
  const priorityFees = new GasFees(
    minBigInt(maxPriorityFeesPerGas.feePerDaGas, maxFeesPerGas.feePerDaGas - gasFees.feePerDaGas),
    minBigInt(maxPriorityFeesPerGas.feePerL2Gas, maxFeesPerGas.feePerL2Gas - gasFees.feePerL2Gas),
  );

  const effectiveFees = new GasFees(
    gasFees.feePerDaGas + priorityFees.feePerDaGas,
    gasFees.feePerL2Gas + priorityFees.feePerL2Gas,
  );

  return effectiveFees;
}

export function computeTransactionFee(gasFees: GasFees, gasSettings: GasSettings, gasUsed: Gas): Fr {
  const effectiveFees = computeEffectiveGasFees(gasFees, gasSettings);
  return gasUsed.computeFee(effectiveFees);
}
