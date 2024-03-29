import type { AvmContext } from '../avm_context.js';
import { MemoryValue, Uint8 } from '../avm_memory_types.js';
import { Opcode } from '../serialization/instruction_serialization.js';
import { ThreeOperandFixedGasInstruction } from './instruction_impl.js';

abstract class ComparatorInstruction extends ThreeOperandFixedGasInstruction {
  protected async internalExecute(context: AvmContext): Promise<void> {
    context.machineState.memory.checkTags(this.inTag, this.aOffset, this.bOffset);

    const a = context.machineState.memory.get(this.aOffset);
    const b = context.machineState.memory.get(this.bOffset);

    const dest = new Uint8(this.compare(a, b) ? 1 : 0);
    context.machineState.memory.set(this.dstOffset, dest);

    context.machineState.incrementPc();
  }

  protected memoryOperations() {
    return { reads: 2, writes: 1 };
  }

  protected abstract compare(a: MemoryValue, b: MemoryValue): boolean;
}

export class Eq extends ComparatorInstruction {
  static readonly type: string = 'EQ';
  static readonly opcode = Opcode.EQ;

  protected compare(a: MemoryValue, b: MemoryValue): boolean {
    return a.equals(b);
  }
}

export class Lt extends ComparatorInstruction {
  static readonly type: string = 'LT';
  static readonly opcode = Opcode.LT;

  protected compare(a: MemoryValue, b: MemoryValue): boolean {
    return a.lt(b);
  }
}

export class Lte extends ComparatorInstruction {
  static readonly type: string = 'LTE';
  static readonly opcode = Opcode.LTE;

  protected compare(a: MemoryValue, b: MemoryValue): boolean {
    return a.lt(b) || a.equals(b);
  }
}
