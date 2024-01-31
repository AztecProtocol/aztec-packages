import {
  Add,
  And,
  CMov,
  Call,
  CalldataCopy,
  Cast,
  Div,
  Eq,
  InternalCall,
  InternalReturn,
  Jump,
  JumpI,
  Lt,
  Lte,
  Mov,
  Mul,
  Not,
  Or,
  Return,
  Revert,
  SLoad,
  SStore,
  Set,
  Shl,
  Shr,
  StaticCall,
  Sub,
  Xor,
} from '../opcodes/index.js';
import { Instruction } from '../opcodes/instruction.js';
import { BufferCursor } from './buffer_cursor.js';
import { Opcode } from './instruction_serialization.js';

interface DeserializableInstruction {
  deserialize(buf: BufferCursor | Buffer): Instruction;
  opcode: Opcode;
}

export type InstructionSet = Map<Opcode, DeserializableInstruction>;
const INSTRUCTION_SET: InstructionSet = new Map<Opcode, DeserializableInstruction>(
  [
    [Add.opcode, Add],
    [Sub.opcode, Sub],
    [Sub.opcode, Sub],
    [Mul.opcode, Mul],
    [Div.opcode, Div],
    [Eq.opcode, Eq],
    [Lt.opcode, Lt],
    [Lte.opcode, Lte],
    [And.opcode, And],
    [Or.opcode, Or],
    [Xor.opcode, Xor],
    [Not.opcode, Not],
    [Shl.opcode, Shl],
    [Shr.opcode, Shr],
    [Cast.opcode, Cast],
    // //// Execution Environment
    // //[Address.opcode, Address],
    // //[Storageaddress.opcode, Storageaddress],
    // //[Origin.opcode, Origin],
    // //[Sender.opcode, Sender],
    // //[Portal.opcode, Portal],
    // //[Feeperl1gas.opcode, Feeperl1gas],
    // //[Feeperl2gas.opcode, Feeperl2gas],
    // //[Feeperdagas.opcode, Feeperdagas],
    // //[Contractcalldepth.opcode, Contractcalldepth],
    // //// Execution Environment - Globals
    // //[Chainid.opcode, Chainid],
    // //[Version.opcode, Version],
    // //[Blocknumber.opcode, Blocknumber],
    // //[Timestamp.opcode, Timestamp],
    // //[Coinbase.opcode, Coinbase],
    // //[Blockl1gaslimit.opcode, Blockl1gaslimit],
    // //[Blockl2gaslimit.opcode, Blockl2gaslimit],
    // //[Blockdagaslimit.opcode, Blockdagaslimit],
    // // Execution Environment - Calldata
    [CalldataCopy.opcode, CalldataCopy],

    // //// Machine State
    // // Machine State - Gas
    // //[L1gasleft.opcode, L1gasleft],
    // //[L2gasleft.opcode, L2gasleft],
    // //[Dagasleft.opcode, Dagasleft],
    // //// Machine State - Internal Control Flow
    [Jump.opcode, Jump],
    [JumpI.opcode, JumpI],
    [InternalCall.opcode, InternalCall],
    [InternalReturn.opcode, InternalReturn],
    [Set.opcode, Set],
    [Mov.opcode, Mov],
    [CMov.opcode, CMov],

    // //// World State
    // //[Blockheaderbynumber.opcode, Blockheaderbynumber],
    [SLoad.opcode, SLoad], // Public Storage
    [SStore.opcode, SStore], // Public Storage
    // //[Readl1tol2msg.opcode, Readl1tol2msg], // Messages
    // //[Sendl2tol1msg.opcode, Sendl2tol1msg], // Messages
    // //[Emitnotehash.opcode, Emitnotehash], // Notes & Nullifiers
    // //[Emitnullifier.opcode, Emitnullifier], // Notes & Nullifiers

    // //// Accrued Substate
    // //[Emitunencryptedlog.opcode, Emitunencryptedlog],

    // //// Control Flow - Contract Calls
    [Call.opcode, Call],
    [StaticCall.opcode, StaticCall],
    [Return.opcode, Return],
    [Revert.opcode, Revert],

    // //// Gadgets
    // //[Keccak.opcode, Keccak],
    // //[Poseidon.opcode, Poseidon],
  ], //),
);

interface Serializable {
  serialize(): Buffer;
}

/**
 * TODO: doc
 * @param opcode - the opcode to encode
 * @param args - the arguments to encode
 * @returns the bytecode for this one instruction
 */
export function encodeToBytecode(instructions: Serializable[]): Buffer {
  return Buffer.concat(instructions.map(i => i.serialize()));
}

/**
 * Convert a buffer of bytecode into an array of instructions
 * @param bytecode - Buffer of bytecode
 * @returns Bytecode decoded into an ordered array of Instructions
 */
export function decodeFromBytecode(bytecode: Buffer, instructionSet: InstructionSet = INSTRUCTION_SET): Instruction[] {
  const instructions: Instruction[] = [];
  const cursor = new BufferCursor(bytecode);

  while (!cursor.eof()) {
    const opcode: Opcode = cursor.bufferAtPosition().readUint8(); // peek.
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
