import { AvmContext } from "../avm_context.js";
import { AvmStateManager } from "../avm_state_manager.js";
import { Opcode } from "./opcode.js";

export class Return implements Opcode {
    static type: string = "RETURN";
    static numberOfOperands = 2;
    
    constructor(private returnOffset: number, private copySize: number) {}

    execute(context: AvmContext, _stateManager: AvmStateManager): void {
        const returnData = context.readMemoryChunk(this.returnOffset, this.returnOffset + this.copySize);
        context.setReturnData(returnData);
    }
}