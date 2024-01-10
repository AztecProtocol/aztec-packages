import { AvmContext } from "../avm_context.js";

/**
 * Opcode base class
 */
export abstract class Opcode {

    abstract execute(context: AvmContext): void;
}