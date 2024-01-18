// import { AvmContext } from "../avm_machineState.js";
import { Fr } from '@aztec/foundation/fields';

import { AvmMachineState } from '../avm_machine_state.js';
import { AvmMessageCallResult } from '../avm_message_call_result.js';
import { AvmStateManager } from '../avm_state_manager.js';
import { Instruction } from '../opcodes/index.js';

/**
 * Avm Interpreter
 *
 * Executes an Avm context
 */
export class AvmInterpreter {
  private instructions: Instruction[] = [];
  private machineState: AvmMachineState;
  private stateManager: AvmStateManager;

  constructor(machineState: AvmMachineState, stateManager: AvmStateManager, bytecode: Instruction[]) {
    this.machineState = machineState;
    this.stateManager = stateManager;
    this.instructions = bytecode;
  }

  /**
   * Run the avm
   * @returns bool - successful execution will return true
   *               - reverted execution will return false
   *               - any other panic will throw
   */
  run(): AvmMessageCallResult {
    try {
      while (!this.machineState.halted && this.machineState.pc < this.instructions.length) {
        const instruction = this.instructions[this.machineState.pc];

        if (!instruction) {
          this.failedAssertInstruction();
        }

        instruction.execute(this.machineState, this.stateManager);

        console.log(this.machineState.pc);
        if (this.machineState.pc >= this.instructions.length) {
          console.log('hit');
          this.failedAssertProgramCounter();
        }
      }

      const returnData = this.machineState.getReturnData();
      return AvmMessageCallResult.success(returnData);
    } catch (e) {
      // TODO: This should only accept AVM defined errors, anything else SHOULD be thrown upstream
      const revertData = this.machineState.getReturnData();
      return AvmMessageCallResult.revert(revertData);
    }
  }

  /**
   * Get the return data from avm execution
   * TODO: this should fail if the code has not been executed
   *  - maybe move the return in run into a variable and track it
   */
  returnData(): Fr[] {
    return this.machineState.getReturnData();
  }

  private failedAssertProgramCounter(): void {
    throw new InvalidProgramCounterError(this.machineState.pc, this.instructions.length);
  }

  private failedAssertInstruction(): void {
    throw new InvalidInstructionError(this.machineState.pc);
  }
}

/**
 * Error is thrown when the program counter goes to an invalid location.
 * There is no instruction at the provided pc
 */
export class InvalidProgramCounterError extends Error {
  constructor(pc: number, max: number) {
    super(`Invalid program counter ${pc}, max is ${max}`);
  }
}

/**
 * This assertion should never be hit - there should always be a valid instruction
 */
export class InvalidInstructionError extends Error {
  constructor(pc: number) {
    super(`Invalid instruction at ${pc}`);
  }
}
