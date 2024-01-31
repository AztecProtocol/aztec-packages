import { BufferCursor } from '../serialization/buffer_cursor.js';
import {
  Opcode,
  OperandPair,
  OperandType,
  deserialize,
  serialize,
} from '../serialization/instruction_serialization.js';
import { Instruction } from './instruction.js';

export abstract class TwoOperandInstruction extends Instruction {
  // Instruction wire format with opcode.
  static readonly wireFormat: OperandPair[] = [
    [(c: TwoOperandInstruction) => c.opcode, OperandType.UINT8],
    [(c: TwoOperandInstruction) => c.indirect, OperandType.UINT8],
    [(c: TwoOperandInstruction) => c.inTag, OperandType.UINT8],
    [(c: TwoOperandInstruction) => c.aOffset, OperandType.UINT32],
    [(c: TwoOperandInstruction) => c.dstOffset, OperandType.UINT32],
  ];
  wireFormat = TwoOperandInstruction.wireFormat;

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
  static readonly wireFormat: OperandPair[] = [
    [(c: ThreeOperandInstruction) => c.opcode, OperandType.UINT8],
    [(c: ThreeOperandInstruction) => c.indirect, OperandType.UINT8],
    [(c: ThreeOperandInstruction) => c.inTag, OperandType.UINT8],
    [(c: ThreeOperandInstruction) => c.aOffset, OperandType.UINT32],
    [(c: ThreeOperandInstruction) => c.bOffset, OperandType.UINT32],
    [(c: ThreeOperandInstruction) => c.dstOffset, OperandType.UINT32],
  ];
  wireFormat = ThreeOperandInstruction.wireFormat;

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
