import { BufferCursor } from './buffer_cursor.js';
import { Add, Sub } from './opcodes/index.js';
import { Instruction } from './opcodes/instruction.js';
import { Opcode } from './opcodes/instruction_serialization.js';

export interface DeserializableInstruction {
  deserialize(buf: BufferCursor): Instruction;
}

export type InstructionSet = Map<Opcode, DeserializableInstruction>;
const INSTRUCTION_SET: InstructionSet = new Map<Opcode, DeserializableInstruction>(
  [
    // new Array<[Opcode, InstructionConstructorAndMembers]>(
    // Compute
    // Compute - Arithmetic
    [Add.opcode, Add],
    [Sub.opcode, Sub],
    // [Opcode.SUB, Sub],
    // [Opcode.MUL, Mul],
    // [Opcode.DIV, Div],
    // //// Compute - Comparators
    // //[Opcode.EQ, Eq],
    // //[Opcode.LT, Lt],
    // //[Opcode.LTE, Lte],
    // //// Compute - Bitwise
    // [Opcode.AND, And],
    // [Opcode.OR, Or],
    // [Opcode.XOR, Xor],
    // [Opcode.NOT, Not],
    // [Opcode.SHL, Shl],
    // [Opcode.SHR, Shr],
    // //// Compute - Type Conversions
    // [Opcode.CAST, Cast],

    // //// Execution Environment
    // //[Opcode.ADDRESS, Address],
    // //[Opcode.STORAGEADDRESS, Storageaddress],
    // //[Opcode.ORIGIN, Origin],
    // //[Opcode.SENDER, Sender],
    // //[Opcode.PORTAL, Portal],
    // //[Opcode.FEEPERL1GAS, Feeperl1gas],
    // //[Opcode.FEEPERL2GAS, Feeperl2gas],
    // //[Opcode.FEEPERDAGAS, Feeperdagas],
    // //[Opcode.CONTRACTCALLDEPTH, Contractcalldepth],
    // //// Execution Environment - Globals
    // //[Opcode.CHAINID, Chainid],
    // //[Opcode.VERSION, Version],
    // //[Opcode.BLOCKNUMBER, Blocknumber],
    // //[Opcode.TIMESTAMP, Timestamp],
    // //[Opcode.COINBASE, Coinbase],
    // //[Opcode.BLOCKL1GASLIMIT, Blockl1gaslimit],
    // //[Opcode.BLOCKL2GASLIMIT, Blockl2gaslimit],
    // //[Opcode.BLOCKDAGASLIMIT, Blockdagaslimit],
    // // Execution Environment - Calldata
    // [Opcode.CALLDATACOPY, CalldataCopy],

    // //// Machine State
    // // Machine State - Gas
    // //[Opcode.L1GASLEFT, L1gasleft],
    // //[Opcode.L2GASLEFT, L2gasleft],
    // //[Opcode.DAGASLEFT, Dagasleft],
    // //// Machine State - Internal Control Flow
    // [Opcode.JUMP, Jump],
    // [Opcode.JUMPI, JumpI],
    // [Opcode.INTERNALCALL, InternalCall],
    // [Opcode.INTERNALRETURN, InternalReturn],
    // //// Machine State - Memory
    // [Opcode.SET, Set],
    // [Opcode.MOV, Mov],
    // [Opcode.CMOV, CMov],

    // //// World State
    // //[Opcode.BLOCKHEADERBYNUMBER, Blockheaderbynumber],
    // [Opcode.SLOAD, SLoad], // Public Storage
    // [Opcode.SSTORE, SStore], // Public Storage
    // //[Opcode.READL1TOL2MSG, Readl1tol2msg], // Messages
    // //[Opcode.SENDL2TOL1MSG, Sendl2tol1msg], // Messages
    // //[Opcode.EMITNOTEHASH, Emitnotehash], // Notes & Nullifiers
    // //[Opcode.EMITNULLIFIER, Emitnullifier], // Notes & Nullifiers

    // //// Accrued Substate
    // //[Opcode.EMITUNENCRYPTEDLOG, Emitunencryptedlog],

    // //// Control Flow - Contract Calls
    // // [Opcode.CALL, Call],
    // //[Opcode.STATICCALL, Staticcall],
    // [Opcode.RETURN, Return],
    // //[Opcode.REVERT, Revert],

    // //// Gadgets
    // //[Opcode.KECCAK, Keccak],
    // //[Opcode.POSEIDON, Poseidon],
  ], //),
);

/**
 * Encode an instruction (opcode & arguments) to bytecode.
 * @param opcode - the opcode to encode
 * @param args - the arguments to encode
 * @returns the bytecode for this one instruction
 */
// export function encodeToBytecode(opcode: Opcode, args: number[]): Buffer {
//   const instructionType = INSTRUCTION_SET.get(opcode);
//   if (instructionType === undefined) {
//     throw new Error(`Opcode 0x${opcode.toString(16)} not implemented`);
//   }

//   const numberOfOperands = instructionType.numberOfOperands;
//   if (args.length !== numberOfOperands) {
//     throw new Error(
//       `Opcode 0x${opcode.toString(16)} expects ${numberOfOperands} arguments, but ${args.length} were provided`,
//     );
//   }

//   const bytecode = Buffer.alloc(AVM_OPCODE_BYTE_LENGTH + numberOfOperands * AVM_OPERAND_BYTE_LENGTH);

//   let bytePtr = 0;
//   bytecode.writeUInt8(opcode as number, bytePtr);
//   bytePtr += AVM_OPCODE_BYTE_LENGTH;
//   for (let i = 0; i < args.length; i++) {
//     bytecode.writeUInt32BE(args[i], bytePtr);
//     bytePtr += AVM_OPERAND_BYTE_LENGTH;
//   }
//   return bytecode;
// }

/**
 * Convert a buffer of bytecode into an array of instructions
 * @param bytecode - Buffer of bytecode
 * @returns Bytecode decoded into an ordered array of Instructions
 */
export function decodeBytecode(bytecode: Buffer, instructionSet: InstructionSet = INSTRUCTION_SET): Instruction[] {
  const instructions: Instruction[] = [];
  const cursor = new BufferCursor(bytecode);

  while (!cursor.eof()) {
    const opcode: Opcode = cursor.readUint8();
    const instructionDeserializerOrUndef = instructionSet.get(opcode);
    if (instructionDeserializerOrUndef === undefined) {
      throw new Error(`Opcode 0x${opcode.toString(16)} not implemented`);
    }

    const instructionDeserializer: DeserializableInstruction = instructionDeserializerOrUndef;
    const i: Instruction = instructionDeserializer.deserialize(cursor);
    instructions.push(i);
  }

  return instructions;
}
