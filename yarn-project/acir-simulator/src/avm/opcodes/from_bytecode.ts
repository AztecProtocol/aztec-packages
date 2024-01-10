import { Add, Mul, Sub } from './arithmetic.js';
import { Opcode } from './opcode.js';

export const OPERAND_BIT_LENGTH = 32;
export const OPERAND_BTYE_LENGTH = 4;
export const OPCODE_BIT_LENGTH = 8;
export const OPCODE_BYTE_LENGTH = 1;

const OPERANDS_LOOKUP: { [key: number]: number } = {
  0x1: Add.numberOfOperands,
  0x2: Sub.numberOfOperands,
  0x3: Mul.numberOfOperands,
};

function opcodeLookup(opcode: number, operands: number[]): Opcode {
  switch (opcode) {
    case 0x1:
      return new Add(operands[0], operands[1], operands[2]);
    case 0x2:
      return new Sub(operands[0], operands[1], operands[2]);
    case 0x3:
      return new Mul(operands[0], operands[1], operands[2]);
    default:
      throw new Error(`Opcode ${opcode} not found`);
  }
}

/**
 * Convert a buffer of bytecode into an array of opcodes
 * @param bytecode - Buffer of bytecode
 * @returns Bytecode interpreted into an ordered array of Opcodes
 */
export function interpretBytecode(bytecode: Buffer): Opcode[] {
  let readPtr = 0;
  const bytecodeLength = bytecode.length;

  const opcodes: Opcode[] = [];

  while (readPtr < bytecodeLength) {
    const opcode = bytecode[readPtr];
    readPtr += 1;

    const numberOfOperands = OPERANDS_LOOKUP[opcode];
    const operands: number[] = [];
    for (let i = 0; i < numberOfOperands; i++) {
      const operand = bytecode.readUInt32BE(readPtr);
      readPtr += OPERAND_BTYE_LENGTH;
      operands.push(operand);
    }

    opcodes.push(opcodeLookup(opcode, operands));
  }

  return opcodes;
}
