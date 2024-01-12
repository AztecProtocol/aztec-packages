import { AvmContext } from '../avm_context.js';
import { AvmStateManager } from '../avm_state_manager.js';

/**
 * Opcode base class
 */
export abstract class Instruction {
  abstract execute(context: AvmContext, stateManager: AvmStateManager): void;
}
