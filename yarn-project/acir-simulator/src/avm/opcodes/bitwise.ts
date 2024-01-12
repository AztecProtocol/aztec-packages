import { Fr } from '@aztec/foundation/fields';

import { AvmContext } from '../avm_context.js';
import { AvmStateManager } from '../avm_state_manager.js';
import { Instruction } from './instruction.js';


/** - */
export class And implements Instruction {
  static type: string = 'AND';
  static numberOfOperands = 3;

  constructor(private aOffset: number, private bOffset: number, private destOffset: number) {}

  execute(context: AvmContext, _stateManager: AvmStateManager): void {
    const a: Fr = context.readMemory(this.aOffset);
    const b: Fr = context.readMemory(this.bOffset);

    const dest = new Fr(a.toBigInt() & b.toBigInt());
    context.writeMemory(this.destOffset, dest);
  }
}

/** - */
export class Or implements Instruction {
  static type: string = 'OR';
  static numberOfOperands = 3;

  constructor(private aOffset: number, private bOffset: number, private destOffset: number) {}

  execute(context: AvmContext, _stateManager: AvmStateManager): void {
    const a: Fr = context.readMemory(this.aOffset);
    const b: Fr = context.readMemory(this.bOffset);

    const dest = new Fr(a.toBigInt() | b.toBigInt());
    context.writeMemory(this.destOffset, dest);
  }
}

/** - */
export class Xor implements Instruction {
  static type: string = 'XOR';
  static numberOfOperands = 3;

  constructor(private aOffset: number, private bOffset: number, private destOffset: number) {}

  execute(context: AvmContext, _stateManager: AvmStateManager): void {
    const a: Fr = context.readMemory(this.aOffset);
    const b: Fr = context.readMemory(this.bOffset);

    const dest = new Fr(a.toBigInt() ^ b.toBigInt());
    context.writeMemory(this.destOffset, dest);
  }
}

/** - */
export class Not implements Instruction {
  static type: string = 'NOT';
  static numberOfOperands = 2;

  constructor(private aOffset: number, private bOffset: number, private destOffset: number) {}

  execute(context: AvmContext, _stateManager: AvmStateManager): void {
    const a: Fr = context.readMemory(this.aOffset);

    const dest = new Fr(~a.toBigInt());
    context.writeMemory(this.destOffset, dest);
  }
}


/** -*/
export class Shl implements Instruction {
  static type: string = 'SHL';
  static numberOfOperands = 3;

  constructor(private aOffset: number, private bOffset: number, private destOffset: number) {}

  execute(context: AvmContext, _stateManager: AvmStateManager): void {
    const a: Fr = context.readMemory(this.aOffset);
    const b: Fr = context.readMemory(this.bOffset);

    const dest = new Fr(a.toBigInt() << b.toBigInt());
    context.writeMemory(this.destOffset, dest);
  }
}

/** -*/
export class Shr implements Instruction {
  static type: string = 'SHR';
  static numberOfOperands = 3;

  constructor(private aOffset: number, private bOffset: number, private destOffset: number) {}

  execute(context: AvmContext, _stateManager: AvmStateManager): void {
    const a: Fr = context.readMemory(this.aOffset);
    const b: Fr = context.readMemory(this.bOffset);

    const dest = new Fr(a.toBigInt() >> b.toBigInt());
    context.writeMemory(this.destOffset, dest);
  }
}