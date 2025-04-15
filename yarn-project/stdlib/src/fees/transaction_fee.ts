import type { Fr } from '@aztec/foundation/fields';

import type { Gas } from '../gas/gas.js';
import { GasFees } from '../gas/gas_fees.js';
import type { GasSettings } from '../gas/gas_settings.js';

export function computeTransactionFee(gasFees: GasFees, gasSettings: GasSettings, gasUsed: Gas): Fr {
  const { maxFeesPerGas, maxPriorityFeesPerGas } = gasSettings;
  const minField = (f1: Fr, f2: Fr) => (f1.lt(f2) ? f1 : f2);
  const priorityFees = new GasFees(
    minField(maxPriorityFeesPerGas.feePerDaGas, maxFeesPerGas.feePerDaGas.sub(gasFees.feePerDaGas)),
    minField(maxPriorityFeesPerGas.feePerL2Gas, maxFeesPerGas.feePerL2Gas.sub(gasFees.feePerL2Gas)),
  );

  const totalFees = new GasFees(
    gasFees.feePerDaGas.add(priorityFees.feePerDaGas),
    gasFees.feePerL2Gas.add(priorityFees.feePerL2Gas),
  );

  return gasUsed.computeFee(totalFees);
}
