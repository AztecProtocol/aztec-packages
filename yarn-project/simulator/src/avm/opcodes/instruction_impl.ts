import { OperandType } from '../serialization/instruction_serialization.js';
import { Instruction } from './instruction.js';

/** Wire format that informs deserialization for instructions with three operands. */
export const ThreeOperandWireFormat8 = [
  OperandType.UINT8,
  OperandType.UINT8,
  OperandType.UINT8,
  OperandType.UINT8,
  OperandType.UINT8,
];
export const ThreeOperandWireFormat16 = [
  OperandType.UINT8,
  OperandType.UINT8,
  OperandType.UINT16,
  OperandType.UINT16,
  OperandType.UINT16,
];

/**
 * Covers (de)serialization for an instruction with:
 * indirect, inTag, and three operands.
 */
export abstract class ThreeOperandInstruction extends Instruction {
  static readonly wireFormat8: OperandType[] = ThreeOperandWireFormat8;
  static readonly wireFormat16: OperandType[] = ThreeOperandWireFormat16;

  constructor(
    protected indirect: number,
    protected aOffset: number,
    protected bOffset: number,
    protected dstOffset: number,
  ) {
    super();
  }
}
