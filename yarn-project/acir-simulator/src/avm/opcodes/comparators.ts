import { Fr } from "@aztec/foundation/fields";
import { AvmContext } from "../avm_context.js";
import { AvmStateManager } from "../avm_state_manager.js";
import { Opcode } from "./opcode.js";

/** -*/
export class Eq implements Opcode {
  static type: string = 'EQ';
  static numberOfOperands = 3;

  constructor(private aOffset: number, private bOffset: number, private destOffset: number) {}

  execute(context: AvmContext, _stateManager: AvmStateManager): void {
    const a: Fr = context.readMemory(this.aOffset);
    const b: Fr = context.readMemory(this.bOffset);

    const dest = new Fr(a.toBigInt() == b.toBigInt());
    context.writeMemory(this.destOffset, dest);
  }
}
/** -*/
export class Lt implements Opcode {
  static type: string = 'Lt';
  static numberOfOperands = 3;

  constructor(private aOffset: number, private bOffset: number, private destOffset: number) {}

  execute(context: AvmContext, _stateManager: AvmStateManager): void {
    const a: Fr = context.readMemory(this.aOffset);
    const b: Fr = context.readMemory(this.bOffset);

    const dest = new Fr(a.toBigInt() < b.toBigInt());
    context.writeMemory(this.destOffset, dest);
  }
}

/** -*/
export class Lte implements Opcode {
  static type: string = 'LTE';
  static numberOfOperands = 3;

  constructor(private aOffset: number, private bOffset: number, private destOffset: number) {}

  execute(context: AvmContext, _stateManager: AvmStateManager): void {
    const a: Fr = context.readMemory(this.aOffset);
    const b: Fr = context.readMemory(this.bOffset);

    const dest = new Fr(a.toBigInt() < b.toBigInt());
    context.writeMemory(this.destOffset, dest);
  }
}
