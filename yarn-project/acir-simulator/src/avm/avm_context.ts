import { AztecAddress } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';

import { AvmExecutionEnvironment } from './avm_execution_environment.js';
import { AvmMachineState } from './avm_machine_state.js';
import { AvmWorldStateJournal } from './journal/journal.js';

/**
 * Avm Context manages the state and execution of the AVM
 */
export class AvmContext {
  /** Contains constant variables provided by the kernel */
  public environment: AvmExecutionEnvironment;
  /** VM state that is modified on an instruction-by-instruction basis */
  public machineState: AvmMachineState;
  /** Manages mutable state during execution - (caching, fetching) */
  public worldState: AvmWorldStateJournal;

  constructor(environment: AvmExecutionEnvironment, machineState: AvmMachineState, worldState: AvmWorldStateJournal) {
    this.environment = environment;
    this.machineState = machineState;
    this.worldState = worldState;
  }

  /**
   * Prepare a new AVM context that will be ready for an external/nested call
   * - Fork the world state journal
   * - Derive an execution environment from the caller/parent
   *    - Alter both address and storageAddress
   *
   * @param address - The contract instance to initialize a context for
   * @param calldata - Data/arguments for nested call
   * @param initialMachineState - The initial machine state (derived from call instruction args)
   * @returns new AvmContext instance
   */
  public createNestedContractCallContext(address: AztecAddress, calldata: Fr[]): AvmContext {
    const newExecutionEnvironment = this.environment.deriveEnvironmentForNestedCall(address, calldata);
    const forkedState = this.worldState.fork();
    const machineState = AvmMachineState.fromState(this.machineState);
    return new AvmContext(newExecutionEnvironment, machineState, forkedState);
  }

  /**
   * Prepare a new AVM context that will be ready for an external/nested static call
   * - Fork the world state journal
   * - Derive an execution environment from the caller/parent
   *    - Alter both address and storageAddress
   *
   * @param address - The contract instance to initialize a context for
   * @param calldata - Data/arguments for nested call
   * @param initialMachineState - The initial machine state (derived from call instruction args)
   * @returns new AvmContext instance
   */
  public createNestedContractStaticCallContext(address: AztecAddress, calldata: Fr[]): AvmContext {
    const newExecutionEnvironment = this.environment.deriveEnvironmentForNestedStaticCall(address, calldata);
    const forkedState = this.worldState.fork();
    const machineState = AvmMachineState.fromState(this.machineState);
    return new AvmContext(newExecutionEnvironment, machineState, forkedState);
  }
}
