import type { AvmContext } from '../avm_context.js';
import { IntegralValue } from '../avm_memory_types.js';
import { Opcode } from '../serialization/instruction_serialization.js';
import { ThreeOperandFixedGasInstruction, TwoOperandFixedGasInstruction } from './instruction_impl.js';

export class And extends ThreeOperandFixedGasInstruction {
  static readonly type: string = 'AND';
  static readonly opcode = Opcode.AND;

  constructor(indirect: number, inTag: number, aOffset: number, bOffset: number, dstOffset: number) {
    super(indirect, inTag, aOffset, bOffset, dstOffset);
  }

  protected async internalExecute(context: AvmContext): Promise<void> {
    context.machineState.memory.checkTags(this.inTag, this.aOffset, this.bOffset);

    const a = context.machineState.memory.getAs<IntegralValue>(this.aOffset);
    const b = context.machineState.memory.getAs<IntegralValue>(this.bOffset);

    const res = a.and(b);
    context.machineState.memory.set(this.dstOffset, res);

    context.machineState.incrementPc();
  }
}

export class Or extends ThreeOperandFixedGasInstruction {
  static readonly type: string = 'OR';
  static readonly opcode = Opcode.OR;

  constructor(indirect: number, inTag: number, aOffset: number, bOffset: number, dstOffset: number) {
    super(indirect, inTag, aOffset, bOffset, dstOffset);
  }

  protected async internalExecute(context: AvmContext): Promise<void> {
    context.machineState.memory.checkTags(this.inTag, this.aOffset, this.bOffset);

    const a = context.machineState.memory.getAs<IntegralValue>(this.aOffset);
    const b = context.machineState.memory.getAs<IntegralValue>(this.bOffset);

    const res = a.or(b);
    context.machineState.memory.set(this.dstOffset, res);

    context.machineState.incrementPc();
  }
}

export class Xor extends ThreeOperandFixedGasInstruction {
  static readonly type: string = 'XOR';
  static readonly opcode = Opcode.XOR;

  constructor(indirect: number, inTag: number, aOffset: number, bOffset: number, dstOffset: number) {
    super(indirect, inTag, aOffset, bOffset, dstOffset);
  }

  protected async internalExecute(context: AvmContext): Promise<void> {
    context.machineState.memory.checkTags(this.inTag, this.aOffset, this.bOffset);

    const a = context.machineState.memory.getAs<IntegralValue>(this.aOffset);
    const b = context.machineState.memory.getAs<IntegralValue>(this.bOffset);

    const res = a.xor(b);
    context.machineState.memory.set(this.dstOffset, res);

    context.machineState.incrementPc();
  }
}

export class Not extends TwoOperandFixedGasInstruction {
  static readonly type: string = 'NOT';
  static readonly opcode = Opcode.NOT;

  constructor(indirect: number, inTag: number, aOffset: number, dstOffset: number) {
    super(indirect, inTag, aOffset, dstOffset);
  }

  protected async internalExecute(context: AvmContext): Promise<void> {
    context.machineState.memory.checkTags(this.inTag, this.aOffset);

    const a = context.machineState.memory.getAs<IntegralValue>(this.aOffset);

    const res = a.not();
    context.machineState.memory.set(this.dstOffset, res);

    context.machineState.incrementPc();
  }
}

export class Shl extends ThreeOperandFixedGasInstruction {
  static readonly type: string = 'SHL';
  static readonly opcode = Opcode.SHL;

  constructor(indirect: number, inTag: number, aOffset: number, bOffset: number, dstOffset: number) {
    super(indirect, inTag, aOffset, bOffset, dstOffset);
  }

  protected async internalExecute(context: AvmContext): Promise<void> {
    context.machineState.memory.checkTags(this.inTag, this.aOffset, this.bOffset);

    const a = context.machineState.memory.getAs<IntegralValue>(this.aOffset);
    const b = context.machineState.memory.getAs<IntegralValue>(this.bOffset);

    const res = a.shl(b);
    context.machineState.memory.set(this.dstOffset, res);

    context.machineState.incrementPc();
  }
}

export class Shr extends ThreeOperandFixedGasInstruction {
  static readonly type: string = 'SHR';
  static readonly opcode = Opcode.SHR;

  constructor(indirect: number, inTag: number, aOffset: number, bOffset: number, dstOffset: number) {
    super(indirect, inTag, aOffset, bOffset, dstOffset);
  }

  protected async internalExecute(context: AvmContext): Promise<void> {
    context.machineState.memory.checkTags(this.inTag, this.aOffset, this.bOffset);

    const a = context.machineState.memory.getAs<IntegralValue>(this.aOffset);
    const b = context.machineState.memory.getAs<IntegralValue>(this.bOffset);

    const res = a.shr(b);
    context.machineState.memory.set(this.dstOffset, res);

    context.machineState.incrementPc();
  }
}
