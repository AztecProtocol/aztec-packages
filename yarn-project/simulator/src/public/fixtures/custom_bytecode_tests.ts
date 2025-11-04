import { strict as assert } from 'assert';

import { TypeTag } from '../avm/avm_memory_types.js';
import { Addressing, AddressingMode } from '../avm/opcodes/addressing_mode.js';
import { CalldataCopy, Jump, Return, Set } from '../avm/opcodes/index.js';
import { encodeToBytecode } from '../avm/serialization/bytecode_serialization.js';
import {
  MAX_OPCODE_VALUE,
  Opcode,
  OperandType,
  getOperandSize,
} from '../avm/serialization/instruction_serialization.js';
import { testCustomBytecode } from './custom_bytecode_tester.js';
import { PublicTxSimulationTester } from './public_tx_simulation_tester.js';

// First instruction resolved a base address (offset 0) which is uninitialized and therefore
// of invalid tag (FF). This will trigger an exceptional halt.
export async function addressingWithBaseTagIssueTest(isIndirect: boolean, tester: PublicTxSimulationTester) {
  const addressingMode = Addressing.fromModes([
    isIndirect ? AddressingMode.INDIRECT_RELATIVE : AddressingMode.RELATIVE,
    AddressingMode.DIRECT,
    AddressingMode.DIRECT,
  ]);

  const bytecode = encodeToBytecode([
    new CalldataCopy(/*indirect=*/ addressingMode.toWire(), /*copySize=*/ 1, /*cdOffset=*/ 0, /*dstOffset=*/ 0),
    new Return(/*indirect=*/ 0, /*copySizeOffset=*/ 0, /*returnOffset=*/ 0),
  ]);

  const txLabel = isIndirect ? 'AddressingWithBaseTagInvalidIndirect' : 'AddressingWithBaseTagInvalidDirect';
  return await testCustomBytecode(bytecode, tester, txLabel);
}

export async function pcOutOfRangeTest(tester: PublicTxSimulationTester) {
  const bytecode = encodeToBytecode([
    new Jump(/*jumpOffset=*/ 123), // Jump to out-of-range pc offset.
    new Return(/*indirect=*/ 0, /*copySizeOffset=*/ 0, /*returnOffset=*/ 0),
  ]);

  const txLabel = 'PcOutOfRange';
  return await testCustomBytecode(bytecode, tester, txLabel);
}

export async function invalidOpcodeTest(tester: PublicTxSimulationTester) {
  let bytecode = encodeToBytecode([
    new Set(/*indirect=*/ 0, /*dstOffset=*/ 0, TypeTag.UINT32, /*value=*/ 0).as(Opcode.SET_8, Set.wireFormat8),
  ]);

  const offsetReturnOpcodeByte = bytecode.length;

  bytecode = Buffer.concat([
    bytecode,
    encodeToBytecode([new Return(/*indirect=*/ 0, /*copySizeOffset=*/ 0, /*returnOffset=*/ 0)]),
  ]);

  // Manipulate the Return opcode to make the opcode invalid (out of range).
  bytecode[offsetReturnOpcodeByte] = MAX_OPCODE_VALUE + 1; // opcode is invalid.

  const txLabel = 'InvalidOpcode';
  return await testCustomBytecode(bytecode, tester, txLabel);
}

// Single invalid byte in the bytecode.
export async function invalidByteTest(tester: PublicTxSimulationTester) {
  const invalidOpcode = MAX_OPCODE_VALUE + 7;
  assert(invalidOpcode < 256, 'Invalid opcode must fit in a single byte');
  const bytecode = Buffer.from([invalidOpcode]);

  const txLabel = 'InvalidByte';
  return await testCustomBytecode(bytecode, tester, txLabel);
}

// Truncate the last instruction in the bytecode.
export async function instructionTruncatedTest(tester: PublicTxSimulationTester) {
  let bytecode = encodeToBytecode([
    new Set(/*indirect=*/ 0, /*dstOffset=*/ 0, TypeTag.UINT32, /*value=*/ 0).as(Opcode.SET_8, Set.wireFormat8),
  ]);

  // Truncate the bytecode.
  bytecode = bytecode.subarray(0, -1);

  const txLabel = 'InstructionTruncated';
  return await testCustomBytecode(bytecode, tester, txLabel);
}

// Invalid tag value byte in an instruction.
export async function invalidTagValueTest(tester: PublicTxSimulationTester) {
  const bytecode = encodeToBytecode([
    new Set(/*indirect=*/ 0, /*dstOffset=*/ 0, TypeTag.UINT32, /*value=*/ 0).as(Opcode.SET_8, Set.wireFormat8),
    new Return(/*indirect=*/ 0, /*copySizeOffset=*/ 0, /*returnOffset=*/ 0),
  ]);

  const tagOffset = getTagOffsetInInstruction(Set.wireFormat8);
  assert(bytecode[tagOffset].valueOf() == TypeTag.UINT32.valueOf(), 'Set instruction tag should be UINT32 in test');
  bytecode[tagOffset] = TypeTag.INVALID;

  const txLabel = 'InvalidTagValue';
  return await testCustomBytecode(bytecode, tester, txLabel);
}

// Combine an invalid tag in the last instruction that is truncated.
export async function invalidTagValueAndInstructionTruncatedTest(tester: PublicTxSimulationTester) {
  let bytecode = encodeToBytecode([
    // Important: value argument must be a bigint otherwise a type error will be thrown.
    new Set(/*indirect=*/ 0, /*dstOffset=*/ 0, TypeTag.UINT128, /*value=*/ 0n).as(Opcode.SET_128, Set.wireFormat128),
  ]);

  // Truncate the bytecode.
  bytecode = bytecode.subarray(0, -5);
  const tagOffset = getTagOffsetInInstruction(Set.wireFormat128);
  assert(bytecode[tagOffset].valueOf() == TypeTag.UINT128.valueOf(), 'Set instruction tag should be UINT128 in test');
  bytecode[tagOffset] = 0x6f; // Invalid tag value.

  const txLabel = 'InvalidTagValueAndInstructionTruncated';
  return await testCustomBytecode(bytecode, tester, txLabel);
}

/**
 * Returns the offset of the tag in an instruction.
 * @details Loops over the wire format operand type entries until it finds the tag.
 * Returns the byte offset of the tag based on each operand size that is passed.
 *
 * @param wireFormat array of operand types
 * @returns byte offset of the tag
 */
function getTagOffsetInInstruction(wireFormat: OperandType[]): number {
  let offset = 0;
  for (const operand of wireFormat) {
    if (operand === OperandType.TAG) {
      break;
    }
    offset += getOperandSize(operand);
  }
  return offset;
}
