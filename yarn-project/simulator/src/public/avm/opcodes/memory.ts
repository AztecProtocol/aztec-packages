import { Fr } from '@aztec/foundation/fields';

import { strict as assert } from 'assert';

import type { AvmContext } from '../avm_context.js';
import { Field, TaggedMemory, TypeTag, Uint32 } from '../avm_memory_types.js';
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
    OperandType.UINT8, // dstOffset
    OperandType.TAG, // tag
    OperandType.UINT8, // const (value)
  ];
  public static readonly wireFormat16: OperandType[] = [
    OperandType.UINT8, // opcode
    OperandType.UINT8, // indirect
    OperandType.UINT16, // dstOffset
    OperandType.TAG, // tag
    OperandType.UINT16, // const (value)
  ];
  public static readonly wireFormat32: OperandType[] = [
    OperandType.UINT8, // opcode
    OperandType.UINT8, // indirect
    OperandType.UINT16, // dstOffset
    OperandType.TAG, // tag
    OperandType.UINT32, // const (value)
  ];
  public static readonly wireFormat64: OperandType[] = [
    OperandType.UINT8, // opcode
    OperandType.UINT8, // indirect
    OperandType.UINT16, // dstOffset
    OperandType.TAG, // tag
    OperandType.UINT64, // const (value)
  ];
  public static readonly wireFormat128: OperandType[] = [
    OperandType.UINT8, // opcode
    OperandType.UINT8, // indirect
    OperandType.UINT16, // dstOffset
    OperandType.TAG, // tag
    OperandType.UINT128, // const (value)
  ];
  public static readonly wireFormatFF: OperandType[] = [
    OperandType.UINT8, // opcode
    OperandType.UINT8, // indirect
    OperandType.UINT16, // dstOffset
    OperandType.TAG, // tag
    OperandType.FF, // const (value)
  ];

  constructor(
    private indirect: number,
    private dstOffset: number,
    private inTag: number,
    private value: bigint | number,
  ) {
    super();
    assert(this.value >= 0, `Value ${this.value} is negative`);
    assert(this.value < Fr.MODULUS, `Value ${this.value} is larger than Fr.MODULUS`);
  }

  public async execute(context: AvmContext): Promise<void> {
    // Constructor ensured that this.inTag is a valid tag
    const res = TaggedMemory.buildFromTagTruncating(this.value, this.inTag);

    const memory = context.machineState.memory;
    const addressing = Addressing.fromWire(this.indirect);

    context.machineState.consumeGas(
      this.baseGasCost(addressing.indirectOperandsCount(), addressing.relativeOperandsCount()),
    );

    const operands = [this.dstOffset];
    const [dstOffset] = addressing.resolve(operands, memory);
    memory.set(dstOffset, res);
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
    OperandType.TAG,
  ];
  static readonly wireFormat16 = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT16,
    OperandType.TAG,
  ];

  constructor(
    private indirect: number,
    private srcOffset: number,
    private dstOffset: number,
    private dstTag: number,
  ) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory;
    const addressing = Addressing.fromWire(this.indirect);

    context.machineState.consumeGas(
      this.baseGasCost(addressing.indirectOperandsCount(), addressing.relativeOperandsCount()),
    );

    const operands = [this.srcOffset, this.dstOffset];
    const [srcOffset, dstOffset] = addressing.resolve(operands, memory);

    const a = memory.get(srcOffset);
    // Constructor ensured that this.dstTag is a valid tag
    const casted = TaggedMemory.buildFromTagTruncating(a.toBigInt(), this.dstTag);

    memory.set(dstOffset, casted);
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

  constructor(
    private indirect: number,
    private srcOffset: number,
    private dstOffset: number,
  ) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory;
    const addressing = Addressing.fromWire(this.indirect);

    context.machineState.consumeGas(
      this.baseGasCost(addressing.indirectOperandsCount(), addressing.relativeOperandsCount()),
    );

    const operands = [this.srcOffset, this.dstOffset];
    const [srcOffset, dstOffset] = addressing.resolve(operands, memory);
    const a = memory.get(srcOffset);
    memory.set(dstOffset, a);
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
    private copySizeOffset: number,
    private cdStartOffset: number,
    private dstOffset: number,
  ) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory;
    const addressing = Addressing.fromWire(this.indirect);

    context.machineState.consumeGas(
      this.baseGasCost(addressing.indirectOperandsCount(), addressing.relativeOperandsCount()),
    );

    const operands = [this.copySizeOffset, this.cdStartOffset, this.dstOffset];
    const [copySizeOffset, cdStartOffset, dstOffset] = addressing.resolve(operands, memory);

    memory.checkTags(TypeTag.UINT32, cdStartOffset, copySizeOffset);
    const cdStart = memory.get(cdStartOffset).toNumber();
    const copySize = memory.get(copySizeOffset).toNumber();
    context.machineState.consumeGas(this.dynamicGasCost(copySize));

    // Values which are out-of-range of the calldata array will be set with Field(0);
    const slice = context.environment.calldata.slice(cdStart, cdStart + copySize).map(f => new Field(f));
    // slice has size = MIN(copySize, calldata.length - cdStart) as TS truncates out-of-range portion
    const transformedData = [...slice, ...Array(copySize - slice.length).fill(new Field(0))];

    memory.setSlice(dstOffset, transformedData);
  }
}

export class ReturndataSize extends Instruction {
  static readonly type: string = 'RETURNDATASIZE';
  static readonly opcode: Opcode = Opcode.RETURNDATASIZE;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [OperandType.UINT8, OperandType.UINT8, OperandType.UINT16];

  constructor(
    private indirect: number,
    private dstOffset: number,
  ) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory;
    const addressing = Addressing.fromWire(this.indirect);

    context.machineState.consumeGas(
      this.baseGasCost(addressing.indirectOperandsCount(), addressing.relativeOperandsCount()),
    );

    const operands = [this.dstOffset];
    const [dstOffset] = addressing.resolve(operands, memory);

    memory.set(dstOffset, new Uint32(context.machineState.nestedReturndata.length));
  }
}

export class ReturndataCopy extends Instruction {
  static readonly type: string = 'RETURNDATACOPY';
  static readonly opcode: Opcode = Opcode.RETURNDATACOPY;
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
    private copySizeOffset: number,
    private rdStartOffset: number,
    private dstOffset: number,
  ) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory;
    const addressing = Addressing.fromWire(this.indirect);

    context.machineState.consumeGas(
      this.baseGasCost(addressing.indirectOperandsCount(), addressing.relativeOperandsCount()),
    );

    const operands = [this.copySizeOffset, this.rdStartOffset, this.dstOffset];
    const [copySizeOffset, rdStartOffset, dstOffset] = addressing.resolve(operands, memory);

    memory.checkTags(TypeTag.UINT32, rdStartOffset, copySizeOffset);
    const rdStart = memory.get(rdStartOffset).toNumber();
    const copySize = memory.get(copySizeOffset).toNumber();
    context.machineState.consumeGas(this.dynamicGasCost(copySize));

    // Values which are out-of-range of the returndata array will be set with Field(0);
    const slice = context.machineState.nestedReturndata.slice(rdStart, rdStart + copySize).map(f => new Field(f));
    // slice has size = MIN(copySize, returndata.length - rdStart) as TS truncates out-of-range portion
    const transformedData = [...slice, ...Array(copySize - slice.length).fill(new Field(0))];

    memory.setSlice(dstOffset, transformedData);
  }
}
