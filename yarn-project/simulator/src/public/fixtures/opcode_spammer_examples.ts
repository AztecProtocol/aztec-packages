import {
  AVM_ADD_BASE_L2_GAS,
  AVM_AND_BASE_L2_GAS,
  AVM_BITWISE_DYN_L2_GAS,
  AVM_CALLDATACOPY_BASE_L2_GAS,
  AVM_CALLDATACOPY_DYN_L2_GAS,
  AVM_CALL_BASE_L2_GAS,
  AVM_CAST_BASE_L2_GAS,
  AVM_DEBUGLOG_BASE_L2_GAS,
  AVM_DIV_BASE_L2_GAS,
  AVM_ECADD_BASE_L2_GAS,
  AVM_EMITNOTEHASH_BASE_L2_GAS,
  AVM_EMITUNENCRYPTEDLOG_BASE_L2_GAS,
  AVM_EQ_BASE_L2_GAS,
  AVM_FDIV_BASE_L2_GAS,
  AVM_GETCONTRACTINSTANCE_BASE_L2_GAS,
  AVM_GETENVVAR_BASE_L2_GAS,
  AVM_INTERNALCALL_BASE_L2_GAS,
  AVM_JUMPI_BASE_L2_GAS,
  AVM_JUMP_BASE_L2_GAS,
  AVM_KECCAKF1600_BASE_L2_GAS,
  AVM_L1TOL2MSGEXISTS_BASE_L2_GAS,
  AVM_LTE_BASE_L2_GAS,
  AVM_LT_BASE_L2_GAS,
  AVM_MOV_BASE_L2_GAS,
  AVM_MUL_BASE_L2_GAS,
  AVM_NOTEHASHEXISTS_BASE_L2_GAS,
  AVM_NOT_BASE_L2_GAS,
  AVM_NULLIFIEREXISTS_BASE_L2_GAS,
  AVM_OR_BASE_L2_GAS,
  AVM_POSEIDON2_BASE_L2_GAS,
  AVM_RETURNDATACOPY_BASE_L2_GAS,
  AVM_RETURNDATACOPY_DYN_L2_GAS,
  AVM_RETURNDATASIZE_BASE_L2_GAS,
  AVM_SENDL2TOL1MSG_BASE_L2_GAS,
  AVM_SET_BASE_L2_GAS,
  AVM_SHA256COMPRESSION_BASE_L2_GAS,
  AVM_SHL_BASE_L2_GAS,
  AVM_SHR_BASE_L2_GAS,
  AVM_SLOAD_BASE_L2_GAS,
  AVM_SSTORE_BASE_L2_GAS,
  AVM_STATICCALL_BASE_L2_GAS,
  AVM_SUB_BASE_L2_GAS,
  AVM_SUCCESSCOPY_BASE_L2_GAS,
  AVM_TORADIXBE_BASE_L2_GAS,
  AVM_TORADIXBE_DYN_L2_GAS,
  AVM_XOR_BASE_L2_GAS,
} from '@aztec/constants';

import { TypeTag } from '../avm/avm_memory_types.js';
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
  EmitUnencryptedLog,
  Eq,
  FieldDiv,
  GetContractInstance,
  GetEnvVar,
  InternalCall,
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
  ReturndataCopy,
  ReturndataSize,
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
} from '../avm/opcodes/index.js';
import { Opcode } from '../avm/serialization/instruction_serialization.js';
import type { PublicTxResult } from '../public_tx_simulator/public_tx_simulator.js';
import { type OpcodeSpamConfig, OpcodeSpammer } from './opcode_spammer.js';
import type { PublicTxSimulationTester } from './public_tx_simulation_tester.js';

// ===========================================
// COMPREHENSIVE OPCODE CONFIGS
// ===========================================

/**
 * Comprehensive configuration object containing spam configs for all supported AVM opcodes.
 * Use this with executeOpcodeSpam() for cleaner, more maintainable code.
 *
 * Usage:
 * // Bounded loop (uses max operations within gas limit)
 * const result = await executeOpcodeSpam(Opcode.ADD_8, tester);
 *
 * // Infinite loop (runs until gas exhaustion)
 * const result = await executeOpcodeSpam(Opcode.ADD_8, tester, true);
 *
 * // Direct config usage (advanced)
 * const config = OPCODE_SPAM_CONFIGS[Opcode.ADD_8];
 * const instructions = OpcodeSpammer.createSpamInstructions(config, undefined, tester);
 * const result = await OpcodeSpammer.executeAsContract(tester, 'TestContract', instructions);
 */
export const OPCODE_SPAM_CONFIGS: Partial<Record<Opcode, Omit<OpcodeSpamConfig, 'opcodeName'>>> = {
  // ===========================================
  // ARITHMETIC OPCODES
  // ===========================================
  [Opcode.ADD_8]: {
    createInstruction: () => new Add(0, 0, 1, 2).as(Opcode.ADD_8, Add.wireFormat8),
    gasPerOp: AVM_ADD_BASE_L2_GAS,
    inputRanges: [
      { size: 2, typeTag: TypeTag.UINT64 }, // Two operands at offsets 0,1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Result at offset 2
    ],
  },

  [Opcode.SUB_8]: {
    createInstruction: () => new Sub(0, 0, 1, 2).as(Opcode.SUB_8, Sub.wireFormat8),
    gasPerOp: AVM_SUB_BASE_L2_GAS,
    inputRanges: [
      { size: 2, typeTag: TypeTag.UINT64 }, // Two operands at offsets 0,1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Result at offset 2
    ],
  },

  [Opcode.MUL_8]: {
    createInstruction: () => new Mul(0, 0, 1, 2).as(Opcode.MUL_8, Mul.wireFormat8),
    gasPerOp: AVM_MUL_BASE_L2_GAS,
    inputRanges: [
      { size: 2, typeTag: TypeTag.UINT64 }, // Two operands at offsets 0,1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Result at offset 2
    ],
  },

  [Opcode.DIV_8]: {
    createInstruction: () => new Div(0, 0, 1, 2).as(Opcode.DIV_8, Div.wireFormat8),
    gasPerOp: AVM_DIV_BASE_L2_GAS,
    inputRanges: [
      { size: 2, typeTag: TypeTag.UINT64 }, // Dividend and divisor at offsets 0,1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Result at offset 2 (separate from inputs)
    ],
  },

  [Opcode.FDIV_8]: {
    createInstruction: () => new FieldDiv(0, 0, 1, 2).as(Opcode.FDIV_8, FieldDiv.wireFormat8),
    gasPerOp: AVM_FDIV_BASE_L2_GAS,
    inputRanges: [
      { size: 2, typeTag: TypeTag.FIELD }, // Two field operands at offsets 0,1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.FIELD }, // Result at offset 2
    ],
  },

  // ===========================================
  // BITWISE OPCODES
  // ===========================================
  [Opcode.AND_8]: {
    createInstruction: () => new And(0, 0, 1, 2).as(Opcode.AND_8, And.wireFormat8),
    gasPerOp: AVM_AND_BASE_L2_GAS + AVM_BITWISE_DYN_L2_GAS * 8, // 8 bytes for UINT64
    inputRanges: [
      { size: 2, typeTag: TypeTag.UINT64 }, // Two operands at offsets 0,1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Result at offset 2
    ],
  },

  [Opcode.OR_8]: {
    createInstruction: () => new Or(0, 0, 1, 2).as(Opcode.OR_8, Or.wireFormat8),
    gasPerOp: AVM_OR_BASE_L2_GAS + AVM_BITWISE_DYN_L2_GAS * 8, // 8 bytes for UINT64
    inputRanges: [
      { size: 2, typeTag: TypeTag.UINT64 }, // Two operands at offsets 0,1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Result at offset 2
    ],
  },

  [Opcode.XOR_8]: {
    createInstruction: () => new Xor(0, 0, 1, 2).as(Opcode.XOR_8, Xor.wireFormat8),
    gasPerOp: AVM_XOR_BASE_L2_GAS + AVM_BITWISE_DYN_L2_GAS * 8, // 8 bytes for UINT64
    inputRanges: [
      { size: 2, typeTag: TypeTag.UINT64 }, // Two operands for XOR at offsets 0,1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Result at offset 2
    ],
  },

  [Opcode.NOT_8]: {
    createInstruction: () => new Not(0, 0, 1).as(Opcode.NOT_8, Not.wireFormat8),
    gasPerOp: AVM_NOT_BASE_L2_GAS,
    inputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // One operand at offset 0
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Result at offset 1
    ],
  },

  [Opcode.SHL_8]: {
    createInstruction: () => new Shl(0, 0, 1, 2).as(Opcode.SHL_8, Shl.wireFormat8),
    gasPerOp: AVM_SHL_BASE_L2_GAS,
    inputRanges: [
      { size: 2, typeTag: TypeTag.UINT64 }, // Value and shift amount at offsets 0,1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Result at offset 2
    ],
  },

  [Opcode.SHR_8]: {
    createInstruction: () => new Shr(0, 0, 1, 2).as(Opcode.SHR_8, Shr.wireFormat8),
    gasPerOp: AVM_SHR_BASE_L2_GAS,
    inputRanges: [
      { size: 2, typeTag: TypeTag.UINT64 }, // Value and shift amount at offsets 0,1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Result at offset 2
    ],
  },

  // ===========================================
  // COMPARISON OPCODES
  // ===========================================
  [Opcode.EQ_8]: {
    createInstruction: () => new Eq(0, 0, 1, 2).as(Opcode.EQ_8, Eq.wireFormat8),
    gasPerOp: AVM_EQ_BASE_L2_GAS,
    inputRanges: [
      { size: 2, typeTag: TypeTag.UINT64 }, // Two operands at offsets 0,1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT1 }, // Boolean result at offset 2
    ],
  },

  [Opcode.LT_8]: {
    createInstruction: () => new Lt(0, 0, 1, 2).as(Opcode.LT_8, Lt.wireFormat8),
    gasPerOp: AVM_LT_BASE_L2_GAS,
    inputRanges: [
      { size: 2, typeTag: TypeTag.UINT64 }, // Two operands at offsets 0,1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT1 }, // Boolean result at offset 2
    ],
  },

  [Opcode.LTE_8]: {
    createInstruction: () => new Lte(0, 0, 1, 2).as(Opcode.LTE_8, Lte.wireFormat8),
    gasPerOp: AVM_LTE_BASE_L2_GAS,
    inputRanges: [
      { size: 2, typeTag: TypeTag.UINT64 }, // Two operands at offsets 0,1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT1 }, // Boolean result at offset 2
    ],
  },

  // ===========================================
  // MEMORY/UTILITY OPCODES
  // ===========================================
  [Opcode.CAST_8]: {
    createInstruction: () => new Cast(0, 0, 1, TypeTag.UINT32).as(Opcode.CAST_8, Cast.wireFormat8),
    gasPerOp: AVM_CAST_BASE_L2_GAS,
    inputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Source value at offset 0
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT32 }, // Casted result at offset 1
    ],
  },

  [Opcode.MOV_8]: {
    createInstruction: () => new Mov(0, 0, 1).as(Opcode.MOV_8, Mov.wireFormat8),
    gasPerOp: AVM_MOV_BASE_L2_GAS,
    inputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Source value at offset 0
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Moved result at offset 1
    ],
  },

  // ===========================================
  // HASHING OPCODES
  // ===========================================
  [Opcode.KECCAKF1600]: {
    createInstruction: () => new KeccakF1600(0, 0, 0).as(Opcode.KECCAKF1600, KeccakF1600.wireFormat),
    gasPerOp: AVM_KECCAKF1600_BASE_L2_GAS,
    inputRanges: [
      { size: 25, typeTag: TypeTag.UINT64 }, // Keccak state (25 uint64 values)
    ],
  },

  [Opcode.POSEIDON2]: {
    createInstruction: () => new Poseidon2(0, 0, 0).as(Opcode.POSEIDON2, Poseidon2.wireFormat),
    gasPerOp: AVM_POSEIDON2_BASE_L2_GAS,
    inputRanges: [
      { size: 4, typeTag: TypeTag.FIELD }, // Poseidon2 state (4 field elements)
    ],
  },

  [Opcode.SHA256COMPRESSION]: {
    createInstruction: () =>
      new Sha256Compression(0, 0, 0, 8).as(Opcode.SHA256COMPRESSION, Sha256Compression.wireFormat),
    gasPerOp: AVM_SHA256COMPRESSION_BASE_L2_GAS,
    inputRanges: [
      { size: 8, typeTag: TypeTag.UINT32 }, // SHA256 state (8 uint32s at 0-7)
      { size: 16, typeTag: TypeTag.UINT32 }, // SHA256 inputs (16 uint32s at 8-23)
    ],
  },

  // ===========================================
  // CONTROL FLOW OPCODES
  // ===========================================
  [Opcode.JUMP_32]: {
    createInstruction: () => new Jump(100).as(Opcode.JUMP_32, Jump.wireFormat),
    gasPerOp: AVM_JUMP_BASE_L2_GAS,
    inputRanges: [], // Jump doesn't need memory setup
  },

  [Opcode.JUMPI_32]: {
    createInstruction: () => new JumpI(0, 0, 100).as(Opcode.JUMPI_32, JumpI.wireFormat),
    gasPerOp: AVM_JUMPI_BASE_L2_GAS,
    inputRanges: [
      { size: 1, typeTag: TypeTag.UINT1 }, // Condition at offset 0
    ],
  },

  // ===========================================
  // MEMORY/DATA OPCODES
  // ===========================================
  [Opcode.SET_8]: {
    createInstruction: () => new Set(0, 0, TypeTag.UINT64, 42).as(Opcode.SET_8, Set.wireFormat8),
    gasPerOp: AVM_SET_BASE_L2_GAS,
    inputRanges: [], // SET doesn't need input memory
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Result at offset 0
    ],
  },

  [Opcode.CALLDATACOPY]: {
    createInstruction: () => new CalldataCopy(0, 0, 1, 2).as(Opcode.CALLDATACOPY, CalldataCopy.wireFormat),
    gasPerOp: AVM_CALLDATACOPY_BASE_L2_GAS + 4 * AVM_CALLDATACOPY_DYN_L2_GAS, // Base + dynamic for 4 fields
    setupInstructions: [
      // Set copy size to 4 (small value to avoid gas issues)
      new Set(0, 0, TypeTag.UINT32, 4).as(Opcode.SET_8, Set.wireFormat8),
      // Set start offset to 0
      new Set(0, 1, TypeTag.UINT32, 0).as(Opcode.SET_8, Set.wireFormat8),
    ],
    setupGas: 2 * AVM_SET_BASE_L2_GAS,
    outputRanges: [
      { size: 10, typeTag: TypeTag.FIELD }, // Space for copied data at offset 2+
    ],
  },

  [Opcode.RETURNDATASIZE]: {
    createInstruction: () => new ReturndataSize(0, 0).as(Opcode.RETURNDATASIZE, ReturndataSize.wireFormat),
    gasPerOp: AVM_RETURNDATASIZE_BASE_L2_GAS,
    inputRanges: [], // No input memory needed
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT32 }, // Size result at offset 0
    ],
  },

  [Opcode.RETURNDATACOPY]: {
    createInstruction: () => new ReturndataCopy(0, 0, 1, 2).as(Opcode.RETURNDATACOPY, ReturndataCopy.wireFormat),
    gasPerOp: AVM_RETURNDATACOPY_BASE_L2_GAS + 4 * AVM_RETURNDATACOPY_DYN_L2_GAS, // Base + dynamic for 4 fields
    setupInstructions: [
      // Set copy size to 4 (small value to avoid gas issues)
      new Set(0, 0, TypeTag.UINT32, 4).as(Opcode.SET_8, Set.wireFormat8),
      // Set start offset to 0
      new Set(0, 1, TypeTag.UINT32, 0).as(Opcode.SET_8, Set.wireFormat8),
    ],
    setupGas: 2 * AVM_SET_BASE_L2_GAS,
    outputRanges: [
      { size: 10, typeTag: TypeTag.FIELD }, // Space for copied data at offset 2+
    ],
  },

  // ===========================================
  // ENVIRONMENT OPCODES
  // ===========================================
  [Opcode.GETENVVAR_16]: {
    createInstruction: () => new GetEnvVar(0, 0, 0).as(Opcode.GETENVVAR_16, GetEnvVar.wireFormat16),
    gasPerOp: AVM_GETENVVAR_BASE_L2_GAS,
    inputRanges: [
      { size: 1, typeTag: TypeTag.UINT32 }, // Environment variable ID at offset 0
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.FIELD }, // Environment value at offset 0 (overwrites input)
    ],
  },

  // ===========================================
  // 16-BIT ARITHMETIC OPCODES
  // ===========================================
  [Opcode.ADD_16]: {
    createInstruction: () => new Add(0, 0, 1, 2).as(Opcode.ADD_16, Add.wireFormat16),
    gasPerOp: AVM_ADD_BASE_L2_GAS,
    inputRanges: [
      { size: 2, typeTag: TypeTag.UINT64 }, // Two operands at offsets 0,1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Result at offset 2
    ],
  },

  [Opcode.SUB_16]: {
    createInstruction: () => new Sub(0, 0, 1, 2).as(Opcode.SUB_16, Sub.wireFormat16),
    gasPerOp: AVM_SUB_BASE_L2_GAS,
    inputRanges: [
      { size: 2, typeTag: TypeTag.UINT64 }, // Two operands at offsets 0,1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Result at offset 2
    ],
  },

  [Opcode.MUL_16]: {
    createInstruction: () => new Mul(0, 0, 1, 2).as(Opcode.MUL_16, Mul.wireFormat16),
    gasPerOp: AVM_MUL_BASE_L2_GAS,
    inputRanges: [
      { size: 2, typeTag: TypeTag.UINT64 }, // Two operands at offsets 0,1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Result at offset 2
    ],
  },

  [Opcode.DIV_16]: {
    createInstruction: () => new Div(0, 0, 1, 2).as(Opcode.DIV_16, Div.wireFormat16),
    gasPerOp: AVM_DIV_BASE_L2_GAS,
    inputRanges: [
      { size: 2, typeTag: TypeTag.UINT64 }, // Two operands at offsets 0,1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Result at offset 2
    ],
  },

  // ===========================================
  // 16-BIT BITWISE OPCODES
  // ===========================================
  [Opcode.AND_16]: {
    createInstruction: () => new And(0, 0, 1, 2).as(Opcode.AND_16, And.wireFormat16),
    gasPerOp: AVM_AND_BASE_L2_GAS + AVM_BITWISE_DYN_L2_GAS * 8, // 8 bytes for UINT64
    inputRanges: [
      { size: 2, typeTag: TypeTag.UINT64 }, // Two operands at offsets 0,1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Result at offset 2
    ],
  },

  [Opcode.OR_16]: {
    createInstruction: () => new Or(0, 0, 1, 2).as(Opcode.OR_16, Or.wireFormat16),
    gasPerOp: AVM_OR_BASE_L2_GAS + AVM_BITWISE_DYN_L2_GAS * 8, // 8 bytes for UINT64
    inputRanges: [
      { size: 2, typeTag: TypeTag.UINT64 }, // Two operands at offsets 0,1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Result at offset 2
    ],
  },

  [Opcode.XOR_16]: {
    createInstruction: () => new Xor(0, 0, 1, 2).as(Opcode.XOR_16, Xor.wireFormat16),
    gasPerOp: AVM_XOR_BASE_L2_GAS + AVM_BITWISE_DYN_L2_GAS * 8, // 8 bytes for UINT64
    inputRanges: [
      { size: 2, typeTag: TypeTag.UINT64 }, // Two operands at offsets 0,1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Result at offset 2
    ],
  },

  [Opcode.NOT_16]: {
    createInstruction: () => new Not(0, 0, 1).as(Opcode.NOT_16, Not.wireFormat16),
    gasPerOp: AVM_NOT_BASE_L2_GAS,
    inputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // One operand at offset 0
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Result at offset 1
    ],
  },

  [Opcode.SHL_16]: {
    createInstruction: () => new Shl(0, 0, 1, 2).as(Opcode.SHL_16, Shl.wireFormat16),
    gasPerOp: AVM_SHL_BASE_L2_GAS,
    inputRanges: [
      { size: 2, typeTag: TypeTag.UINT64 }, // Value and shift amount at offsets 0,1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Result at offset 2
    ],
  },

  [Opcode.SHR_16]: {
    createInstruction: () => new Shr(0, 0, 1, 2).as(Opcode.SHR_16, Shr.wireFormat16),
    gasPerOp: AVM_SHR_BASE_L2_GAS,
    inputRanges: [
      { size: 2, typeTag: TypeTag.UINT64 }, // Value and shift amount at offsets 0,1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Result at offset 2
    ],
  },

  // ===========================================
  // 16-BIT COMPARISON OPCODES
  // ===========================================
  [Opcode.EQ_16]: {
    createInstruction: () => new Eq(0, 0, 1, 2).as(Opcode.EQ_16, Eq.wireFormat16),
    gasPerOp: AVM_EQ_BASE_L2_GAS,
    inputRanges: [
      { size: 2, typeTag: TypeTag.UINT64 }, // Two operands at offsets 0,1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT1 }, // Boolean result at offset 2
    ],
  },

  [Opcode.LT_16]: {
    createInstruction: () => new Lt(0, 0, 1, 2).as(Opcode.LT_16, Lt.wireFormat16),
    gasPerOp: AVM_LT_BASE_L2_GAS,
    inputRanges: [
      { size: 2, typeTag: TypeTag.UINT64 }, // Two operands at offsets 0,1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT1 }, // Boolean result at offset 2
    ],
  },

  [Opcode.LTE_16]: {
    createInstruction: () => new Lte(0, 0, 1, 2).as(Opcode.LTE_16, Lte.wireFormat16),
    gasPerOp: AVM_LTE_BASE_L2_GAS,
    inputRanges: [
      { size: 2, typeTag: TypeTag.UINT64 }, // Two operands at offsets 0,1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT1 }, // Boolean result at offset 2
    ],
  },

  // ===========================================
  // ADDITIONAL MEMORY OPCODES
  // ===========================================
  [Opcode.MOV_16]: {
    createInstruction: () => new Mov(0, 0, 1).as(Opcode.MOV_16, Mov.wireFormat16),
    gasPerOp: AVM_MOV_BASE_L2_GAS,
    inputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Source value at offset 0
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Moved result at offset 1
    ],
  },

  [Opcode.CAST_16]: {
    createInstruction: () => new Cast(0, 0, 1, TypeTag.UINT32).as(Opcode.CAST_16, Cast.wireFormat16),
    gasPerOp: AVM_CAST_BASE_L2_GAS,
    inputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Source value at offset 0
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT32 }, // Casted result at offset 1
    ],
  },

  [Opcode.SET_16]: {
    createInstruction: () => new Set(0, 0, TypeTag.UINT16, 999).as(Opcode.SET_16, Set.wireFormat16),
    gasPerOp: AVM_SET_BASE_L2_GAS,
    inputRanges: [], // SET doesn't need input memory
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT16 }, // Result at offset 0
    ],
  },

  [Opcode.SET_32]: {
    createInstruction: () => new Set(0, 0, TypeTag.UINT32, 12345).as(Opcode.SET_32, Set.wireFormat32),
    gasPerOp: AVM_SET_BASE_L2_GAS,
    inputRanges: [], // SET doesn't need input memory
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT32 }, // Result at offset 0
    ],
  },

  [Opcode.SET_64]: {
    createInstruction: () => new Set(0, 0, TypeTag.UINT64, 67890n).as(Opcode.SET_64, Set.wireFormat64),
    gasPerOp: AVM_SET_BASE_L2_GAS,
    inputRanges: [], // SET doesn't need input memory
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT64 }, // Result at offset 0
    ],
  },

  [Opcode.SET_128]: {
    createInstruction: () => new Set(0, 0, TypeTag.UINT128, 999999n).as(Opcode.SET_128, Set.wireFormat128),
    gasPerOp: AVM_SET_BASE_L2_GAS,
    inputRanges: [], // SET doesn't need input memory
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT128 }, // Result at offset 0
    ],
  },

  [Opcode.SET_FF]: {
    createInstruction: () => new Set(0, 0, TypeTag.FIELD, 12345678n).as(Opcode.SET_FF, Set.wireFormatFF),
    gasPerOp: AVM_SET_BASE_L2_GAS,
    inputRanges: [], // SET doesn't need input memory
    outputRanges: [
      { size: 1, typeTag: TypeTag.FIELD }, // Result at offset 0
    ],
  },

  // ===========================================
  // FIELD ARITHMETIC OPCODES
  // ===========================================
  [Opcode.FDIV_16]: {
    createInstruction: () => new FieldDiv(0, 0, 1, 2).as(Opcode.FDIV_16, FieldDiv.wireFormat16),
    gasPerOp: AVM_FDIV_BASE_L2_GAS,
    inputRanges: [
      { size: 2, typeTag: TypeTag.FIELD }, // Two field operands at offsets 0,1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.FIELD }, // Result at offset 2
    ],
  },

  // ===========================================
  // WORLD STATE OPCODES
  // ===========================================
  [Opcode.SLOAD]: {
    createInstruction: () => new SLoad(0, 0, 1).as(Opcode.SLOAD, SLoad.wireFormat),
    gasPerOp: AVM_SLOAD_BASE_L2_GAS,
    inputRanges: [
      { size: 1, typeTag: TypeTag.FIELD }, // Storage slot at offset 0
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.FIELD }, // Loaded value at offset 1
    ],
  },

  [Opcode.SSTORE]: {
    createInstruction: () => new SStore(0, 0, 1).as(Opcode.SSTORE, SStore.wireFormat),
    gasPerOp: AVM_SSTORE_BASE_L2_GAS,
    inputRanges: [
      { size: 2, typeTag: TypeTag.FIELD }, // Slot and value at offsets 0,1
    ],
  },

  [Opcode.NOTEHASHEXISTS]: {
    createInstruction: () => new NoteHashExists(0, 0, 1, 2).as(Opcode.NOTEHASHEXISTS, NoteHashExists.wireFormat),
    gasPerOp: AVM_NOTEHASHEXISTS_BASE_L2_GAS,
    inputRanges: [
      { size: 1, typeTag: TypeTag.FIELD }, // Note hash at offset 0
      { size: 1, typeTag: TypeTag.UINT64 }, // Leaf index at offset 1 (must be UINT64)
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT1 }, // Exists result at offset 2
    ],
  },

  [Opcode.EMITNOTEHASH]: {
    createInstruction: () => new EmitNoteHash(0, 0).as(Opcode.EMITNOTEHASH, EmitNoteHash.wireFormat),
    gasPerOp: AVM_EMITNOTEHASH_BASE_L2_GAS,
    inputRanges: [
      { size: 1, typeTag: TypeTag.FIELD }, // Note hash at offset 0
    ],
  },

  [Opcode.NULLIFIEREXISTS]: {
    createInstruction: () => new NullifierExists(0, 0, 1, 2).as(Opcode.NULLIFIEREXISTS, NullifierExists.wireFormat),
    gasPerOp: AVM_NULLIFIEREXISTS_BASE_L2_GAS,
    inputRanges: [
      { size: 2, typeTag: TypeTag.FIELD }, // Nullifier at offset 0, address at offset 1
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT1 }, // Exists result at offset 2
    ],
  },

  [Opcode.L1TOL2MSGEXISTS]: {
    createInstruction: () =>
      new L1ToL2MessageExists(0, 0, 1, 2).as(Opcode.L1TOL2MSGEXISTS, L1ToL2MessageExists.wireFormat),
    gasPerOp: AVM_L1TOL2MSGEXISTS_BASE_L2_GAS,
    inputRanges: [
      { size: 1, typeTag: TypeTag.FIELD }, // Message hash at offset 0
      { size: 1, typeTag: TypeTag.UINT64 }, // Leaf index at offset 1 (must be UINT64)
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT1 }, // Exists result at offset 2
    ],
  },

  [Opcode.GETCONTRACTINSTANCE]: {
    createInstruction: () =>
      new GetContractInstance(0, 0, 1, 1).as(Opcode.GETCONTRACTINSTANCE, GetContractInstance.wireFormat),
    gasPerOp: AVM_GETCONTRACTINSTANCE_BASE_L2_GAS,
    inputRanges: [
      { size: 1, typeTag: TypeTag.FIELD }, // Contract address at offset 0
    ],
    outputRanges: [
      { size: 1, typeTag: TypeTag.FIELD }, // Contract instance member at offset 1
    ],
  },

  [Opcode.EMITUNENCRYPTEDLOG]: {
    createInstruction: () =>
      new EmitUnencryptedLog(0, 2, 1).as(Opcode.EMITUNENCRYPTEDLOG, EmitUnencryptedLog.wireFormat),
    gasPerOp: AVM_EMITUNENCRYPTEDLOG_BASE_L2_GAS,
    setupInstructions: [
      // Set log size to 4 (small value to avoid gas issues) at offset 1
      new Set(0, 1, TypeTag.UINT32, 4).as(Opcode.SET_8, Set.wireFormat8),
      // Set predictable log data at offsets 2-5
      new Set(0, 2, TypeTag.FIELD, 111n).as(Opcode.SET_FF, Set.wireFormatFF),
      new Set(0, 3, TypeTag.FIELD, 222n).as(Opcode.SET_FF, Set.wireFormatFF),
      new Set(0, 4, TypeTag.FIELD, 333n).as(Opcode.SET_FF, Set.wireFormatFF),
      new Set(0, 5, TypeTag.FIELD, 444n).as(Opcode.SET_FF, Set.wireFormatFF),
    ],
    setupGas: 5 * AVM_SET_BASE_L2_GAS, // Updated for 5 setup instructions
  },

  [Opcode.SENDL2TOL1MSG]: {
    createInstruction: () => new SendL2ToL1Message(0, 0, 1).as(Opcode.SENDL2TOL1MSG, SendL2ToL1Message.wireFormat),
    gasPerOp: AVM_SENDL2TOL1MSG_BASE_L2_GAS,
    inputRanges: [
      { size: 2, typeTag: TypeTag.FIELD }, // Recipient and message at offsets 0,1
    ],
  },

  // ===========================================
  // MISC OPCODES
  // ===========================================
  [Opcode.DEBUGLOG]: {
    createInstruction: () => new DebugLog(0, 0, 1, 2, 1).as(Opcode.DEBUGLOG, DebugLog.wireFormat),
    gasPerOp: AVM_DEBUGLOG_BASE_L2_GAS,
    inputRanges: [
      { size: 4, typeTag: TypeTag.FIELD }, // Debug message fields at offsets 0-3
    ],
  },

  [Opcode.SUCCESSCOPY]: {
    createInstruction: () => new SuccessCopy(0, 0).as(Opcode.SUCCESSCOPY, SuccessCopy.wireFormat),
    gasPerOp: AVM_SUCCESSCOPY_BASE_L2_GAS,
    inputRanges: [], // No inputs needed
    outputRanges: [
      { size: 1, typeTag: TypeTag.UINT1 }, // Success flag at offset 0
    ],
  },

  // ===========================================
  // GADGET OPCODES
  // ===========================================
  [Opcode.ECADD]: {
    createInstruction: () => new EcAdd(0, 0, 1, 2, 3, 4, 5, 6).as(Opcode.ECADD, EcAdd.wireFormat),
    gasPerOp: AVM_ECADD_BASE_L2_GAS,
    setupInstructions: [
      // Point 1: Infinity point (always valid)
      new Set(0, 0, TypeTag.FIELD, 0n).as(Opcode.SET_FF, Set.wireFormatFF), // x = 0 (doesn't matter for infinity)
      new Set(0, 1, TypeTag.FIELD, 0n).as(Opcode.SET_FF, Set.wireFormatFF), // y = 0 (doesn't matter for infinity)
      // Point 1: Is infinity
      new Set(0, 2, TypeTag.UINT1, 1).as(Opcode.SET_8, Set.wireFormat8),
      // Point 2: Also infinity point for predictable result
      new Set(0, 3, TypeTag.FIELD, 0n).as(Opcode.SET_FF, Set.wireFormatFF),
      new Set(0, 4, TypeTag.FIELD, 0n).as(Opcode.SET_FF, Set.wireFormatFF),
      // Point 2: Is infinity
      new Set(0, 5, TypeTag.UINT1, 1).as(Opcode.SET_8, Set.wireFormat8),
    ],
    setupGas: 6 * AVM_SET_BASE_L2_GAS,
    outputRanges: [
      { size: 3, typeTag: TypeTag.FIELD }, // Result point at offset 6-8
    ],
  },

  // ===========================================
  // CONVERSION OPCODES
  // ===========================================
  [Opcode.TORADIXBE]: {
    createInstruction: () => new ToRadixBE(0, 0, 1, 2, 3, 4).as(Opcode.TORADIXBE, ToRadixBE.wireFormat),
    // Exact gas calculation: base + 32 limbs (forced by radix 256 minimum)
    gasPerOp: AVM_TORADIXBE_BASE_L2_GAS + 32 * AVM_TORADIXBE_DYN_L2_GAS,
    setupInstructions: [
      // Set fixed input value - small, predictable number at offset 0
      new Set(0, 0, TypeTag.FIELD, 12345n).as(Opcode.SET_FF, Set.wireFormatFF),
      // Radix 256 - predictable 32 limb minimum at offset 1
      new Set(0, 1, TypeTag.UINT32, 256).as(Opcode.SET_32, Set.wireFormat32),
      // numLimbs 1 - will be overridden to 32, but ensures consistent behavior at offset 2
      new Set(0, 2, TypeTag.UINT32, 1).as(Opcode.SET_32, Set.wireFormat32),
      // Output bits mode 0 - byte output, not bit output at offset 3
      new Set(0, 3, TypeTag.UINT1, 0).as(Opcode.SET_8, Set.wireFormat8),
    ],
    setupGas: 4 * AVM_SET_BASE_L2_GAS, // Updated for 4 setup instructions
    outputRanges: [
      { size: 32, typeTag: TypeTag.FIELD }, // Exactly 32 output limbs at offset 4+
    ],
  },

  // ===========================================
  // CONTROL FLOW OPCODES (non-jumping)
  // ===========================================
  [Opcode.INTERNALCALL]: {
    createInstruction: () => new InternalCall(100).as(Opcode.INTERNALCALL, InternalCall.wireFormat),
    gasPerOp: AVM_INTERNALCALL_BASE_L2_GAS,
    inputRanges: [], // No memory needed
  },

  // ===========================================
  // EXTERNAL CALL OPCODES
  // ===========================================
  // CALL variant 1: Self-call (should succeed until gas runs out)
  [Opcode.CALL]: {
    createInstruction: () => new Call(0, 0, 1, 2, 3, 4).as(Opcode.CALL, Call.wireFormat),
    gasPerOp: AVM_CALL_BASE_L2_GAS + 100, // Each failing CALL consumes the allocated nested call gas too
    setupInstructions: [
      // L2 gas allocation at offset 0 (just enough for nested call)
      new Set(0, 0, TypeTag.UINT32, 100).as(Opcode.SET_32, Set.wireFormat32),
      // DA gas allocation at offset 1 (keep it small)
      new Set(0, 1, TypeTag.UINT32, 1).as(Opcode.SET_32, Set.wireFormat32),
      // Contract address at offset 2 - use zero address for predictable failure
      new Set(0, 2, TypeTag.FIELD, 0n).as(Opcode.SET_FF, Set.wireFormatFF),
      // Args size at offset 3 (0 args for simplicity)
      new Set(0, 3, TypeTag.UINT32, 0).as(Opcode.SET_32, Set.wireFormat32),
      // Args offset at offset 4 (required even if no args)
      new Set(0, 4, TypeTag.FIELD, 0n).as(Opcode.SET_FF, Set.wireFormatFF),
    ],
    setupGas: 5 * AVM_SET_BASE_L2_GAS,
    outputRanges: [
      { size: 10, typeTag: TypeTag.FIELD }, // Space for return data
    ],
  },

  [Opcode.STATICCALL]: {
    createInstruction: () => new StaticCall(0, 0, 1, 2, 3, 4).as(Opcode.STATICCALL, StaticCall.wireFormat),
    gasPerOp: AVM_STATICCALL_BASE_L2_GAS + 100, // Each failing STATICCALL consumes the allocated nested call gas too
    setupInstructions: [
      // L2 gas allocation at offset 0 (just enough for nested call)
      new Set(0, 0, TypeTag.UINT32, 100).as(Opcode.SET_32, Set.wireFormat32),
      // DA gas allocation at offset 1 (keep it small)
      new Set(0, 1, TypeTag.UINT32, 1).as(Opcode.SET_32, Set.wireFormat32),
      // Contract address at offset 2 - use zero address for predictable failure
      new Set(0, 2, TypeTag.FIELD, 0n).as(Opcode.SET_FF, Set.wireFormatFF),
      // Args size at offset 3 (0 args for simplicity)
      new Set(0, 3, TypeTag.UINT32, 0).as(Opcode.SET_32, Set.wireFormat32),
      // Args offset at offset 4 (required even if no args)
      new Set(0, 4, TypeTag.FIELD, 0n).as(Opcode.SET_FF, Set.wireFormatFF),
    ],
    setupGas: 5 * AVM_SET_BASE_L2_GAS,
    outputRanges: [
      { size: 10, typeTag: TypeTag.FIELD }, // Space for return data
    ],
  },
};

// ===========================================
// HELPER FUNCTIONS
// ===========================================

/**
 * Generic function to execute any opcode spam using the config object.
 * This is the preferred way to spam opcodes.
 *
 * @param opcode - Opcode enum value (e.g., Opcode.ADD_8, Opcode.MUL_8, Opcode.DIV_8)
 * @param tester - PublicTxSimulationTester instance
 * @param useInfiniteLoop - If true, creates infinite loop until gas exhaustion
 * @returns Promise<PublicTxResult>
 */
export async function executeOpcodeSpam(
  opcode: Opcode,
  tester: PublicTxSimulationTester,
  useInfiniteLoop = false,
): Promise<PublicTxResult> {
  const configWithoutName = OPCODE_SPAM_CONFIGS[opcode];
  if (!configWithoutName) {
    throw new Error(`No spam config found for opcode ${Opcode[opcode]}`);
  }

  const config: OpcodeSpamConfig = {
    opcodeName: Opcode[opcode], // fill in name
    ...configWithoutName,
  };

  if (useInfiniteLoop) {
    config.useInfiniteLoop = true;
  }

  const instructions = OpcodeSpammer.createSpamInstructions(config, tester);
  const opcodeString = Opcode[opcode]; // Get enum name as string
  return await OpcodeSpammer.executeAsContract(tester, `${opcodeString}SpamContract`, instructions);
}
