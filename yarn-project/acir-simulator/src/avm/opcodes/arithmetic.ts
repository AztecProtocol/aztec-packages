import { Fr } from '@aztec/foundation/fields';

import { AvmContext } from '../avm_context.js';
import { AvmStateManager } from '../avm_state_manager.js';
import { Opcode } from './opcode.js';

export class Add implements Opcode {
  static type: string = 'ADD';
  static numberOfOperands = 3;

  constructor(private aOffset: number, private bOffset: number, private destOffset: number) {}

  execute(context: AvmContext, _stateManager: AvmStateManager): void {
    const a = context.readMemory(this.aOffset);
    const b = context.readMemory(this.bOffset);

    const dest = new Fr(a.toBigInt() + (b.toBigInt() % Fr.MODULUS));
    context.writeMemory(this.destOffset, dest);
  }
}

export class Sub implements Opcode {
  static type: string = 'SUB';
  static numberOfOperands = 3;

  constructor(private aOffset: number, private bOffset: number, private destOffset: number) {}

  execute(context: AvmContext, _stateManager: AvmStateManager): void {
    const a = context.readMemory(this.aOffset);
    const b = context.readMemory(this.bOffset);

    const dest = new Fr(a.toBigInt() - (b.toBigInt() % Fr.MODULUS));
    context.writeMemory(this.destOffset, dest);
  }
}

export class Mul implements Opcode {
  static type: string = 'MUL';
  static numberOfOperands = 3;

  constructor(private aOffset: number, private bOffset: number, private destOffset: number) {}

  execute(context: AvmContext, _stateManager: AvmStateManager): void {
    const a: Fr = context.readMemory(this.aOffset);
    const b: Fr = context.readMemory(this.bOffset);

    const dest = new Fr((a.toBigInt() * b.toBigInt()) % Fr.MODULUS);
    context.writeMemory(this.destOffset, dest);
  }
}

export class Div implements Opcode {
  static type: string = 'DIV';
  static numberOfOperands = 3;

  constructor(private aOffset: number, private bOffset: number, private destOffset: number) {}

  execute(context: AvmContext, _stateManager: AvmStateManager): void {
    const a: Fr = context.readMemory(this.aOffset);
    const b: Fr = context.readMemory(this.bOffset);

    // TODO: proper field division
    const dest = new Fr(a.toBigInt() / b.toBigInt());
    context.writeMemory(this.destOffset, dest);
  }
}
export class Eq implements Opcode {
  static type: string = 'EQ';
  static numberOfOperands = 3;

  constructor(private aOffset: number, private bOffset: number, private destOffset: number) {}

  execute(context: AvmContext, _stateManager: AvmStateManager): void {
    const a: Fr = context.readMemory(this.aOffset);
    const b: Fr = context.readMemory(this.bOffset);

    // TODO: floor div? - this will not perform field division
    const dest = new Fr(a.toBigInt() == b.toBigInt());
    context.writeMemory(this.destOffset, dest);
  }
}
export class Lt implements Opcode {
  static type: string = 'Lt';
  static numberOfOperands = 3;

  constructor(private aOffset: number, private bOffset: number, private destOffset: number) {}

  execute(context: AvmContext, _stateManager: AvmStateManager): void {
    const a: Fr = context.readMemory(this.aOffset);
    const b: Fr = context.readMemory(this.bOffset);

    // TODO: floor div? - this will not perform field division
    const dest = new Fr(a.toBigInt() < b.toBigInt());
    context.writeMemory(this.destOffset, dest);
  }
}

export class Lte implements Opcode {
  static type: string = 'LTE';
  static numberOfOperands = 3;

  constructor(private aOffset: number, private bOffset: number, private destOffset: number) {}

  execute(context: AvmContext, _stateManager: AvmStateManager): void {
    const a: Fr = context.readMemory(this.aOffset);
    const b: Fr = context.readMemory(this.bOffset);

    // TODO: floor div? - this will not perform field division
    const dest = new Fr(a.toBigInt() < b.toBigInt());
    context.writeMemory(this.destOffset, dest);
  }
}

export class Shl implements Opcode {
  static type: string = 'SHL';
  static numberOfOperands = 3;

  constructor(private aOffset: number, private bOffset: number, private destOffset: number) {}

  execute(context: AvmContext, _stateManager: AvmStateManager): void {
    const a: Fr = context.readMemory(this.aOffset);
    const b: Fr = context.readMemory(this.bOffset);

    // TODO: floor div? - this will not perform field division
    const dest = new Fr(a.toBigInt() << b.toBigInt());
    context.writeMemory(this.destOffset, dest);
  }
}

export class Shr implements Opcode {
  static type: string = 'SHR';
  static numberOfOperands = 3;

  constructor(private aOffset: number, private bOffset: number, private destOffset: number) {}

  execute(context: AvmContext, _stateManager: AvmStateManager): void {
    const a: Fr = context.readMemory(this.aOffset);
    const b: Fr = context.readMemory(this.bOffset);

    // TODO: floor div? - this will not perform field division
    const dest = new Fr(a.toBigInt() >> b.toBigInt());
    context.writeMemory(this.destOffset, dest);
  }
}
