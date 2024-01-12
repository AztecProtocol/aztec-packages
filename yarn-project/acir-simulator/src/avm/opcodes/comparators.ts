import { Fr } from "@aztec/foundation/fields";
import { AvmContext } from "../avm_context.js";
import { AvmStateManager } from "../avm_state_manager.js";
import { Instruction } from "./instruction.js";

/** -*/
export class Eq implements Instruction {
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
export class Lt implements Instruction {
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
export class Lte implements Instruction {
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
