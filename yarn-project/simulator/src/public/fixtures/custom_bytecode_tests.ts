import { strict as assert } from 'assert';

import { TypeTag } from '../avm/avm_memory_types.js';
import { Addressing, AddressingMode } from '../avm/opcodes/addressing_mode.js';
import { Add, CalldataCopy, Jump, Return, Set } from '../avm/opcodes/index.js';
import { encodeToBytecode } from '../avm/serialization/bytecode_serialization.js';
import {
  MAX_OPCODE_VALUE,
  Opcode,
  OperandType,
  getOperandSize,
} from '../avm/serialization/instruction_serialization.js';
import { deployAndExecuteCustomBytecode } from './custom_bytecode_tester.js';
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
    new CalldataCopy(/*addressing_mode=*/ addressingMode.toWire(), /*copySize=*/ 1, /*cdOffset=*/ 0, /*dstOffset=*/ 0),
    new Return(/*addressing_mode=*/ 0, /*copySizeOffset=*/ 0, /*returnOffset=*/ 0),
  ]);

  const txLabel = isIndirect ? 'AddressingWithBaseTagInvalidIndirect' : 'AddressingWithBaseTagInvalidDirect';
  return await deployAndExecuteCustomBytecode(bytecode, tester, txLabel);
}

// First instruction sets a value with tag U64 at offset 0. Then a CalldataCopy instruction
// uses INDIRECT addressing to read from offset 0, which should fail because the value at
// offset 0 has tag U64 (not U32), making it an invalid address tag.
export async function addressingWithIndirectTagIssueTest(tester: PublicTxSimulationTester) {
  // Set a U64 value at offset 0 - this will be used as an indirect address
  const addressingMode = Addressing.fromModes([
    AddressingMode.INDIRECT, // First operand (cdOffset) uses indirect addressing
    AddressingMode.DIRECT,
    AddressingMode.DIRECT,
  ]);

  const bytecode = encodeToBytecode([
    // Set a U64 value at offset 0 - this has the wrong tag for an address (should be U32)
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 0, TypeTag.UINT64, /*value=*/ 100n).as(
      Opcode.SET_64,
      Set.wireFormat64,
    ),
    // Try to use indirect addressing: read from offset 0, which contains a U64 value
    // This should fail because U64 is not a valid address tag (must be U32)
    new CalldataCopy(/*addressing_mode=*/ addressingMode.toWire(), /*copySize=*/ 1, /*cdOffset=*/ 0, /*dstOffset=*/ 1),
    new Return(/*addressing_mode=*/ 0, /*copySizeOffset=*/ 0, /*returnOffset=*/ 0),
  ]);

  const txLabel = 'AddressingWithIndirectTagInvalid';
  return await deployAndExecuteCustomBytecode(bytecode, tester, txLabel);
}

// First instruction sets a value 10 with tag U32 at offset 1 (direct, no relative).
// Then an ADD_16 instruction uses INDIRECT addressing for the first operand (offset 1)
// and RELATIVE addressing for the second operand (offset 2). The indirect addressing
// succeeds (reads U32 value 10 from offset 1, uses it as address), but the relative
// addressing fails because the base address at offset 0 has the wrong tag (uninitialized/invalid).
export async function addressingWithIndirectThenRelativeTagIssueTest(tester: PublicTxSimulationTester) {
  const addressingMode = Addressing.fromModes([
    AddressingMode.INDIRECT, // First operand (aOffset) uses indirect addressing, no relative
    AddressingMode.RELATIVE, // Second operand (bOffset) uses relative addressing
    AddressingMode.DIRECT, // Third operand (dstOffset) uses direct addressing
  ]);

  const bytecode = encodeToBytecode([
    // Set a U32 value 10 at offset 1 - this will be used as an indirect address
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 1, TypeTag.UINT32, /*value=*/ 10).as(
      Opcode.SET_32,
      Set.wireFormat32,
    ),
    // ADD_16: first operand uses indirect addressing (reads from offset 1, gets value 10, uses as address - succeeds)
    //         second operand uses relative addressing (tries to read base from offset 0, but offset 0 has wrong tag - fails)
    new Add(/*addressing_mode=*/ addressingMode.toWire(), /*aOffset=*/ 1, /*bOffset=*/ 2, /*dstOffset=*/ 3).as(
      Opcode.ADD_16,
      Add.wireFormat16,
    ),
    new Return(/*addressing_mode=*/ 0, /*copySizeOffset=*/ 0, /*returnOffset=*/ 0),
  ]);

  const txLabel = 'AddressingWithIndirectThenRelativeTagInvalid';
  return await deployAndExecuteCustomBytecode(bytecode, tester, txLabel);
}

// First instruction sets UINT32_MAX at offset 0 (base address) with tag U32.
// Then an ADD_8 instruction uses INDIRECT_RELATIVE addressing for the first operand (offset 1)
// and INDIRECT addressing for the second operand (offset 2). The relative addressing
// for the first operand will overflow (UINT32_MAX + 1 >= MAX_MEMORY_SIZE), causing the instruction to fail.
// The second operand will also fail (indirect addressing from offset 2 which is uninitialized with tag FF).
export async function addressingWithRelativeOverflowAndIndirectTagIssueTest(tester: PublicTxSimulationTester) {
  const addressingMode = Addressing.fromModes([
    AddressingMode.INDIRECT_RELATIVE, // First operand (aOffset) uses both indirect and relative addressing
    AddressingMode.INDIRECT, // Second operand (bOffset) uses indirect addressing only
    AddressingMode.DIRECT, // Third operand (dstOffset) uses direct addressing
  ]);

  // UINT32_MAX = 2^32 - 1 = 4294967295
  const UINT32_MAX = 0xffffffff;

  const bytecode = encodeToBytecode([
    // Set UINT32_MAX at offset 0 as base address - this will cause overflow when adding relative offset 1
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 0, TypeTag.UINT32, /*value=*/ UINT32_MAX).as(
      Opcode.SET_32,
      Set.wireFormat32,
    ),
    new Add(/*addressing_mode=*/ addressingMode.toWire(), /*aOffset=*/ 1, /*bOffset=*/ 2, /*dstOffset=*/ 3).as(
      Opcode.ADD_8,
      Add.wireFormat8,
    ),
    new Return(/*addressing_mode=*/ 0, /*copySizeOffset=*/ 0, /*returnOffset=*/ 0),
  ]);

  const txLabel = 'AddressingWithRelativeOverflowAndIndirectTagInvalid';
  return await deployAndExecuteCustomBytecode(bytecode, tester, txLabel);
}

export async function pcOutOfRangeTest(tester: PublicTxSimulationTester) {
  const bytecode = encodeToBytecode([
    new Jump(/*jumpOffset=*/ 123), // Jump to out-of-range pc offset.
    new Return(/*addressing_mode=*/ 0, /*copySizeOffset=*/ 0, /*returnOffset=*/ 0),
  ]);

  const txLabel = 'PcOutOfRange';
  return await deployAndExecuteCustomBytecode(bytecode, tester, txLabel);
}

export async function invalidOpcodeTest(tester: PublicTxSimulationTester) {
  let bytecode = encodeToBytecode([
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 0, TypeTag.UINT32, /*value=*/ 0).as(Opcode.SET_8, Set.wireFormat8),
  ]);

  const offsetReturnOpcodeByte = bytecode.length;

  bytecode = Buffer.concat([
    bytecode,
    encodeToBytecode([new Return(/*addressing_mode=*/ 0, /*copySizeOffset=*/ 0, /*returnOffset=*/ 0)]),
  ]);

  // Manipulate the Return opcode to make the opcode invalid (out of range).
  bytecode[offsetReturnOpcodeByte] = MAX_OPCODE_VALUE + 1; // opcode is invalid.

  const txLabel = 'InvalidOpcode';
  return await deployAndExecuteCustomBytecode(bytecode, tester, txLabel);
}

// Single invalid byte in the bytecode.
export async function invalidByteTest(tester: PublicTxSimulationTester) {
  const invalidOpcode = MAX_OPCODE_VALUE + 7;
  assert(invalidOpcode < 256, 'Invalid opcode must fit in a single byte');
  const bytecode = Buffer.from([invalidOpcode]);

  const txLabel = 'InvalidByte';
  return await deployAndExecuteCustomBytecode(bytecode, tester, txLabel);
}

// Truncate the last instruction in the bytecode.
export async function instructionTruncatedTest(tester: PublicTxSimulationTester) {
  let bytecode = encodeToBytecode([
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 0, TypeTag.UINT32, /*value=*/ 0).as(Opcode.SET_8, Set.wireFormat8),
  ]);

  // Truncate the bytecode.
  bytecode = bytecode.subarray(0, -1);

  const txLabel = 'InstructionTruncated';
  return await deployAndExecuteCustomBytecode(bytecode, tester, txLabel);
}

// Invalid tag value byte in an instruction.
export async function invalidTagValueTest(tester: PublicTxSimulationTester) {
  const bytecode = encodeToBytecode([
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 0, TypeTag.UINT32, /*value=*/ 0).as(Opcode.SET_8, Set.wireFormat8),
    new Return(/*addressing_mode=*/ 0, /*copySizeOffset=*/ 0, /*returnOffset=*/ 0),
  ]);

  const tagOffset = getTagOffsetInInstruction(Set.wireFormat8);
  assert(bytecode[tagOffset].valueOf() == TypeTag.UINT32.valueOf(), 'Set instruction tag should be UINT32 in test');
  bytecode[tagOffset] = TypeTag.INVALID;

  const txLabel = 'InvalidTagValue';
  return await deployAndExecuteCustomBytecode(bytecode, tester, txLabel);
}

// Combine an invalid tag in the last instruction that is truncated.
export async function invalidTagValueAndInstructionTruncatedTest(tester: PublicTxSimulationTester) {
  let bytecode = encodeToBytecode([
    // Important: value argument must be a bigint otherwise a type error will be thrown.
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 0, TypeTag.UINT128, /*value=*/ 0n).as(
      Opcode.SET_128,
      Set.wireFormat128,
    ),
  ]);

  // Truncate the bytecode.
  bytecode = bytecode.subarray(0, -5);
  const tagOffset = getTagOffsetInInstruction(Set.wireFormat128);
  assert(bytecode[tagOffset].valueOf() == TypeTag.UINT128.valueOf(), 'Set instruction tag should be UINT128 in test');
  bytecode[tagOffset] = 0x6f; // Invalid tag value.

  const txLabel = 'InvalidTagValueAndInstructionTruncated';
  return await deployAndExecuteCustomBytecode(bytecode, tester, txLabel);
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
