import type { AvmContext } from '../avm_context.js';
import { Field, TaggedMemory } from '../avm_memory_types.js';
import { Opcode, OperandType } from '../serialization/instruction_serialization.js';
import { Addressing } from './addressing_mode.js';
import { Instruction } from './instruction.js';

export class Set extends Instruction {
  static readonly type: string = 'SET';
  // Required for gas.
  static readonly opcode: Opcode = Opcode.SET_8;

  public static readonly wireFormat8: OperandType[] = [
    OperandType.UINT8, // opcode
    OperandType.UINT8, // indirect
    OperandType.UINT8, // tag
    OperandType.UINT8, // const (value)
    OperandType.UINT8, // dstOffset
  ];
  public static readonly wireFormat16: OperandType[] = [
    OperandType.UINT8, // opcode
    OperandType.UINT8, // indirect
    OperandType.UINT8, // tag
    OperandType.UINT16, // const (value)
    OperandType.UINT16, // dstOffset
  ];
  public static readonly wireFormat32: OperandType[] = [
    OperandType.UINT8, // opcode
    OperandType.UINT8, // indirect
    OperandType.UINT8, // tag
    OperandType.UINT32, // const (value)
    OperandType.UINT16, // dstOffset
  ];
  public static readonly wireFormat64: OperandType[] = [
    OperandType.UINT8, // opcode
    OperandType.UINT8, // indirect
    OperandType.UINT8, // tag
    OperandType.UINT64, // const (value)
    OperandType.UINT16, // dstOffset
  ];
  public static readonly wireFormat128: OperandType[] = [
    OperandType.UINT8, // opcode
    OperandType.UINT8, // indirect
    OperandType.UINT8, // tag
    OperandType.UINT128, // const (value)
    OperandType.UINT16, // dstOffset
  ];
  public static readonly wireFormatFF: OperandType[] = [
    OperandType.UINT8, // opcode
    OperandType.UINT8, // indirect
    OperandType.UINT8, // tag
    OperandType.FF, // const (value)
    OperandType.UINT16, // dstOffset
  ];

  constructor(
    private indirect: number,
    private inTag: number,
    private value: bigint | number,
    private dstOffset: number,
  ) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory.track(this.type);
    context.machineState.consumeGas(this.gasCost());

    const operands = [this.dstOffset];
    const addressing = Addressing.fromWire(this.indirect, operands.length);
    const [dstOffset] = addressing.resolve(operands, memory);
    const res = TaggedMemory.buildFromTagTruncating(this.value, this.inTag);
    memory.set(dstOffset, res);

    memory.assert({ writes: 1, addressing });
    context.machineState.incrementPc(this.getSize());
  }
}

export class Cast extends Instruction {
  static readonly type: string = 'CAST';
  static readonly opcode = Opcode.CAST_8;

  static readonly wireFormat8 = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT8,
  ];
  static readonly wireFormat16 = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT16,
  ];

  constructor(private indirect: number, private dstTag: number, private srcOffset: number, private dstOffset: number) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory.track(this.type);
    context.machineState.consumeGas(this.gasCost());

    const operands = [this.srcOffset, this.dstOffset];
    const addressing = Addressing.fromWire(this.indirect, operands.length);
    const [srcOffset, dstOffset] = addressing.resolve(operands, memory);

    const a = memory.get(srcOffset);
    const casted = TaggedMemory.buildFromTagTruncating(a.toBigInt(), this.dstTag);

    memory.set(dstOffset, casted);

    memory.assert({ reads: 1, writes: 1, addressing });
    context.machineState.incrementPc(this.getSize());
  }
}

export class Mov extends Instruction {
  static readonly type: string = 'MOV';
  // FIXME: This is needed for gas.
  static readonly opcode: Opcode = Opcode.MOV_8;

  static readonly wireFormat8: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT8,
  ];
  static readonly wireFormat16: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT16,
  ];

  constructor(private indirect: number, private srcOffset: number, private dstOffset: number) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory.track(this.type);
    context.machineState.consumeGas(this.gasCost());

    const operands = [this.srcOffset, this.dstOffset];
    const addressing = Addressing.fromWire(this.indirect, operands.length);
    const [srcOffset, dstOffset] = addressing.resolve(operands, memory);

    const a = memory.get(srcOffset);

    memory.set(dstOffset, a);

    memory.assert({ reads: 1, writes: 1, addressing });
    context.machineState.incrementPc(this.getSize());
  }
}

export class CalldataCopy extends Instruction {
  static readonly type: string = 'CALLDATACOPY';
  static readonly opcode: Opcode = Opcode.CALLDATACOPY;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT16,
    OperandType.UINT16,
  ];

  constructor(
    private indirect: number,
    private cdStartOffset: number,
    private copySizeOffset: number,
    private dstOffset: number,
  ) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory.track(this.type);
    // We don't need to check tags here because: (1) the calldata is NOT in memory, and (2) we are the ones writing to destination.
    const operands = [this.cdStartOffset, this.copySizeOffset, this.dstOffset];
    const addressing = Addressing.fromWire(this.indirect, operands.length);
    const [cdStartOffset, copySizeOffset, dstOffset] = addressing.resolve(operands, memory);

    const cdStart = memory.get(cdStartOffset).toNumber();
    const copySize = memory.get(copySizeOffset).toNumber();
    context.machineState.consumeGas(this.gasCost(copySize));

    const transformedData = context.environment.calldata.slice(cdStart, cdStart + copySize).map(f => new Field(f));

    memory.setSlice(dstOffset, transformedData);

    memory.assert({ reads: 2, writes: copySize, addressing });
    context.machineState.incrementPc(this.getSize());
  }
}
