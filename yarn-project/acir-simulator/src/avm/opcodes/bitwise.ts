import { Fr } from "@aztec/foundation/fields";
import { AvmContext } from "../avm_context.js";
import { Opcode } from "./opcode.js";
import { AvmStateManager } from "../avm_state_manager.js";

export class And implements Opcode {
    static type: string = "AND";
    static numberOfOperands = 3;
    
    constructor(private aOffset: number, private bOffset: number, private destOffset: number) {}

    execute(context: AvmContext, _stateManager: AvmStateManager): void {
        const a: Fr = context.readMemory(this.aOffset);
        const b: Fr = context.readMemory(this.bOffset);
        
        // TODO: floor div? - this will not perform field division
        const dest = new Fr(a.toBigInt() & b.toBigInt());
        context.writeMemory(this.destOffset, dest);
    }
}

export class Or implements Opcode {
    static type: string = "OR";
    static numberOfOperands = 3;
    
    constructor(private aOffset: number, private bOffset: number, private destOffset: number) {}

    execute(context: AvmContext, _stateManager: AvmStateManager): void {
        const a: Fr = context.readMemory(this.aOffset);
        const b: Fr = context.readMemory(this.bOffset);
        
        // TODO: floor div? - this will not perform field division
        const dest = new Fr(a.toBigInt() | b.toBigInt());
        context.writeMemory(this.destOffset, dest);
    }
}

export class Xor implements Opcode {
    static type: string = "XOR";
    static numberOfOperands = 3;
    
    constructor(private aOffset: number, private bOffset: number, private destOffset: number) {}

    execute(context: AvmContext, _stateManager: AvmStateManager): void {
        const a: Fr = context.readMemory(this.aOffset);
        const b: Fr = context.readMemory(this.bOffset);
        
        // TODO: floor div? - this will not perform field division
        const dest = new Fr(a.toBigInt() ^ b.toBigInt());
        context.writeMemory(this.destOffset, dest);
    }
}

export class Not implements Opcode {
    static type: string = "NOT";
    static numberOfOperands = 2;
    
    constructor(private aOffset: number, private bOffset: number, private destOffset: number) {}

    execute(context: AvmContext, _stateManager: AvmStateManager): void {
        const a: Fr = context.readMemory(this.aOffset);
        
        // TODO: floor div? - this will not perform field division
        const dest = new Fr(~a.toBigInt());
        context.writeMemory(this.destOffset, dest);
    }
}
