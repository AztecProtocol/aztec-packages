// Place large AVM text fixtures in here
import { GlobalVariables } from '@aztec/circuits.js';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';

import { AvmExecutionEnvironment } from '../avm_execution_environment.js';
import { AvmMachineState, InitialAvmMachineState } from '../avm_machine_state.js';

/**
 * Create an empty instance of the Execution Environment where all values are zero, unless overridden in the overrides object
 */
export function initExecutionEnvironment(overrides?: Partial<AvmExecutionEnvironment>): AvmExecutionEnvironment {
  return new AvmExecutionEnvironment(
    overrides?.address ?? AztecAddress.zero(),
    overrides?.storageAddress ?? AztecAddress.zero(),
    overrides?.origin ?? AztecAddress.zero(),
    overrides?.sender ?? AztecAddress.zero(),
    overrides?.portal ?? EthAddress.ZERO,
    overrides?.feePerL1Gas ?? Fr.zero(),
    overrides?.feePerL2Gas ?? Fr.zero(),
    overrides?.feePerDaGas ?? Fr.zero(),
    overrides?.contractCallDepth ?? Fr.zero(),
    overrides?.globals ?? GlobalVariables.empty(),
    overrides?.isStaticCall ?? false,
    overrides?.isDelegateCall ?? false,
    overrides?.calldata ?? [],
  );
}

/**
 * Create an empty instance of the Execution Environment where all values are zero, unless overridden in the overrides object
 */
export function initGlobalVariables(overrides?: Partial<GlobalVariables>): GlobalVariables {
  return new GlobalVariables(
    overrides?.chainId ?? Fr.zero(),
    overrides?.version ?? Fr.zero(),
    overrides?.blockNumber ?? Fr.zero(),
    overrides?.timestamp ?? Fr.zero(),
  );
}

/**
 * Create an empty instance of the "Initial" Machine State where all values are zero, unless overridden in the overrides object
 */
export function initInitialMachineState(overrides?: Partial<InitialAvmMachineState>): InitialAvmMachineState {
  return {
    l1GasLeft: overrides?.l1GasLeft ?? 0,
    l2GasLeft: overrides?.l2GasLeft ?? 0,
    daGasLeft: overrides?.daGasLeft ?? 0,
  };
}

/**
 * Create an empty instance of the Machine State where all values are zero, unless overridden in the overrides object
 */
export function initMachineState(overrides?: Partial<AvmMachineState>): AvmMachineState {
  return new AvmMachineState({
    l1GasLeft: overrides?.l1GasLeft ?? 0,
    l2GasLeft: overrides?.l2GasLeft ?? 0,
    daGasLeft: overrides?.daGasLeft ?? 0,
  });
}
