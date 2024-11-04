import type { AvmContext } from '../avm_context.js';
import { type MemoryValue, Uint1 } from '../avm_memory_types.js';
import { Opcode } from '../serialization/instruction_serialization.js';
import { Addressing } from './addressing_mode.js';
import { ThreeOperandInstruction } from './instruction_impl.js';

abstract class ComparatorInstruction extends ThreeOperandInstruction {
  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory.track(this.type);
    context.machineState.consumeGas(this.gasCost());

    const operands = [this.aOffset, this.bOffset, this.dstOffset];
    const addressing = Addressing.fromWire(this.indirect, operands.length);
    const [aOffset, bOffset, dstOffset] = addressing.resolve(operands, memory);
    memory.checkTagsAreSame(aOffset, bOffset);

    const a = memory.get(aOffset);
    const b = memory.get(bOffset);

    const dest = new Uint1(this.compare(a, b) ? 1 : 0);
    memory.set(dstOffset, dest);

    memory.assert({ reads: 2, writes: 1, addressing });
  }

  protected abstract compare(a: MemoryValue, b: MemoryValue): boolean;
}

export class Eq extends ComparatorInstruction {
  static readonly type: string = 'EQ';
  static readonly opcode = Opcode.EQ_8; // FIXME: needed for gas.

  protected compare(a: MemoryValue, b: MemoryValue): boolean {
    return a.equals(b);
  }
}

export class Lt extends ComparatorInstruction {
  static readonly type: string = 'LT';
  static readonly opcode = Opcode.LT_8; // FIXME: needed for gas.

  protected compare(a: MemoryValue, b: MemoryValue): boolean {
    return a.lt(b);
  }
}

export class Lte extends ComparatorInstruction {
  static readonly type: string = 'LTE';
  static readonly opcode = Opcode.LTE_8; // FIXME: needed for gas.

  protected compare(a: MemoryValue, b: MemoryValue): boolean {
    return a.lt(b) || a.equals(b);
  }
}
