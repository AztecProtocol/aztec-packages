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
  ToRadixBE,
  Xor,
} from '../opcodes/index.js';
import { MultiScalarMul } from '../opcodes/multi_scalar_mul.js';
import { BufferCursor } from './buffer_cursor.js';
import { Opcode } from './instruction_serialization.js';

export type InstructionDeserializer = (buf: BufferCursor | Buffer) => Instruction;

export interface Serializable {
  serialize(): Buffer;
}

export interface Deserializable {
  deserialize: InstructionDeserializer;
}

export type InstructionSet = Map<Opcode, InstructionDeserializer>;
// TODO(4359): This is a function so that Call and StaticCall can be lazily resolved.
// This is a temporary solution until we solve the dependency cycle.
const INSTRUCTION_SET = () =>
  new Map<Opcode, InstructionDeserializer>([
    [Opcode.ADD_8, Add.as(Add.wireFormat8).deserialize],
    [Opcode.ADD_16, Add.as(Add.wireFormat16).deserialize],
    [Opcode.SUB_8, Sub.as(Sub.wireFormat8).deserialize],
    [Opcode.SUB_16, Sub.as(Sub.wireFormat16).deserialize],
    [Opcode.MUL_8, Mul.as(Mul.wireFormat8).deserialize],
    [Opcode.MUL_16, Mul.as(Mul.wireFormat16).deserialize],
    [Opcode.DIV_8, Div.as(Div.wireFormat8).deserialize],
    [Opcode.DIV_16, Div.as(Div.wireFormat16).deserialize],
    [Opcode.FDIV_8, FieldDiv.as(FieldDiv.wireFormat8).deserialize],
    [Opcode.FDIV_16, FieldDiv.as(FieldDiv.wireFormat16).deserialize],
    [Opcode.EQ_8, Eq.as(Eq.wireFormat8).deserialize],
    [Opcode.EQ_16, Eq.as(Eq.wireFormat16).deserialize],
    [Opcode.LT_8, Lt.as(Lt.wireFormat8).deserialize],
    [Opcode.LT_16, Lt.as(Lt.wireFormat16).deserialize],
    [Opcode.LTE_8, Lte.as(Lte.wireFormat8).deserialize],
    [Opcode.LTE_16, Lte.as(Lte.wireFormat16).deserialize],
    [Opcode.AND_8, And.as(And.wireFormat8).deserialize],
    [Opcode.AND_16, And.as(And.wireFormat16).deserialize],
    [Opcode.OR_8, Or.as(Or.wireFormat8).deserialize],
    [Opcode.OR_16, Or.as(Or.wireFormat16).deserialize],
    [Opcode.XOR_8, Xor.as(Xor.wireFormat8).deserialize],
    [Opcode.XOR_16, Xor.as(Xor.wireFormat16).deserialize],
    [Opcode.NOT_8, Not.as(Not.wireFormat8).deserialize],
    [Opcode.NOT_16, Not.as(Not.wireFormat16).deserialize],
    [Opcode.SHL_8, Shl.as(Shl.wireFormat8).deserialize],
    [Opcode.SHL_16, Shl.as(Shl.wireFormat16).deserialize],
    [Opcode.SHR_8, Shr.as(Shr.wireFormat8).deserialize],
    [Opcode.SHR_16, Shr.as(Shr.wireFormat16).deserialize],
    [Opcode.CAST_8, Cast.as(Cast.wireFormat8).deserialize],
    [Opcode.CAST_16, Cast.as(Cast.wireFormat16).deserialize],
    // Execution Environment
    [Opcode.GETENVVAR_16, GetEnvVar.as(GetEnvVar.wireFormat16).deserialize],
    [CalldataCopy.opcode, Instruction.deserialize.bind(CalldataCopy)],

    // Machine State - Internal Control Flow
    [Jump.opcode, Instruction.deserialize.bind(Jump)],
    [JumpI.opcode, Instruction.deserialize.bind(JumpI)],
    [InternalCall.opcode, Instruction.deserialize.bind(InternalCall)],
    [InternalReturn.opcode, Instruction.deserialize.bind(InternalReturn)],
    [Opcode.SET_8, Set.as(Set.wireFormat8).deserialize],
    [Opcode.SET_16, Set.as(Set.wireFormat16).deserialize],
    [Opcode.SET_32, Set.as(Set.wireFormat32).deserialize],
    [Opcode.SET_64, Set.as(Set.wireFormat64).deserialize],
    [Opcode.SET_128, Set.as(Set.wireFormat128).deserialize],
    [Opcode.SET_FF, Set.as(Set.wireFormatFF).deserialize],
    [Opcode.MOV_8, Mov.as(Mov.wireFormat8).deserialize],
    [Opcode.MOV_16, Mov.as(Mov.wireFormat16).deserialize],

    // World State
    [SLoad.opcode, Instruction.deserialize.bind(SLoad)], // Public Storage
    [SStore.opcode, Instruction.deserialize.bind(SStore)], // Public Storage
    [NoteHashExists.opcode, Instruction.deserialize.bind(NoteHashExists)], // Notes & Nullifiers
    [EmitNoteHash.opcode, Instruction.deserialize.bind(EmitNoteHash)], // Notes & Nullifiers
    [NullifierExists.opcode, Instruction.deserialize.bind(NullifierExists)], // Notes & Nullifiers
    [EmitNullifier.opcode, Instruction.deserialize.bind(EmitNullifier)], // Notes & Nullifiers
    [L1ToL2MessageExists.opcode, Instruction.deserialize.bind(L1ToL2MessageExists)], // Messages

    // Accrued Substate
    [EmitUnencryptedLog.opcode, Instruction.deserialize.bind(EmitUnencryptedLog)],
    [SendL2ToL1Message.opcode, Instruction.deserialize.bind(SendL2ToL1Message)],
    [GetContractInstance.opcode, Instruction.deserialize.bind(GetContractInstance)],

    // Control Flow - Contract Calls
    [Call.opcode, Instruction.deserialize.bind(Call)],
    [StaticCall.opcode, Instruction.deserialize.bind(StaticCall)],
    [Return.opcode, Instruction.deserialize.bind(Return)],
    [Opcode.REVERT_8, Revert.as(Revert.wireFormat8).deserialize],
    [Opcode.REVERT_16, Revert.as(Revert.wireFormat16).deserialize],

    // Misc
    [DebugLog.opcode, Instruction.deserialize.bind(DebugLog)],

    // Gadgets
    [EcAdd.opcode, Instruction.deserialize.bind(EcAdd)],
    [Poseidon2.opcode, Instruction.deserialize.bind(Poseidon2)],
    [Sha256Compression.opcode, Instruction.deserialize.bind(Sha256Compression)],
    [MultiScalarMul.opcode, Instruction.deserialize.bind(MultiScalarMul)],
    // Conversions
    [ToRadixBE.opcode, Instruction.deserialize.bind(ToRadixBE)],
    // Future Gadgets -- pending changes in noir
    // SHA256COMPRESSION,
    [KeccakF1600.opcode, Instruction.deserialize.bind(KeccakF1600)],
  ]);

/**
 * Serializes an array of instructions to bytecode.
 */
export function encodeToBytecode(instructions: Serializable[]): Buffer {
  return Buffer.concat(instructions.map(i => i.serialize()));
}

/**
 * Convert a buffer of bytecode into an array of instructions.
 * @param bytecode Buffer of bytecode.
 * @param instructionSet Optional {@code InstructionSet} to be used for deserialization.
 * @returns Bytecode decoded into an ordered array of Instructions
 */
export function decodeFromBytecode(
  bytecode: Buffer,
  instructionSet: InstructionSet = INSTRUCTION_SET(),
): Instruction[] {
  const instructions: Instruction[] = [];
  const cursor = new BufferCursor(bytecode);

  while (!cursor.eof()) {
    const opcode: Opcode = cursor.bufferAtPosition().readUint8(); // peek.
    const instructionDeserializerOrUndef = instructionSet.get(opcode);
    if (instructionDeserializerOrUndef === undefined) {
      throw new Error(`Opcode ${Opcode[opcode]} (0x${opcode.toString(16)}) not implemented`);
    }

    const instructionDeserializer: InstructionDeserializer = instructionDeserializerOrUndef;
    const i: Instruction = instructionDeserializer(cursor);
    instructions.push(i);
  }

  return instructions;
}
