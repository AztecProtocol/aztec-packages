
import { Fr } from "@aztec/foundation/fields";
import { AvmContext } from "../avm_context.js";
import { Opcode } from "./opcode.js";
import { AvmStateManager } from "../avm_state_manager.js";

export class Set implements Opcode {
    static type: string = "SET";
    static numberOfOperands = 2;
    
    constructor(private constt: bigint, private destOffset: number) {}

    execute(context: AvmContext, _stateManager: AvmStateManager): void {
        const dest = new Fr(this.constt);
        context.writeMemory(this.destOffset, dest);
    }
}

// TODO: tags are not implemented yet - this will behave as a mov
export class Cast implements Opcode {
    static type: string = "CAST";
    static numberOfOperands = 2;
    
    constructor(private aOffset: number, private destOffset: number) {}

    execute(context: AvmContext, _stateManager: AvmStateManager): void {
        const a = context.readMemory(this.aOffset);
        
        context.writeMemory(this.destOffset, a);
    }
}

export class Mov implements Opcode {
    static type: string = "MOV";
    static numberOfOperands = 2;
    
    constructor(private aOffset: number, private destOffset: number) {}

    execute(context: AvmContext, _stateManager: AvmStateManager): void {
        const a = context.readMemory(this.aOffset);
        
        context.writeMemory(this.destOffset, a);
    }
}

export class CallDataCopy implements Opcode {
    static type: string = "CALLDATACOPY";
    static numberOfOperands = 3;
    
    constructor(private cdOffset: number, private copySize: number, private destOffset: number) {}

    execute(context: AvmContext, _stateManager: AvmStateManager): void {
        const calldata = context.calldata.slice(this.cdOffset, this.cdOffset + this.copySize);
        context.writeMemoryChunk(this.destOffset, calldata);
    }
}