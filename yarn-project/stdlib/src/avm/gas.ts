import { MAX_L2_GAS_PER_TX_PUBLIC_PORTION } from '@aztec/constants';

import { Gas } from '../gas/gas.js';
import { GasSettings } from '../gas/gas_settings.js';

/**
 * Apply L2 gas maximum to the gas settings.
 */
export function clampGasSettingsForAVM(gasSettings: GasSettings, gasUsedByPrivate: Gas): GasSettings {
  return new GasSettings(
    clampGasLimitsForAVM(gasSettings.gasLimits, gasUsedByPrivate),
    clampGasLimitsForAVM(gasSettings.teardownGasLimits, new Gas(0, 0)),
    gasSettings.maxFeesPerGas,
    gasSettings.maxPriorityFeesPerGas,
  );
}

/**
 * Apply L2 gas maximum to the gas limits.
 */
function clampGasLimitsForAVM(gasLimits: Gas, gasUsedByPrivate: Gas): Gas {
  return new Gas(
    /*daGas=*/ gasLimits.daGas,
    /*l2Gas=*/ Math.min(gasLimits.l2Gas, gasUsedByPrivate.l2Gas + MAX_L2_GAS_PER_TX_PUBLIC_PORTION),
  );
}
