import { Fr } from '@aztec/foundation/fields';

import { ExecutionEnvironment } from './avm_execution_environment.js';

/**
 * Store's data for an Avm execution frame
 */
export class AvmMachineState {
  /**
   * Execution environment contains hard coded information that is received from the kernel
   * Items like, the block header and global variables fall within this category
   */
  public readonly executionEnvironment: ExecutionEnvironment;

  /** - */
  public readonly calldata: Fr[];
  private returnData: Fr[];

  // TODO: implement tagged memory
  /** - */
  public memory: Fr[];

  /**
   * When an internal_call is invoked, the internal call stack is added to with the current pc + 1
   * When internal_return is invoked, the latest value is popped from the internal call stack and set to the pc.
   */
  public internalCallStack: number[];

  /** - */
  public pc: number;
  /** - */
  public callStack: number[];

  /**
   * If an instruction triggers a halt, then it ends execution of the VM
   */
  public halted: boolean;

  /**
   * Create a new avm context
   * @param calldata -
   * @param executionEnvironment - Machine context that is passed to the avm
   */
  constructor(calldata: Fr[], executionEnvironment: ExecutionEnvironment) {
    this.calldata = calldata;
    this.returnData = [];
    this.memory = [];
    this.internalCallStack = [];

    this.pc = 0;
    this.callStack = [];

    this.halted = false;

    this.executionEnvironment = executionEnvironment;
  }

  /**
   * Return data must NOT be modified once it is set
   * @param returnData -
   */
  public setReturnData(returnData: Fr[]) {
    this.returnData = returnData;
    Object.freeze(returnData);
  }

  /** - */
  public getReturnData(): Fr[] {
    return this.returnData;
  }

  /** -
   * @param offset -
   */
  public readMemory(offset: number): Fr {
    // TODO: check offset is within bounds
    return this.memory[offset] ?? Fr.ZERO;
  }

  /** -
   * @param offset -
   * @param size -
   */
  public readMemoryChunk(offset: number, size: number): Fr[] {
    // TODO: bounds -> initialise to 0
    return this.memory.slice(offset, offset + size);
  }

  /** -
   * @param offset -
   * @param value -
   */
  public writeMemory(offset: number, value: Fr): void {
    this.memory[offset] = value;
  }

  /** -
   * @param offset -
   * @param values -
   */
  public writeMemoryChunk(offset: number, values: Fr[]): void {
    this.memory.splice(offset, values.length, ...values);
  }
}
