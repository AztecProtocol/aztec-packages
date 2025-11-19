import { OperandType } from '../serialization/instruction_serialization.js';
import { Instruction } from './instruction.js';

/**
 * Wire format that informs deserialization for instructions with three operands.
 * Updated with semantic types for v2 design.
 */
export const ThreeOperandWireFormat8 = [
  OperandType.OPCODE, // Opcode byte
  OperandType.ADDRMODE8, // Single 8-bit addressing mode bitmask for ALL operands
  OperandType.UINT8, // aOffset
  OperandType.UINT8, // bOffset
  OperandType.UINT8, // dstOffset
];
export const ThreeOperandWireFormat16 = [
  OperandType.OPCODE, // Opcode byte
  OperandType.ADDRMODE8, // Single 8-bit addressing mode bitmask for ALL operands
  OperandType.UINT16, // aOffset
  OperandType.UINT16, // bOffset
  OperandType.UINT16, // dstOffset
];

/**
 * Covers (de)serialization for an instruction with:
 * addressing mode bitmask and three operands.
 */
export abstract class ThreeOperandInstruction extends Instruction {
  static readonly wireFormat8: OperandType[] = ThreeOperandWireFormat8;
  static readonly wireFormat16: OperandType[] = ThreeOperandWireFormat16;

  constructor(
    protected addressingMode: number,
    protected aOffset: number,
    protected bOffset: number,
    protected dstOffset: number,
  ) {
    super();
  }
}
