import { type Bufferable, serializeToBuffer } from '@aztec/foundation/serialize';

import { AvmExecutionError, AvmParsingError, InvalidOpcodeError, InvalidProgramCounterError } from '../errors.js';
import {
  Add,
  And,
  Call,
  CalldataCopy,
  Cast,
  DebugLog,
  Div,
  EcAdd,
  EmitNoteHash,
  EmitNullifier,
  EmitUnencryptedLog,
  Eq,
  FieldDiv,
  GetContractInstance,
  GetEnvVar,
  Instruction,
  InternalCall,
  InternalReturn,
  Jump,
  JumpI,
  KeccakF1600,
  L1ToL2MessageExists,
  Lt,
  Lte,
  Mov,
  Mul,
  Not,
  NoteHashExists,
  NullifierExists,
  Or,
  Poseidon2,
  Return,
  ReturndataCopy,
  ReturndataSize,
  Revert,
  SLoad,
  SStore,
  SendL2ToL1Message,
  Set,
  Sha256Compression,
  Shl,
  Shr,
  StaticCall,
  Sub,
  SuccessCopy,
  ToRadixBE,
  Xor,
} from '../opcodes/index.js';
import { BufferCursor } from './buffer_cursor.js';
import { MAX_OPCODE_VALUE, Opcode } from './instruction_serialization.js';

export type InstructionDeserializer = (buf: BufferCursor | Buffer) => Instruction;

export interface Deserializable {
  deserialize: InstructionDeserializer;
}

export type InstructionSet = Map<Opcode, InstructionDeserializer>;
export const INSTRUCTION_SET = new Map<Opcode, InstructionDeserializer>([
  [Opcode.ADD_8, Add.as(Add.wireFormat8).fromBuffer],
  [Opcode.ADD_16, Add.as(Add.wireFormat16).fromBuffer],
  [Opcode.SUB_8, Sub.as(Sub.wireFormat8).fromBuffer],
  [Opcode.SUB_16, Sub.as(Sub.wireFormat16).fromBuffer],
  [Opcode.MUL_8, Mul.as(Mul.wireFormat8).fromBuffer],
  [Opcode.MUL_16, Mul.as(Mul.wireFormat16).fromBuffer],
  [Opcode.DIV_8, Div.as(Div.wireFormat8).fromBuffer],
  [Opcode.DIV_16, Div.as(Div.wireFormat16).fromBuffer],
  [Opcode.FDIV_8, FieldDiv.as(FieldDiv.wireFormat8).fromBuffer],
  [Opcode.FDIV_16, FieldDiv.as(FieldDiv.wireFormat16).fromBuffer],
  [Opcode.EQ_8, Eq.as(Eq.wireFormat8).fromBuffer],
  [Opcode.EQ_16, Eq.as(Eq.wireFormat16).fromBuffer],
  [Opcode.LT_8, Lt.as(Lt.wireFormat8).fromBuffer],
  [Opcode.LT_16, Lt.as(Lt.wireFormat16).fromBuffer],
  [Opcode.LTE_8, Lte.as(Lte.wireFormat8).fromBuffer],
  [Opcode.LTE_16, Lte.as(Lte.wireFormat16).fromBuffer],
  [Opcode.AND_8, And.as(And.wireFormat8).fromBuffer],
  [Opcode.AND_16, And.as(And.wireFormat16).fromBuffer],
  [Opcode.OR_8, Or.as(Or.wireFormat8).fromBuffer],
  [Opcode.OR_16, Or.as(Or.wireFormat16).fromBuffer],
  [Opcode.XOR_8, Xor.as(Xor.wireFormat8).fromBuffer],
  [Opcode.XOR_16, Xor.as(Xor.wireFormat16).fromBuffer],
  [Opcode.NOT_8, Not.as(Not.wireFormat8).fromBuffer],
  [Opcode.NOT_16, Not.as(Not.wireFormat16).fromBuffer],
  [Opcode.SHL_8, Shl.as(Shl.wireFormat8).fromBuffer],
  [Opcode.SHL_16, Shl.as(Shl.wireFormat16).fromBuffer],
  [Opcode.SHR_8, Shr.as(Shr.wireFormat8).fromBuffer],
  [Opcode.SHR_16, Shr.as(Shr.wireFormat16).fromBuffer],
  [Opcode.CAST_8, Cast.as(Cast.wireFormat8).fromBuffer],
  [Opcode.CAST_16, Cast.as(Cast.wireFormat16).fromBuffer],
  // Execution Environment
  [Opcode.GETENVVAR_16, GetEnvVar.as(GetEnvVar.wireFormat16).fromBuffer],
  [CalldataCopy.opcode, Instruction.fromBuffer.bind(CalldataCopy)],
  [SuccessCopy.opcode, Instruction.fromBuffer.bind(SuccessCopy)],
  [Opcode.RETURNDATASIZE, Instruction.fromBuffer.bind(ReturndataSize)],
  [Opcode.RETURNDATACOPY, Instruction.fromBuffer.bind(ReturndataCopy)],

  // Machine State - Internal Control Flow
  [Jump.opcode, Instruction.fromBuffer.bind(Jump)],
  [JumpI.opcode, Instruction.fromBuffer.bind(JumpI)],
  [InternalCall.opcode, Instruction.fromBuffer.bind(InternalCall)],
  [InternalReturn.opcode, Instruction.fromBuffer.bind(InternalReturn)],
  [Opcode.SET_8, Set.as(Set.wireFormat8).fromBuffer],
  [Opcode.SET_16, Set.as(Set.wireFormat16).fromBuffer],
  [Opcode.SET_32, Set.as(Set.wireFormat32).fromBuffer],
  [Opcode.SET_64, Set.as(Set.wireFormat64).fromBuffer],
  [Opcode.SET_128, Set.as(Set.wireFormat128).fromBuffer],
  [Opcode.SET_FF, Set.as(Set.wireFormatFF).fromBuffer],
  [Opcode.MOV_8, Mov.as(Mov.wireFormat8).fromBuffer],
  [Opcode.MOV_16, Mov.as(Mov.wireFormat16).fromBuffer],

  // World State
  [SLoad.opcode, Instruction.fromBuffer.bind(SLoad)], // Public Storage
  [SStore.opcode, Instruction.fromBuffer.bind(SStore)], // Public Storage
  [NoteHashExists.opcode, Instruction.fromBuffer.bind(NoteHashExists)], // Notes & Nullifiers
  [EmitNoteHash.opcode, Instruction.fromBuffer.bind(EmitNoteHash)], // Notes & Nullifiers
  [NullifierExists.opcode, Instruction.fromBuffer.bind(NullifierExists)], // Notes & Nullifiers
  [EmitNullifier.opcode, Instruction.fromBuffer.bind(EmitNullifier)], // Notes & Nullifiers
  [L1ToL2MessageExists.opcode, Instruction.fromBuffer.bind(L1ToL2MessageExists)], // Messages

  // Accrued Substate
  [EmitUnencryptedLog.opcode, Instruction.fromBuffer.bind(EmitUnencryptedLog)],
  [SendL2ToL1Message.opcode, Instruction.fromBuffer.bind(SendL2ToL1Message)],
  [GetContractInstance.opcode, Instruction.fromBuffer.bind(GetContractInstance)],

  // Control Flow - Contract Calls
  [Call.opcode, Instruction.fromBuffer.bind(Call)],
  [StaticCall.opcode, Instruction.fromBuffer.bind(StaticCall)],
  [Return.opcode, Instruction.fromBuffer.bind(Return)],
  [Opcode.REVERT_8, Revert.as(Revert.wireFormat8).fromBuffer],
  [Opcode.REVERT_16, Revert.as(Revert.wireFormat16).fromBuffer],

  // Misc
  [DebugLog.opcode, Instruction.fromBuffer.bind(DebugLog)],

  // Gadgets
  [EcAdd.opcode, Instruction.fromBuffer.bind(EcAdd)],
  [Poseidon2.opcode, Instruction.fromBuffer.bind(Poseidon2)],
  [Sha256Compression.opcode, Instruction.fromBuffer.bind(Sha256Compression)],
  [KeccakF1600.opcode, Instruction.fromBuffer.bind(KeccakF1600)],

  // Conversions
  [ToRadixBE.opcode, Instruction.fromBuffer.bind(ToRadixBE)],
]);

/**
 * Serializes an array of instructions to bytecode.
 */
export function encodeToBytecode(instructions: Bufferable[]): Buffer {
  return serializeToBuffer(instructions);
}

// For testing only
export function decodeFromBytecode(bytecode: Buffer, instructionSet: InstructionSet = INSTRUCTION_SET): Instruction[] {
  const instructions: Instruction[] = [];
  let pc = 0;
  while (pc < bytecode.length) {
    const [instruction, bytesConsumed] = decodeInstructionFromBytecode(bytecode, pc, instructionSet);
    instructions.push(instruction);
    pc += bytesConsumed;
  }
  return instructions;
}

// Returns the instruction and the number of bytes consumed.
export function decodeInstructionFromBytecode(
  bytecode: Buffer,
  pc: number,
  instructionSet: InstructionSet = INSTRUCTION_SET,
): [Instruction, number] {
  if (pc >= bytecode.length) {
    throw new InvalidProgramCounterError(pc, bytecode.length);
  }

  try {
    const cursor = new BufferCursor(bytecode, pc);
    const startingPosition = cursor.position();
    const opcode: number = cursor.bufferAtPosition().readUint8(); // peek.

    if (opcode > MAX_OPCODE_VALUE) {
      throw new InvalidOpcodeError(
        `Opcode ${opcode} (0x${opcode.toString(16)}) value is not in the range of valid opcodes.`,
      );
    }

    const instructionDeserializerOrUndef = instructionSet.get(opcode);
    if (instructionDeserializerOrUndef === undefined) {
      throw new InvalidOpcodeError(`Opcode ${Opcode[opcode]} (0x${opcode.toString(16)}) is not implemented`);
    }

    const instructionDeserializer: InstructionDeserializer = instructionDeserializerOrUndef;
    const instruction = instructionDeserializer(cursor);
    return [instruction, cursor.position() - startingPosition];
  } catch (error) {
    if (error instanceof InvalidOpcodeError || error instanceof AvmExecutionError) {
      throw error;
    } else {
      throw new AvmParsingError(`${error}`);
    }
  }
}
