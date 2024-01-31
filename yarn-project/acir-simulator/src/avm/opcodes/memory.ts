import { AvmMachineState } from '../avm_machine_state.js';
import { Field, TaggedMemory, TypeTag } from '../avm_memory_types.js';
import { AvmJournal } from '../journal/index.js';
import { BufferCursor } from '../serialization/buffer_cursor.js';
import {
  Opcode,
  OperandPair,
  OperandType,
  deserialize,
  serialize,
} from '../serialization/instruction_serialization.js';
import { Instruction } from './instruction.js';
import { TwoOperandInstruction } from './instruction_impl.js';

export class Set extends Instruction {
  static readonly type: string = 'SET';
  static readonly opcode: Opcode = Opcode.SET;

  // Instruction wire format with opcode.
  private static readonly wireFormat: OperandPair[] = [
    [(_c: Set) => Set.opcode, OperandType.UINT8],
    [(c: Set) => c.indirect, OperandType.UINT8],
    [(c: Set) => c.inTag, OperandType.UINT8],
    [(c: Set) => c.value, OperandType.UINT128],
    [(c: Set) => c.dstOffset, OperandType.UINT32],
  ];

  constructor(private indirect: number, private inTag: number, private value: bigint, private dstOffset: number) {
    super();
  }

  public static deserialize(buf: BufferCursor | Buffer): Set {
    const res = deserialize(buf, Set.wireFormat);
    const args = res.slice(1) as ConstructorParameters<typeof Set>; // Remove opcode.
    return new Set(...args);
  }

  public serialize(): Buffer {
    return serialize(Set.wireFormat, this);
  }

  async execute(machineState: AvmMachineState, _journal: AvmJournal): Promise<void> {
    const res = TaggedMemory.integralFromTag(this.value, this.inTag);

    machineState.memory.set(this.dstOffset, res);

    this.incrementPc(machineState);
  }
}

export class CMov extends Instruction {
  static readonly type: string = 'CMOV';
  static readonly opcode: Opcode = Opcode.CMOV;

  // Instruction wire format with opcode.
  private static readonly wireFormat: OperandPair[] = [
    [(_c: CMov) => CMov.opcode, OperandType.UINT8],
    [(c: CMov) => c.indirect, OperandType.UINT8],
    [(c: CMov) => c.aOffset, OperandType.UINT32],
    [(c: CMov) => c.bOffset, OperandType.UINT32],
    [(c: CMov) => c.condOffset, OperandType.UINT32],
    [(c: CMov) => c.dstOffset, OperandType.UINT32],
  ];

  constructor(
    private indirect: number,
    private aOffset: number,
    private bOffset: number,
    private condOffset: number,
    private dstOffset: number,
  ) {
    super();
  }

  public static deserialize(buf: BufferCursor | Buffer): CMov {
    const res = deserialize(buf, CMov.wireFormat);
    const args = res.slice(1) as ConstructorParameters<typeof CMov>; // Remove opcode.
    return new CMov(...args);
  }

  public serialize(): Buffer {
    return serialize(CMov.wireFormat, this);
  }

  async execute(machineState: AvmMachineState, _journal: AvmJournal): Promise<void> {
    const a = machineState.memory.get(this.aOffset);
    const b = machineState.memory.get(this.bOffset);
    const cond = machineState.memory.get(this.condOffset);

    // TODO: reconsider toBigInt() here
    machineState.memory.set(this.dstOffset, cond.toBigInt() > 0 ? a : b);

    this.incrementPc(machineState);
  }
}

export class Cast extends TwoOperandInstruction {
  static readonly type: string = 'CAST';
  static readonly opcode = Opcode.CAST;

  constructor(indirect: number, dstTag: number, aOffset: number, dstOffset: number) {
    super(indirect, dstTag, aOffset, dstOffset);
  }

  protected get opcode() {
    return Cast.opcode;
  }

  public static deserialize(buf: BufferCursor | Buffer): Cast {
    const args = TwoOperandInstruction.deserializeBase(buf);
    return new Cast(...args);
  }

  async execute(machineState: AvmMachineState, _journal: AvmJournal): Promise<void> {
    const a = machineState.memory.get(this.aOffset);

    // TODO: consider not using toBigInt()
    const casted =
      this.inTag == TypeTag.FIELD ? new Field(a.toBigInt()) : TaggedMemory.integralFromTag(a.toBigInt(), this.inTag);

    machineState.memory.set(this.dstOffset, casted);

    this.incrementPc(machineState);
  }
}

export class Mov extends Instruction {
  static readonly type: string = 'MOV';
  static readonly opcode: Opcode = Opcode.MOV;

  // Instruction wire format with opcode.
  private static readonly wireFormat: OperandPair[] = [
    [(_c: Mov) => Mov.opcode, OperandType.UINT8],
    [(c: Mov) => c.indirect, OperandType.UINT8],
    [(c: Mov) => c.srcOffset, OperandType.UINT32],
    [(c: Mov) => c.dstOffset, OperandType.UINT32],
  ];

  constructor(private indirect: number, private srcOffset: number, private dstOffset: number) {
    super();
  }

  public static deserialize(buf: BufferCursor | Buffer): Mov {
    const res = deserialize(buf, Mov.wireFormat);
    const args = res.slice(1) as ConstructorParameters<typeof Mov>; // Remove opcode.
    return new Mov(...args);
  }

  public serialize(): Buffer {
    return serialize(Mov.wireFormat, this);
  }

  async execute(machineState: AvmMachineState, _journal: AvmJournal): Promise<void> {
    const a = machineState.memory.get(this.srcOffset);

    machineState.memory.set(this.dstOffset, a);

    this.incrementPc(machineState);
  }
}

export class CalldataCopy extends Instruction {
  static readonly type: string = 'CALLDATACOPY';
  static readonly opcode: Opcode = Opcode.CALLDATACOPY;

  // Instruction wire format with opcode.
  private static readonly wireFormat: OperandPair[] = [
    [(_c: CalldataCopy) => CalldataCopy.opcode, OperandType.UINT8],
    [(c: CalldataCopy) => c.indirect, OperandType.UINT8],
    [(c: CalldataCopy) => c.cdOffset, OperandType.UINT32],
    [(c: CalldataCopy) => c.copySize, OperandType.UINT32],
    [(c: CalldataCopy) => c.dstOffset, OperandType.UINT32],
  ];

  constructor(private indirect: number, private cdOffset: number, private copySize: number, private dstOffset: number) {
    super();
  }

  public static deserialize(buf: BufferCursor | Buffer): CalldataCopy {
    const res = deserialize(buf, CalldataCopy.wireFormat);
    const args = res.slice(1) as ConstructorParameters<typeof CalldataCopy>; // Remove opcode.
    return new CalldataCopy(...args);
  }

  public serialize(): Buffer {
    return serialize(CalldataCopy.wireFormat, this);
  }

  async execute(machineState: AvmMachineState, _journal: AvmJournal): Promise<void> {
    const transformedData = machineState.executionEnvironment.calldata
      .slice(this.cdOffset, this.cdOffset + this.copySize)
      .map(f => new Field(f));
    machineState.memory.setSlice(this.dstOffset, transformedData);

    this.incrementPc(machineState);
  }
}
