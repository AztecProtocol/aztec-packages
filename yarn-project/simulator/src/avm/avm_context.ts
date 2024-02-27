import { AztecAddress } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';

import { AvmExecutionEnvironment } from './avm_execution_environment.js';
import { AvmMachineState } from './avm_machine_state.js';
import { AvmPersistableStateManager } from './journal/journal.js';

/**
 * An execution context includes the information necessary to initiate AVM
 * execution along with all state maintained by the AVM throughout execution.
 */
export class AvmContext {
  /**
   * Create a new AVM context
   * @param persistableState - Manages world state and accrued substate during execution - (caching, fetching, tracing)
   * @param environment - Contains constant variables provided by the kernel
   * @param machineState - VM state that is modified on an instruction-by-instruction basis
   * @returns new AvmContext instance
   */
  constructor(
    public persistableState: AvmPersistableStateManager,
    public environment: AvmExecutionEnvironment,
    public machineState: AvmMachineState,
  ) {}

  /**
   * Prepare a new AVM context that will be ready for an external/nested call
   * - Fork the world state journal
   * - Derive a machine state from the current state
   *   - E.g., gas metering is preserved but pc is reset
   * - Derive an execution environment from the caller/parent
   *   - Alter both address and storageAddress
   *
   * @param address - The contract instance to initialize a context for
   * @param calldata - Data/arguments for nested call
   * @returns new AvmContext instance
   */
  public createNestedContractCallContext(address: AztecAddress, calldata: Fr[]): AvmContext {
    const newExecutionEnvironment = this.environment.deriveEnvironmentForNestedCall(address, calldata);
    const forkedWorldState = this.persistableState.fork();
    const machineState = AvmMachineState.fromState(this.machineState);
    return new AvmContext(forkedWorldState, newExecutionEnvironment, machineState);
  }

  /**
   * Prepare a new AVM context that will be ready for an external/nested static call
   * - Fork the world state journal
   * - Derive a machine state from the current state
   *   - E.g., gas metering is preserved but pc is reset
   * - Derive an execution environment from the caller/parent
   *   - Alter both address and storageAddress
   *
   * @param address - The contract instance to initialize a context for
   * @param calldata - Data/arguments for nested call
   * @returns new AvmContext instance
   */
  public createNestedContractStaticCallContext(address: AztecAddress, calldata: Fr[]): AvmContext {
    const newExecutionEnvironment = this.environment.deriveEnvironmentForNestedStaticCall(address, calldata);
    const forkedWorldState = this.persistableState.fork();
    const machineState = AvmMachineState.fromState(this.machineState);
    return new AvmContext(forkedWorldState, newExecutionEnvironment, machineState);
  }
}
