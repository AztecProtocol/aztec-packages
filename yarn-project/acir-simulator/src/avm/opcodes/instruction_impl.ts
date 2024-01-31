import { BufferCursor } from '../serialization/buffer_cursor.js';
import { Opcode, OperandType, deserialize, serialize } from '../serialization/instruction_serialization.js';
import { Instruction } from './instruction.js';

export abstract class TwoOperandInstruction extends Instruction {
  // Instruction wire format with opcode.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT32,
    OperandType.UINT32,
  ];

  constructor(
    protected indirect: number,
    protected inTag: number,
    protected aOffset: number,
    protected dstOffset: number,
  ) {
    super();
  }

  protected static deserializeBase(buf: BufferCursor | Buffer): ConstructorParameters<typeof TwoOperandInstruction> {
    const res = deserialize(buf, TwoOperandInstruction.wireFormat);
    const params = res.slice(1); // Remove opcode.
    return params as ConstructorParameters<typeof TwoOperandInstruction>;
  }

  public serialize(): Buffer {
    return serialize(TwoOperandInstruction.wireFormat, this);
  }

  protected abstract get opcode(): Opcode;
}

export abstract class ThreeOperandInstruction extends Instruction {
  // Instruction wire format with opcode.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT32,
    OperandType.UINT32,
    OperandType.UINT32,
  ];

  constructor(
    protected indirect: number,
    protected inTag: number,
    protected aOffset: number,
    protected bOffset: number,
    protected dstOffset: number,
  ) {
    super();
  }

  protected static deserializeBase(buf: BufferCursor | Buffer): ConstructorParameters<typeof ThreeOperandInstruction> {
    const res = deserialize(buf, ThreeOperandInstruction.wireFormat);
    const params = res.slice(1); // Remove opcode.
    return params as ConstructorParameters<typeof ThreeOperandInstruction>;
  }

  public serialize(): Buffer {
    return serialize(ThreeOperandInstruction.wireFormat, this);
  }

  protected abstract get opcode(): Opcode;
}
