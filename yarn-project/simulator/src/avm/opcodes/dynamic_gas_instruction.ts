import type { AvmContext } from '../avm_context.js';
import { Gas, getBaseGasCost, getMemoryGasCost, sumGas } from '../avm_gas.js';
import { MemoryOperations } from '../avm_memory_types.js';
import { Instruction } from './instruction.js';

/**
 * Base class for AVM instructions with a variable gas cost that depends on data read during execution.
 * Orchestrates execution by running the following operations during `execute`:
 * - Invokes `loadInputs` to load from memory the inpiuts needed for execution.
 * - Requests the expected number of `memoryOperations` to compute the `memoryGasCost`.
 * - Computes `gasCost` based on the loaded inputs, using the sum of `baseGasCost` and `memoryGasCost`.
 * - Consumes gas based on the computed gas cost, throwing an exceptional halt if not enough.
 * - Executes actual logic from `internalExecute`.
 * - Asserts the expected memory operations against the actual memory operations.
 */
export abstract class DynamicGasInstruction<TInputs> extends Instruction {
  /**
   * Consumes gas and executes the instruction.
   * This is the main entry point for the instruction.
   * @param context - The AvmContext in which the instruction executes.
   */
  public async execute(context: AvmContext): Promise<void> {
    context.machineState.memory.clearStats();
    const inputs = this.loadInputs(context);
    const gasCost = this.gasCost(inputs);
    context.machineState.consumeGas(gasCost);

    await this.internalExecute(context, inputs);

    this.assertMemoryOperations(context, inputs);
  }

  /** Loads state for execution and gas metering from memory. */
  protected abstract loadInputs(context: AvmContext): TInputs;

  /** Computes gas cost based on loaded state. */
  protected gasCost(inputs: TInputs): Gas {
    return sumGas(this.baseGasCost(inputs), this.memoryGasCost(inputs));
  }

  /** Returns the base gas cost for this operation as read from the GasCosts table. */
  protected baseGasCost(_inputs: TInputs): Gas {
    return getBaseGasCost(this.opcode);
  }

  /** Returns the memory reads and writes gas cost for this operation as defined by expectedMemoryOperations. */
  protected memoryGasCost(inputs: TInputs): Gas {
    return getMemoryGasCost({ indirectFlags: this.getIndirectFlags(), ...this.memoryOperations(inputs) });
  }

  /**
   * Returns the expected read and write operations for this instruction.
   * Subclasses must override if they access memory.
   * Used for computing gas cost and validating correctness against the MeteredTaggedMemory.
   */
  protected memoryOperations(_inputs: TInputs): Partial<MemoryOperations> {
    return { reads: 0, writes: 0 };
  }

  /**
   * Execute the instruction.
   * Instruction sub-classes must implement this.
   * As an AvmContext executes its contract code, it calls this function for
   * each instruction until the machine state signals "halted".
   * @param inputs - The state loaded from memory and operands.
   * @param context - The AvmContext in which the instruction executes.
   */
  protected abstract internalExecute(context: AvmContext, inputs: TInputs): Promise<void>;

  /**
   * Returns the indirect addressing flags for this instruction if exist, zero otherwise.
   * Used for computing memory costs.
   */
  private getIndirectFlags() {
    return 'indirect' in this ? (this.indirect as number) : 0;
  }

  /** Verifies the memory operations executed match the ones expected from `memoryOperations`. */
  protected assertMemoryOperations(context: AvmContext, inputs: TInputs) {
    const expected = { reads: 0, writes: 0, indirectFlags: this.getIndirectFlags(), ...this.memoryOperations(inputs) };
    context.machineState.memory.assertStats(expected, this.type);
  }
}
