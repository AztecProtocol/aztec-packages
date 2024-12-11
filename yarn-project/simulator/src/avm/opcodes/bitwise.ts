import type { AvmContext } from '../avm_context.js';
import { type IntegralValue, TaggedMemory, type TaggedMemoryInterface, TypeTag } from '../avm_memory_types.js';
import { Opcode, OperandType } from '../serialization/instruction_serialization.js';
import { Addressing } from './addressing_mode.js';
import { Instruction } from './instruction.js';
import { ThreeOperandInstruction } from './instruction_impl.js';

abstract class ThreeOperandBitwiseInstruction extends ThreeOperandInstruction {
  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory.track(this.type);
    context.machineState.consumeGas(this.gasCost());

    const operands = [this.aOffset, this.bOffset, this.dstOffset];
    const addressing = Addressing.fromWire(this.indirect, operands.length);
    const [aOffset, bOffset, dstOffset] = addressing.resolve(operands, memory);
    this.checkTags(memory, aOffset, bOffset);

    const a = memory.getAs<IntegralValue>(aOffset);
    const b = memory.getAs<IntegralValue>(bOffset);

    const res = this.compute(a, b);
    memory.set(dstOffset, res);

    memory.assert({ reads: 2, writes: 1, addressing });
  }

  protected abstract compute(a: IntegralValue, b: IntegralValue): IntegralValue;
  protected checkTags(memory: TaggedMemoryInterface, aOffset: number, bOffset: number) {
    TaggedMemory.checkIsIntegralTag(memory.getTag(aOffset));
    memory.checkTagsAreSame(aOffset, bOffset);
  }
}

export class And extends ThreeOperandBitwiseInstruction {
  static readonly type: string = 'AND';
  static readonly opcode = Opcode.AND_8; // FIXME: needed for gas.

  protected override compute(a: IntegralValue, b: IntegralValue): IntegralValue {
    return a.and(b);
  }
}

export class Or extends ThreeOperandBitwiseInstruction {
  static readonly type: string = 'OR';
  static readonly opcode = Opcode.OR_8; // FIXME: needed for gas.

  protected override compute(a: IntegralValue, b: IntegralValue): IntegralValue {
    return a.or(b);
  }
}

export class Xor extends ThreeOperandBitwiseInstruction {
  static readonly type: string = 'XOR';
  static readonly opcode = Opcode.XOR_8; // FIXME: needed for gas.

  protected override compute(a: IntegralValue, b: IntegralValue): IntegralValue {
    return a.xor(b);
  }
}

export class Shl extends ThreeOperandBitwiseInstruction {
  static readonly type: string = 'SHL';
  static readonly opcode = Opcode.SHL_8; // FIXME: needed for gas.

  protected override compute(a: IntegralValue, b: IntegralValue): IntegralValue {
    return a.shl(b);
  }
  protected override checkTags(memory: TaggedMemoryInterface, aOffset: number, bOffset: number) {
    TaggedMemory.checkIsIntegralTag(memory.getTag(aOffset));
    memory.checkTag(TypeTag.UINT8, bOffset);
  }
}

export class Shr extends ThreeOperandBitwiseInstruction {
  static readonly type: string = 'SHR';
  static readonly opcode = Opcode.SHR_8; // FIXME: needed for gas.

  protected override compute(a: IntegralValue, b: IntegralValue): IntegralValue {
    return a.shr(b);
  }
  protected override checkTags(memory: TaggedMemoryInterface, aOffset: number, bOffset: number) {
    TaggedMemory.checkIsIntegralTag(memory.getTag(aOffset));
    memory.checkTag(TypeTag.UINT8, bOffset);
  }
}

export class Not extends Instruction {
  static readonly type: string = 'NOT';
  static readonly opcode = Opcode.NOT_8;

  static readonly wireFormat8 = [OperandType.UINT8, OperandType.UINT8, OperandType.UINT8, OperandType.UINT8];
  static readonly wireFormat16 = [OperandType.UINT8, OperandType.UINT8, OperandType.UINT16, OperandType.UINT16];

  constructor(private indirect: number, private srcOffset: number, private dstOffset: number) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory.track(this.type);
    context.machineState.consumeGas(this.gasCost());

    const operands = [this.srcOffset, this.dstOffset];
    const addressing = Addressing.fromWire(this.indirect, operands.length);
    const [srcOffset, dstOffset] = addressing.resolve(operands, memory);
    TaggedMemory.checkIsIntegralTag(memory.getTag(srcOffset));
    const value = memory.getAs<IntegralValue>(srcOffset);

    const res = value.not();
    memory.set(dstOffset, res);

    memory.assert({ reads: 1, writes: 1, addressing });
  }
}
