import type { AvmContext } from '../avm_context.js';
import { DynamicGasInstruction } from './dynamic_gas_instruction.js';

/**
 * Base class for AVM instructions with a fixed gas cost or computed directly from its operands.
 * Implements execution by consuming gas and calling the abstract internal execute function.
 */
export abstract class FixedGasInstruction extends DynamicGasInstruction<void> {
  protected loadInputs(_context: AvmContext): void {}
}
