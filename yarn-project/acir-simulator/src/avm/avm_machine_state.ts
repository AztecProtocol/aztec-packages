//import { Fr } from '@aztec/foundation/fields';
//import { AvmExecutionEnvironment } from './avm_execution_environment.js';
import { Fr } from '@aztec/circuits.js';

import { TaggedMemory } from './avm_memory_types.js';
import { AvmContractCallResults } from './avm_message_call_result.js';

export type InitialAvmMachineState = {
  l1GasLeft: number;
  l2GasLeft: number;
  daGasLeft: number;
};

/**
 * Store's data for an Avm execution frame
 */
export class AvmMachineState {
  ///**
  // * Execution environment contains hard coded information that is received from the kernel
  // * Items like, the block header and global variables fall within this category
  // */
  //public readonly executionEnvironment: AvmExecutionEnvironment;

  public l1GasLeft: number;
  public l2GasLeft: number;
  public daGasLeft: number;

  public pc: number = 0;

  /**
   * When an internal_call is invoked, the internal call stack is added to with the current pc + 1
   * When internal_return is invoked, the latest value is popped from the internal call stack and set to the pc.
   */
  public internalCallStack: number[] = [];

  public readonly memory: TaggedMemory = new TaggedMemory();

  /**
   * If an instruction triggers a halt, then it ends execution of the VM
   */
  public halted: boolean = false;
  /**
   * Signifies if the execution has reverted ( due to a revert instruction )
   */
  private reverted: boolean = false;

  /**
   * Output data must NOT be modified once it is set
   */
  private output: Fr[] = [];

  /**
   * Create a new avm context
   * @param initialMachineState - The initial machine state passed to the avm
   */
  constructor(initialMachineState: InitialAvmMachineState) {
    this.l1GasLeft = initialMachineState.l1GasLeft;
    this.l2GasLeft = initialMachineState.l2GasLeft;
    this.daGasLeft = initialMachineState.daGasLeft;
  }

  public incrementPc() {
    this.pc++;
  }

  /**
   * Halt as successful
   * Output data must NOT be modified once it is set
   * @param output
   */
  public return(output: Fr[]) {
    this.halted = true;
    this.output = output;
  }

  /**
   * Halt as reverted
   * Output data must NOT be modified once it is set
   * @param output
   */
  public revert(output: Fr[]) {
    this.halted = true;
    this.reverted = true;
    this.output = output;
  }

  public getResults(): AvmContractCallResults {
    return new AvmContractCallResults(this.reverted, this.output);
  }
}
