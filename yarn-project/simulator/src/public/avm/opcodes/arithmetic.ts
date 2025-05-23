import type { AvmContext } from '../avm_context.js';
import {
  type Field,
  type MemoryValue,
  TaggedMemory,
  type TaggedMemoryInterface,
  TypeTag,
} from '../avm_memory_types.js';
import { ArithmeticError } from '../errors.js';
import { Opcode } from '../serialization/instruction_serialization.js';
import { Addressing } from './addressing_mode.js';
import { ThreeOperandInstruction } from './instruction_impl.js';

export abstract class ThreeOperandArithmeticInstruction extends ThreeOperandInstruction {
  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory;
    const addressing = Addressing.fromWire(this.indirect);

    context.machineState.consumeGas(this.gasCost());

    const operands = [this.aOffset, this.bOffset, this.dstOffset];
    const [aOffset, bOffset, dstOffset] = addressing.resolve(operands, memory);
    this.checkTags(memory, aOffset, bOffset);

    const a = memory.get(aOffset);
    const b = memory.get(bOffset);

    const dest = this.compute(a, b);
    memory.set(dstOffset, dest);
  }

  protected abstract compute(a: MemoryValue, b: MemoryValue): MemoryValue;
  protected checkTags(memory: TaggedMemoryInterface, aOffset: number, bOffset: number) {
    memory.checkTagsAreSame(aOffset, bOffset);
  }
}

export class Add extends ThreeOperandArithmeticInstruction {
  static readonly type: string = 'ADD';
  static readonly opcode = Opcode.ADD_8; // FIXME: needed for gas.

  protected compute(a: MemoryValue, b: MemoryValue): MemoryValue {
    return a.add(b);
  }
}

export class Sub extends ThreeOperandArithmeticInstruction {
  static readonly type: string = 'SUB';
  static readonly opcode = Opcode.SUB_8; // FIXME: needed for gas.

  protected compute(a: MemoryValue, b: MemoryValue): MemoryValue {
    return a.sub(b);
  }
}

export class Mul extends ThreeOperandArithmeticInstruction {
  static type: string = 'MUL';
  static readonly opcode = Opcode.MUL_8; // FIXME: needed for gas.

  protected compute(a: MemoryValue, b: MemoryValue): MemoryValue {
    return a.mul(b);
  }
}

export class Div extends ThreeOperandArithmeticInstruction {
  static type: string = 'DIV';
  static readonly opcode = Opcode.DIV_8; // FIXME: needed for gas.

  protected compute(a: MemoryValue, b: MemoryValue): MemoryValue {
    if (b.toBigInt() === 0n) {
      throw new ArithmeticError('Division by zero');
    }

    return a.div(b);
  }

  protected override checkTags(memory: TaggedMemoryInterface, aOffset: number, bOffset: number) {
    memory.checkTagsAreSame(aOffset, bOffset);
    TaggedMemory.checkIsIntegralTag(memory.getTag(aOffset)); // Follows that bOffset tag is also of integral type
  }
}

export class FieldDiv extends ThreeOperandArithmeticInstruction {
  static type: string = 'FDIV';
  static readonly opcode = Opcode.FDIV_8; // FIXME: needed for gas.

  protected compute(a: Field, b: Field): Field {
    // return (a as Field).fdiv(b as Field);
    return a.fdiv(b);
  }

  protected override checkTags(memory: TaggedMemoryInterface, aOffset: number, bOffset: number) {
    memory.checkTagsAreSame(aOffset, bOffset);
    memory.checkTag(TypeTag.FIELD, aOffset); // Follows that bOffset has also tag of type Field
  }
}
