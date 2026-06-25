import { Fr } from '@aztec/foundation/curves/bn254';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import { strict as assert } from 'assert';

import { TypeTag } from '../avm/avm_memory_types.js';
import { Addressing, AddressingMode } from '../avm/opcodes/addressing_mode.js';
import { Add, Call, CalldataCopy, Cast, Jump, Return, Set, Sha256Compression, Xor } from '../avm/opcodes/index.js';
import { encodeToBytecode } from '../avm/serialization/bytecode_serialization.js';
import {
  MAX_OPCODE_VALUE,
  Opcode,
  OperandType,
  getInstructionSize,
  getOperandSize,
} from '../avm/serialization/instruction_serialization.js';
import { deployAndExecuteCustomBytecode, deployCustomBytecode } from './custom_bytecode_tester.js';
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

  const tagOffset = getOperandOffsetInInstruction(Set.wireFormat8, OperandType.TAG);
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
  const tagOffset = getOperandOffsetInInstruction(Set.wireFormat128, OperandType.TAG);
  assert(bytecode[tagOffset].valueOf() == TypeTag.UINT128.valueOf(), 'Set instruction tag should be UINT128 in test');
  bytecode[tagOffset] = 0x6f; // Invalid tag value.

  const txLabel = 'InvalidTagValueAndInstructionTruncated';
  return await deployAndExecuteCustomBytecode(bytecode, tester, txLabel);
}

// Exercise SET truncation: set values whose widths exceed the target tag and
// rely on `buildFromTagTruncating` to truncate to the low bits of the tag.
// Covers sources larger than 128 bits (via SET_FF) and sources in (32, 128]
// bits (via SET_64) against destination tags U1/U8/U16/U32/U64/U128.
export async function setTruncationTest(tester: PublicTxSimulationTester) {
  // 200-bit value: forces truncation for every target tag up to U128.
  const LARGE_FIELD_VALUE = (1n << 200n) + 0x1234567890abcdef1234567890abcdefn;
  // 40-bit value: forces truncation for target tags up to U32.
  const LARGE_U64_VALUE = (1n << 40n) + 0xdeadbeefn;

  const bytecode = encodeToBytecode([
    // Zero U32 at offset 0 — used as the Return copy-size slot.
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 0, TypeTag.UINT32, /*value=*/ 0).as(Opcode.SET_8, Set.wireFormat8),

    // Source >128 bits (via SET_FF) truncated to smaller target tags.
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 1, TypeTag.UINT128, LARGE_FIELD_VALUE).as(
      Opcode.SET_FF,
      Set.wireFormatFF,
    ),
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 2, TypeTag.UINT64, LARGE_FIELD_VALUE).as(
      Opcode.SET_FF,
      Set.wireFormatFF,
    ),
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 3, TypeTag.UINT32, LARGE_FIELD_VALUE).as(
      Opcode.SET_FF,
      Set.wireFormatFF,
    ),
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 4, TypeTag.UINT16, LARGE_FIELD_VALUE).as(
      Opcode.SET_FF,
      Set.wireFormatFF,
    ),
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 5, TypeTag.UINT8, LARGE_FIELD_VALUE).as(
      Opcode.SET_FF,
      Set.wireFormatFF,
    ),
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 6, TypeTag.UINT1, LARGE_FIELD_VALUE).as(
      Opcode.SET_FF,
      Set.wireFormatFF,
    ),

    // Source in (32, 128] bits (via SET_64) truncated to smaller target tags.
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 7, TypeTag.UINT32, LARGE_U64_VALUE).as(
      Opcode.SET_64,
      Set.wireFormat64,
    ),
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 8, TypeTag.UINT16, LARGE_U64_VALUE).as(
      Opcode.SET_64,
      Set.wireFormat64,
    ),
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 9, TypeTag.UINT8, LARGE_U64_VALUE).as(
      Opcode.SET_64,
      Set.wireFormat64,
    ),
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 10, TypeTag.UINT1, LARGE_U64_VALUE).as(
      Opcode.SET_64,
      Set.wireFormat64,
    ),

    new Return(/*addressing_mode=*/ 0, /*copySizeOffset=*/ 0, /*returnOffset=*/ 0),
  ]);

  const txLabel = 'SetTruncation';
  return await deployAndExecuteCustomBytecode(bytecode, tester, txLabel);
}

// Exercise CAST truncation: store a wide source value in memory then CAST it
// to smaller destination tags. Covers sources larger than 128 bits (FIELD
// source) and sources in (32, 128] bits (UINT64 source) against destination
// tags U1/U8/U16/U32/U64/U128.
export async function castTruncationTest(tester: PublicTxSimulationTester) {
  // 200-bit source: stored as FIELD so that CASTs to any integer tag truncate.
  const LARGE_FIELD_VALUE = (1n << 200n) + 0x1234567890abcdef1234567890abcdefn;
  // 40-bit source: stored as UINT64 so CASTs to U1/U8/U16/U32 truncate.
  const LARGE_U64_VALUE = (1n << 40n) + 0xdeadbeefn;

  const bytecode = encodeToBytecode([
    // Zero U32 at offset 0 — used as the Return copy-size slot.
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 0, TypeTag.UINT32, /*value=*/ 0).as(Opcode.SET_8, Set.wireFormat8),

    // Store wide FIELD source at offset 10, then CAST to smaller tags.
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 10, TypeTag.FIELD, LARGE_FIELD_VALUE).as(
      Opcode.SET_FF,
      Set.wireFormatFF,
    ),
    new Cast(/*addressing_mode=*/ 0, /*srcOffset=*/ 10, /*dstOffset=*/ 11, TypeTag.UINT128).as(
      Opcode.CAST_8,
      Cast.wireFormat8,
    ),
    new Cast(/*addressing_mode=*/ 0, /*srcOffset=*/ 10, /*dstOffset=*/ 12, TypeTag.UINT64).as(
      Opcode.CAST_8,
      Cast.wireFormat8,
    ),
    new Cast(/*addressing_mode=*/ 0, /*srcOffset=*/ 10, /*dstOffset=*/ 13, TypeTag.UINT32).as(
      Opcode.CAST_8,
      Cast.wireFormat8,
    ),
    new Cast(/*addressing_mode=*/ 0, /*srcOffset=*/ 10, /*dstOffset=*/ 14, TypeTag.UINT16).as(
      Opcode.CAST_8,
      Cast.wireFormat8,
    ),
    new Cast(/*addressing_mode=*/ 0, /*srcOffset=*/ 10, /*dstOffset=*/ 15, TypeTag.UINT8).as(
      Opcode.CAST_8,
      Cast.wireFormat8,
    ),
    new Cast(/*addressing_mode=*/ 0, /*srcOffset=*/ 10, /*dstOffset=*/ 16, TypeTag.UINT1).as(
      Opcode.CAST_8,
      Cast.wireFormat8,
    ),

    // Store UINT64 source at offset 20, then CAST to smaller integer tags.
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 20, TypeTag.UINT64, LARGE_U64_VALUE).as(
      Opcode.SET_64,
      Set.wireFormat64,
    ),
    new Cast(/*addressing_mode=*/ 0, /*srcOffset=*/ 20, /*dstOffset=*/ 21, TypeTag.UINT32).as(
      Opcode.CAST_8,
      Cast.wireFormat8,
    ),
    new Cast(/*addressing_mode=*/ 0, /*srcOffset=*/ 20, /*dstOffset=*/ 22, TypeTag.UINT16).as(
      Opcode.CAST_8,
      Cast.wireFormat8,
    ),
    new Cast(/*addressing_mode=*/ 0, /*srcOffset=*/ 20, /*dstOffset=*/ 23, TypeTag.UINT8).as(
      Opcode.CAST_8,
      Cast.wireFormat8,
    ),
    new Cast(/*addressing_mode=*/ 0, /*srcOffset=*/ 20, /*dstOffset=*/ 24, TypeTag.UINT1).as(
      Opcode.CAST_8,
      Cast.wireFormat8,
    ),

    new Return(/*addressing_mode=*/ 0, /*copySizeOffset=*/ 0, /*returnOffset=*/ 0),
  ]);

  const txLabel = 'CastTruncation';
  return await deployAndExecuteCustomBytecode(bytecode, tester, txLabel);
}

// Exercise a SET_FF instruction whose 32-byte FF immediate encodes a value larger than the
// field modulus (here Fr.MODULUS + 25). Both the TS and C++ deserializers reduce the immediate
// modulo Fr.MODULUS (see readUint254BE), so the resolved value is 25, the instruction is accepted,
// and execution succeeds. We build a valid SET_FF first (its constructor rejects values >=
// Fr.MODULUS) and then overwrite the immediate bytes directly.
export async function setFieldOverflowTest(tester: PublicTxSimulationTester) {
  const bytecode = encodeToBytecode([
    // Zero U32 at offset 0 — used as the Return copy-size slot.
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 0, TypeTag.UINT32, /*value=*/ 0).as(Opcode.SET_8, Set.wireFormat8),
    // Placeholder FF immediate (25); overwritten below with Fr.MODULUS + 25.
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 1, TypeTag.FIELD, /*value=*/ 25n).as(
      Opcode.SET_FF,
      Set.wireFormatFF,
    ),
    new Return(/*addressing_mode=*/ 0, /*copySizeOffset=*/ 0, /*returnOffset=*/ 0),
  ]);

  // Locate the FF immediate: it lives in the second instruction (the SET_FF), so its absolute
  // offset is the size of the leading SET_8 instruction plus the FF operand offset within SET_FF.
  const setFFInstructionOffset = getInstructionSize(Set.wireFormat8);
  const ffOffset = setFFInstructionOffset + getOperandOffsetInInstruction(Set.wireFormatFF, OperandType.FF);

  // Overwrite the 32-byte FF immediate (big-endian) with a value that overflows the field.
  const overflowingValue = Fr.MODULUS + 25n;
  let value = overflowingValue;
  for (let i = getOperandSize(OperandType.FF) - 1; i >= 0; --i) {
    bytecode[ffOffset + i] = Number(value & 0xffn);
    value >>= 8n;
  }

  const txLabel = 'SetFieldOverflow';
  return await deployAndExecuteCustomBytecode(bytecode, tester, txLabel);
}

/**
 * Returns the byte offset of the first operand of the given type within an instruction.
 * @details Loops over the wire format operand type entries, accumulating each operand size,
 * until it finds the requested operand type.
 *
 * @param wireFormat array of operand types
 * @param operandType the operand type to locate
 * @returns byte offset of the operand
 */
function getOperandOffsetInInstruction(wireFormat: OperandType[], operandType: OperandType): number {
  let offset = 0;
  for (const operand of wireFormat) {
    if (operand === operandType) {
      break;
    }
    offset += getOperandSize(operand);
  }
  return offset;
}

export async function deployBitwiseSha256ErrorRowCollisionContracts(
  tester: PublicTxSimulationTester,
): Promise<{ innerContract: ContractInstanceWithAddress; outerContract: ContractInstanceWithAddress }> {
  const innerBytecode = encodeToBytecode([
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 0, TypeTag.UINT32, /*value=*/ 0).as(Opcode.SET_8, Set.wireFormat8),
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 1, TypeTag.UINT16, /*value=*/ 0).as(Opcode.SET_8, Set.wireFormat8),
    new Xor(/*addressing_mode=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).as(Opcode.XOR_8, Xor.wireFormat8),
    new Return(/*addressing_mode=*/ 0, /*copySizeOffset=*/ 0, /*returnOffset=*/ 0),
  ]);

  const outerInstructions = [
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 0, TypeTag.UINT32, /*value=*/ 0).as(Opcode.SET_8, Set.wireFormat8),
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 1, TypeTag.UINT32, /*value=*/ 1).as(Opcode.SET_8, Set.wireFormat8),
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 2, TypeTag.UINT32, /*value=*/ 100_000).as(
      Opcode.SET_32,
      Set.wireFormat32,
    ),
    new CalldataCopy(/*addressing_mode=*/ 0, /*copySizeOffset=*/ 1, /*cdStartOffset=*/ 0, /*dstOffset=*/ 3),
    new Call(
      /*addressing_mode=*/ 0,
      /*l2GasOffset=*/ 2,
      /*daGasOffset=*/ 2,
      /*addrOffset=*/ 3,
      /*argsSizeOffset=*/ 0,
      /*argsOffset=*/ 0,
    ),
  ];

  for (let i = 0; i < 8; i++) {
    outerInstructions.push(
      new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 10 + i, TypeTag.UINT32, /*value=*/ 0).as(
        Opcode.SET_8,
        Set.wireFormat8,
      ),
    );
  }

  outerInstructions.push(
    new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 18, TypeTag.UINT32, /*value=*/ 0x61626364).as(
      Opcode.SET_32,
      Set.wireFormat32,
    ),
  );

  for (let i = 0; i < 15; i++) {
    outerInstructions.push(
      new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 19 + i, TypeTag.UINT32, /*value=*/ 0).as(
        Opcode.SET_8,
        Set.wireFormat8,
      ),
    );
  }

  outerInstructions.push(
    new Sha256Compression(/*addressing_mode=*/ 0, /*outputOffset=*/ 34, /*stateOffset=*/ 10, /*inputsOffset=*/ 18),
    new Return(/*addressing_mode=*/ 0, /*copySizeOffset=*/ 0, /*returnOffset=*/ 0),
  );

  const innerContract = await deployCustomBytecode(innerBytecode, tester, 'BitwiseSha256CollisionInner');
  const outerContract = await deployCustomBytecode(
    encodeToBytecode(outerInstructions),
    tester,
    'BitwiseSha256CollisionOuter',
  );
  return { innerContract, outerContract };
}
