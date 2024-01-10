import { AvmContext } from "../avm_context.js";
import { AvmStateManager } from "../avm_state_manager.js";

/**
 * Opcode base class
 */
export abstract class Opcode {

    abstract execute(context: AvmContext, stateManager: AvmStateManager): void;
}