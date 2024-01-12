// import { AvmContext } from "../avm_context.js";
import { Fr } from '@aztec/foundation/fields';

import { AvmContext } from '../avm_context.js';
import { AvmStateManager } from '../avm_state_manager.js';
import { Instruction } from '../opcodes/index.js';

/**
 * Avm Interpreter
 *
 * Executes an Avm context
 */
export class AvmInterpreter {
  private instructions: Instruction[] = [];
  private context: AvmContext;
  private stateManager: AvmStateManager;

  constructor(context: AvmContext, stateManager: AvmStateManager, bytecode: Instruction[]) {
    this.context = context;
    this.stateManager = stateManager;
    this.instructions = bytecode;
  }

  /**
   * Run the avm
   * @returns bool - successful execution will return true
   *               - reverted execution will return false
   *               - any other panic will throw
   */
  run(): boolean {
    try {
      for (const instruction of this.instructions) {
        instruction.execute(this.context, this.stateManager);
      }

      return true;
    } catch (e) {
      // TODO: This should only accept AVM defined errors, anything else SHOULD be thrown upstream
      return false;
    }
  }

  /**
   * Get the return data from avm execution
   * TODO: this should fail if the code has not been executed
   *  - maybe move the return in run into a variable and track it
   */
  returnData(): Fr[] {
    return this.context.getReturnData();
  }
}
