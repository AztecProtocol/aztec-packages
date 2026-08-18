import type { FieldsOf } from '@aztec/foundation/types';
import type { Gas, GasFees } from '@aztec/stdlib/gas';

/** Wire form of {@link Gas}: the domain type's fields as decoded off the wire, before conversion. */
export type GasData = FieldsOf<Gas>;

/** Wire form of {@link GasFees}: the domain type's fields as decoded off the wire, before conversion. */
export type GasFeesData = FieldsOf<GasFees>;

/** Wire form of the gas usage and fee limits set by a transaction sender. */
export type GasSettingsData = {
  gasLimits: GasData;
  teardownGasLimits: GasData;
  maxFeesPerGas: GasFeesData;
  maxPriorityFeesPerGas: GasFeesData;
};
