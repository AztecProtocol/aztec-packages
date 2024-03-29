import type { AvmContext } from '../avm_context.js';
import { DynamicGasCost, Gas, GasCosts } from '../avm_gas.js';
import { Instruction } from './instruction.js';

/**
 * Base class for AVM instructions with a fixed gas cost or computed directly from its operands without requiring memory access.
 * Implements execution by consuming gas and calling the abstract internal execute function.
 */
export abstract class FixedGasInstruction extends Instruction {
  /**
   * Consumes gas and executes the instruction.
   * This is the main entry point for the instruction.
   * @param context - The AvmContext in which the instruction executes.
   */
  public execute(context: AvmContext): Promise<void> {
    context.machineState.consumeGas(this.gasCost());
    return this.internalExecute(context);
  }

  /**
   * Loads default gas cost for the instruction from the GasCosts table.
   * Instruction sub-classes can override this if their gas cost is not fixed.
   */
  protected gasCost(): Gas {
    const gasCost = GasCosts[this.opcode];
    if (gasCost === DynamicGasCost) {
      throw new Error(`Instruction ${this.type} must define its own gas cost`);
    }
    return gasCost;
  }

  /**
   * Execute the instruction.
   * Instruction sub-classes must implement this.
   * As an AvmContext executes its contract code, it calls this function for
   * each instruction until the machine state signals "halted".
   * @param context - The AvmContext in which the instruction executes.
   */
  protected abstract internalExecute(context: AvmContext): Promise<void>;
}
