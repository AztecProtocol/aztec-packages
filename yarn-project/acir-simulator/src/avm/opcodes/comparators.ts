import { AvmMachineState } from '../avm_machine_state.js';
import { AvmJournal } from '../journal/index.js';
import { BufferCursor } from '../serialization/buffer_cursor.js';
import { Opcode } from '../serialization/instruction_serialization.js';
import { Instruction } from './instruction.js';
import { ThreeOperandInstruction } from './instruction_impl.js';

export class Eq extends ThreeOperandInstruction {
  static readonly type: string = 'EQ';
  static readonly opcode = Opcode.EQ;

  constructor(indirect: number, inTag: number, aOffset: number, bOffset: number, dstOffset: number) {
    super(indirect, inTag, aOffset, bOffset, dstOffset);
  }

  protected get opcode() {
    return Eq.opcode;
  }

  public static deserialize(buf: BufferCursor | Buffer): Eq {
    const args = ThreeOperandInstruction.deserializeBase(buf);
    return new Eq(...args);
  }

  async execute(machineState: AvmMachineState, _journal: AvmJournal): Promise<void> {
    Instruction.checkTags(machineState, this.inTag, this.aOffset, this.bOffset);

    const a = machineState.memory.get(this.aOffset);
    const b = machineState.memory.get(this.bOffset);

    // Result will be of the same type as 'a'.
    const dest = a.build(a.equals(b) ? 1n : 0n);
    machineState.memory.set(this.dstOffset, dest);

    this.incrementPc(machineState);
  }
}

export class Lt extends ThreeOperandInstruction {
  static readonly type: string = 'LT';
  static readonly opcode = Opcode.LT;

  constructor(indirect: number, inTag: number, aOffset: number, bOffset: number, dstOffset: number) {
    super(indirect, inTag, aOffset, bOffset, dstOffset);
  }

  protected get opcode() {
    return Lt.opcode;
  }

  public static deserialize(buf: BufferCursor | Buffer): Lt {
    const args = ThreeOperandInstruction.deserializeBase(buf);
    return new Lt(...args);
  }


  async execute(machineState: AvmMachineState, _journal: AvmJournal): Promise<void> {
    Instruction.checkTags(machineState, this.inTag, this.aOffset, this.bOffset);

    const a = machineState.memory.get(this.aOffset);
    const b = machineState.memory.get(this.bOffset);

    // Result will be of the same type as 'a'.
    const dest = a.build(a.lt(b) ? 1n : 0n);
    machineState.memory.set(this.dstOffset, dest);

    this.incrementPc(machineState);
  }
}

export class Lte extends ThreeOperandInstruction {
  static readonly type: string = 'LTE';
  static readonly opcode = Opcode.LTE;

  constructor(indirect: number, inTag: number, aOffset: number, bOffset: number, dstOffset: number) {
    super(indirect, inTag, aOffset, bOffset, dstOffset);
  }

  protected get opcode() {
    return Lte.opcode;
  }

  public static deserialize(buf: BufferCursor | Buffer): Lte {
    const args = ThreeOperandInstruction.deserializeBase(buf);
    return new Lte(...args);
  }

  async execute(machineState: AvmMachineState, _journal: AvmJournal): Promise<void> {
    Instruction.checkTags(machineState, this.inTag, this.aOffset, this.bOffset);

    const a = machineState.memory.get(this.aOffset);
    const b = machineState.memory.get(this.bOffset);

    // Result will be of the same type as 'a'.
    const dest = a.build(a.equals(b) || a.lt(b) ? 1n : 0n);
    machineState.memory.set(this.dstOffset, dest);

    this.incrementPc(machineState);
  }
}
