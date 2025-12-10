/**
 * Opcode Spammer - A minimal, data-driven opcode spammer for AVM gas benchmarking.
 *
 * Design principles:
 * 1. Data over code: Opcode behavior is configuration, not control flow
 * 2. Derive, don't declare: Categories and strategies follow from the data
 * 3. Maximize coverage: Fill bytecode to the limit for accurate gas measurement
 * 4. Smallest wire format: Use _8 variants over _16 to fit more instructions per loop
 * 5. Single file: Everything in one module
 */
import {
  FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS,
  MAX_PUBLIC_LOG_SIZE_IN_FIELDS,
  PUBLIC_LOG_HEADER_LENGTH,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { Bufferable } from '@aztec/foundation/serialize';

import { Field, type MemoryValue, TaggedMemory, TypeTag, Uint1, Uint32, Uint64, Uint128 } from '../avm_memory_types.js';
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
  Revert,
  SLoad,
  SStore,
  SendL2ToL1Message,
  Set,
  Sha256Compression,
  Shl,
  Shr,
  Sub,
  SuccessCopy,
  ToRadixBE,
  Xor,
} from '../opcodes/index.js';
import { encodeToBytecode } from '../serialization/bytecode_serialization.js';
import { Opcode } from '../serialization/instruction_serialization.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Memory cell to initialize before the loop.
 * Uses MemoryValue which encapsulates both value and type tag.
 */
export interface MemSetup {
  offset: number;
  value: MemoryValue;
}

/**
 * Everything needed to spam an opcode.
 */
export interface SpamConfig {
  /** Memory cells to initialize */
  setup: MemSetup[];

  /** Factory to create target instruction (captures operand offsets) */
  instruction: () => Bufferable;

  /** Per-TX limit (if set, use nested call pattern with REVERT) */
  limit?: number;

  /** Memory offset to increment each iteration (for unique values) */
  increment?: number;

  /** Number of slots already reserved (e.g., 1 for EMITNULLIFIER due to private nullifier) */
  reserved?: number;
}

/**
 * Defines input type variants to test for an opcode.
 * Each variant generates a separate test case.
 */
export interface TypeVariant {
  tag: TypeTag;
  value: bigint;
  label: string;
}

/**
 * Result of building spammy bytecode for gas-limited opcodes.
 * Single bytecode that loops until out of gas.
 */
export interface SpamBytecodeResult {
  bytecode: Buffer;
  expectedIterations: number;
  unrollFactor: number;
}

/**
 * Result of building spammy bytecode for side-effect-limited opcodes.
 * Uses nested call pattern: outer loops calling inner, inner does side effects + reverts.
 */
export interface NestedSpamBytecodeResult {
  /** Inner bytecode: does (limit - reserved) side effects then reverts */
  innerBytecode: Buffer;
  /** Function to create outer bytecode given inner contract address */
  createOuterBytecode: (innerAddress: Fr) => Buffer;
  /** Expected iterations per inner call */
  iterationsPerCall: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum bytecode size in bytes.
 *
 * Bytecode is encoded as fields using bufferAsFields():
 *   - 1 field for the byte length
 *   - ceil(byteLength / 31) fields for the data (31 bytes per field)
 *
 * So: 1 + ceil(byteLength / 31) <= MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS
 *     ceil(byteLength / 31) <= MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS - 1
 *     byteLength <= (MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS - 1) * 31
 */
const BYTES_PER_FIELD = Fr.SIZE_IN_BYTES - 1; // 31 bytes of data per field
const MAX_BYTECODE_BYTES = (MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS - 1) * BYTES_PER_FIELD;

/** Reserved memory offset for incrementing field values (high address to avoid conflicts) */
const FIELD_ONE = 210;

/** Reserved memory offsets for outer call loop */
const CALL_L2_GAS = 0;
const CALL_DA_GAS = 1;
const CALL_ADDR = 2;
const CALL_ARGS_SIZE = 3;
const CALL_ARGS_OFFSET = 4;

// ============================================================================
// Configuration Map
// ============================================================================

/**
 * Configuration for all spammable opcodes.
 * Uses smallest wire format (_8) for maximum instruction density.
 * Uses data dependency chaining where possible.
 */
export const SPAM_CONFIGS: Partial<Record<Opcode, SpamConfig>> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // ARITHMETIC - Use _8 variants, chain results back to first operand
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.ADD_8]: {
    setup: [
      { offset: 0, value: new Field(1n) }, // accumulator
      { offset: 1, value: new Field(1n) }, // constant addend
    ],
    // mem[0] = mem[0] + mem[1] → accumulates: 1, 2, 3, 4, ...
    // Output is fed back to input
    instruction: () => new Add(0, 0, 1, 0).as(Opcode.ADD_8, Add.wireFormat8),
  },

  [Opcode.SUB_8]: {
    setup: [
      { offset: 0, value: new Field(1000000n) }, // start high
      { offset: 1, value: new Field(1n) }, // subtract 1
    ],
    // Output is fed back to input
    instruction: () => new Sub(0, 0, 1, 0).as(Opcode.SUB_8, Sub.wireFormat8),
  },

  [Opcode.MUL_8]: {
    setup: [
      { offset: 0, value: new Field(2n) }, // accumulator
      { offset: 1, value: new Field(1n) }, // multiply by 1 to avoid overflow
    ],
    // Output is fed back to input
    instruction: () => new Mul(0, 0, 1, 0).as(Opcode.MUL_8, Mul.wireFormat8),
  },

  [Opcode.DIV_8]: {
    setup: [
      { offset: 0, value: new Uint64(1000000n) },
      { offset: 1, value: new Uint64(1n) }, // divide by 1 (identity)
    ],
    // Output is fed back to input
    instruction: () => new Div(0, 0, 1, 0).as(Opcode.DIV_8, Div.wireFormat8),
  },

  [Opcode.FDIV_8]: {
    setup: [
      { offset: 0, value: new Field(1000000n) },
      { offset: 1, value: new Field(1n) }, // divide by 1 (identity)
    ],
    // Output is fed back to input
    instruction: () => new FieldDiv(0, 0, 1, 0).as(Opcode.FDIV_8, FieldDiv.wireFormat8),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPARATORS
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.EQ_8]: {
    setup: [
      { offset: 0, value: new Field(42n) },
      { offset: 1, value: new Field(42n) },
    ],
    instruction: () => new Eq(0, 0, 1, 2).as(Opcode.EQ_8, Eq.wireFormat8),
  },

  [Opcode.LT_8]: {
    setup: [
      { offset: 0, value: new Field(1n) },
      { offset: 1, value: new Field(1000000n) },
    ],
    instruction: () => new Lt(0, 0, 1, 2).as(Opcode.LT_8, Lt.wireFormat8),
  },

  [Opcode.LTE_8]: {
    setup: [
      { offset: 0, value: new Field(1n) },
      { offset: 1, value: new Field(1000000n) },
    ],
    instruction: () => new Lte(0, 0, 1, 2).as(Opcode.LTE_8, Lte.wireFormat8),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BITWISE - Use UINT128 for maximum gas cost, chain XOR
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.AND_8]: {
    setup: [
      { offset: 0, value: new Uint128(0xffffffffffffffffffffffffffffffffn) },
      { offset: 1, value: new Uint128(0xffffffffffffffffffffffffffffffffn) },
    ],
    // Output is fed back to input
    instruction: () => new And(0, 0, 1, 0).as(Opcode.AND_8, And.wireFormat8),
  },

  [Opcode.OR_8]: {
    setup: [
      { offset: 0, value: new Uint128(0xffffffffffffffffffffffffffffffffn) },
      { offset: 1, value: new Uint128(0n) },
    ],
    instruction: () => new Or(0, 0, 1, 0).as(Opcode.OR_8, Or.wireFormat8),
  },

  [Opcode.XOR_8]: {
    setup: [
      { offset: 0, value: new Uint128(0xdeadbeefcafebaben) },
      { offset: 1, value: new Uint128(0x1234567890abcdefn) },
    ],
    // Output is fed back to input
    instruction: () => new Xor(0, 0, 1, 0).as(Opcode.XOR_8, Xor.wireFormat8),
  },

  [Opcode.NOT_8]: {
    setup: [{ offset: 0, value: new Uint64(0xffffffffffffffffn) }],
    instruction: () => new Not(0, 0, 0).as(Opcode.NOT_8, Not.wireFormat8),
  },

  [Opcode.SHL_8]: {
    setup: [
      { offset: 0, value: new Uint64(1n) },
      { offset: 1, value: new Uint64(1n) },
    ],
    // Output is fed back to input
    instruction: () => new Shl(0, 0, 1, 0).as(Opcode.SHL_8, Shl.wireFormat8),
  },

  [Opcode.SHR_8]: {
    setup: [
      { offset: 0, value: new Uint64(0xffffffffffffffffn) },
      { offset: 1, value: new Uint64(1n) },
    ],
    // Output is fed back to input
    instruction: () => new Shr(0, 0, 1, 0).as(Opcode.SHR_8, Shr.wireFormat8),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CAST
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.CAST_8]: {
    setup: [{ offset: 0, value: new Field(42n) }],
    instruction: () => new Cast(0, 0, 1, TypeTag.UINT32).as(Opcode.CAST_8, Cast.wireFormat8),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MEMORY
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.SET_8]: {
    setup: [],
    instruction: () => new Set(0, 0, TypeTag.UINT8, 42).as(Opcode.SET_8, Set.wireFormat8),
  },

  [Opcode.SET_16]: {
    setup: [],
    instruction: () => new Set(0, 0, TypeTag.UINT16, 4242).as(Opcode.SET_16, Set.wireFormat16),
  },

  [Opcode.SET_32]: {
    setup: [],
    instruction: () => new Set(0, 0, TypeTag.UINT32, 424242).as(Opcode.SET_32, Set.wireFormat32),
  },

  [Opcode.SET_64]: {
    setup: [],
    instruction: () => new Set(0, 0, TypeTag.UINT64, 42424242n).as(Opcode.SET_64, Set.wireFormat64),
  },

  [Opcode.SET_128]: {
    setup: [],
    instruction: () => new Set(0, 0, TypeTag.UINT128, 4242424242424242n).as(Opcode.SET_128, Set.wireFormat128),
  },

  [Opcode.SET_FF]: {
    setup: [],
    instruction: () => new Set(0, 0, TypeTag.FIELD, 42n).as(Opcode.SET_FF, Set.wireFormatFF),
  },

  [Opcode.MOV_8]: {
    setup: [{ offset: 0, value: new Field(42n) }],
    instruction: () => new Mov(0, 0, 1).as(Opcode.MOV_8, Mov.wireFormat8),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTROL FLOW
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.JUMP_32]: {
    setup: [],
    // Target will be overwritten by loop builder
    instruction: () => new Jump(0),
  },

  [Opcode.JUMPI_32]: {
    setup: [{ offset: 0, value: new Uint1(0n) }], // Always false
    instruction: () => new JumpI(0, 0, 0),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ENVIRONMENT
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.GETENVVAR_16]: {
    setup: [],
    instruction: () => new GetEnvVar(0, 0, 0).as(Opcode.GETENVVAR_16, GetEnvVar.wireFormat16),
  },

  [Opcode.CALLDATACOPY]: {
    setup: [
      { offset: 0, value: new Uint32(1n) }, // copySize
      { offset: 1, value: new Uint32(0n) }, // cdOffset
    ],
    instruction: () => new CalldataCopy(0, 0, 1, 2),
  },

  [Opcode.SUCCESSCOPY]: {
    setup: [],
    instruction: () => new SuccessCopy(0, 0),
  },

  [Opcode.RETURNDATASIZE]: {
    setup: [],
    instruction: () => new ReturndataSize(0, 0),
  },

  [Opcode.RETURNDATACOPY]: {
    setup: [
      { offset: 0, value: new Uint32(0n) }, // copySize = 0
      { offset: 1, value: new Uint32(0n) }, // rdOffset
    ],
    instruction: () => new ReturndataCopy(0, 0, 1, 2),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WORLD STATE READS
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.SLOAD]: {
    setup: [{ offset: 0, value: new Field(0n) }], // slot
    instruction: () => new SLoad(0, 0, 1),
  },

  [Opcode.NOTEHASHEXISTS]: {
    setup: [
      { offset: 0, value: new Field(0n) }, // noteHash
      { offset: 1, value: new Uint64(0n) }, // leafIndex
    ],
    instruction: () => new NoteHashExists(0, 0, 1, 2),
  },

  [Opcode.NULLIFIEREXISTS]: {
    setup: [
      { offset: 0, value: new Field(0n) }, // nullifier
      { offset: 1, value: new Field(0n) }, // address
    ],
    instruction: () => new NullifierExists(0, 0, 1, 2),
  },

  [Opcode.L1TOL2MSGEXISTS]: {
    setup: [
      { offset: 0, value: new Field(0n) }, // msgHash
      { offset: 1, value: new Uint64(0n) }, // msgLeafIndex
    ],
    instruction: () => new L1ToL2MessageExists(0, 0, 1, 2),
  },

  [Opcode.GETCONTRACTINSTANCE]: {
    setup: [{ offset: 0, value: new Field(0n) }], // address
    instruction: () => new GetContractInstance(0, 0, 1, 0), // memberEnum 0 = DEPLOYER
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SIDE-EFFECT LIMITED (have per-TX limit, use nested call pattern)
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.EMITNOTEHASH]: {
    setup: [{ offset: 0, value: new Field(0x1000n) }],
    instruction: () => new EmitNoteHash(0, 0),
    limit: MAX_NOTE_HASHES_PER_TX,
  },

  [Opcode.EMITNULLIFIER]: {
    // Nullifiers must be unique - increment to generate unique values each iteration
    setup: [{ offset: 0, value: new Field(0x2000n) }],
    instruction: () => new EmitNullifier(0, 0),
    limit: MAX_NULLIFIERS_PER_TX,
    increment: 0,
    reserved: 1, // 1 nullifier already used by private (non-revertible)
  },

  [Opcode.SENDL2TOL1MSG]: {
    setup: [
      { offset: 0, value: new Field(1n) }, // recipient
      { offset: 1, value: new Field(0x3000n) }, // content
    ],
    instruction: () => new SendL2ToL1Message(0, 0, 1),
    limit: MAX_L2_TO_L1_MSGS_PER_TX,
  },

  // SSTORE IS NOT STRICTLY A SIDE-EFFECT LIMITED OPCODE
  // SSTORE to the same slot repeatedly has no limit - it just overwrites the same slot.
  // Only writing to unique slots would hit MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX.
  [Opcode.SSTORE]: {
    setup: [
      { offset: 0, value: new Field(42n) }, // value
      { offset: 1, value: new Field(0x100n) }, // slot (same slot each iteration)
    ],
    instruction: () => new SStore(0, 0, 1),
  },

  // EMITUNENCRYPTEDLOG with minimal log size (0 fields).
  // Each log = 0 field content + PUBLIC_LOG_HEADER_LENGTH fields header.
  // Total logs = floor(FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH / PUBLIC_LOG_HEADER_LENGTH).
  // For max-size log version, use createMaxSizeLogNestedBytecode().
  [Opcode.EMITUNENCRYPTEDLOG]: {
    setup: [
      { offset: 0, value: new Uint32(0n) }, // logSize = 0 fields (minimal)
    ],
    instruction: () => new EmitUnencryptedLog(0, 0, 1), // logOffset doesn't matter when size is 0
    // Max logs with 0-field content: floor(4096 / 2) = 2048
    limit: Math.floor(FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH / PUBLIC_LOG_HEADER_LENGTH),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GADGETS
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.POSEIDON2]: {
    setup: Array.from({ length: 4 }, (_, i) => ({
      offset: i,
      value: new Field(0n),
    })),
    // Output is fed back to input
    instruction: () => new Poseidon2(0, 0, 0),
  },

  [Opcode.SHA256COMPRESSION]: {
    setup: [
      // State: 8 x UINT32 at offsets 0-7
      ...Array.from({ length: 8 }, (_, i) => ({
        offset: i,
        value: new Uint32(0n),
      })),
      // Inputs: 16 x UINT32 at offsets 8-23
      ...Array.from({ length: 16 }, (_, i) => ({
        offset: 8 + i,
        value: new Uint32(0n),
      })),
    ],
    // Output is fed back to input
    instruction: () => new Sha256Compression(0, 0, 0, 8),
  },

  [Opcode.KECCAKF1600]: {
    setup: Array.from({ length: 25 }, (_, i) => ({
      offset: i,
      value: new Uint64(0n),
    })),
    // Output is fed back to input
    instruction: () => new KeccakF1600(0, 0, 0),
  },

  [Opcode.ECADD]: {
    setup: [
      { offset: 0, value: new Field(0n) }, // p1X
      { offset: 1, value: new Field(0n) }, // p1Y
      { offset: 2, value: new Uint1(1n) }, // p1IsInfinite = true
      { offset: 3, value: new Field(0n) }, // p2X
      { offset: 4, value: new Field(0n) }, // p2Y
      { offset: 5, value: new Uint1(1n) }, // p2IsInfinite = true
    ],
    // Output is fed back to input
    // Output (x,y,isInf) overwrites p1 for chaining
    instruction: () => new EcAdd(0, 0, 1, 2, 3, 4, 5, 0),
  },

  [Opcode.TORADIXBE]: {
    setup: [
      { offset: 0, value: new Field(255n) }, // src value
      { offset: 1, value: new Uint32(2n) }, // radix = 2 (binary)
      { offset: 2, value: new Uint32(8n) }, // numLimbs = 8
      { offset: 3, value: new Uint1(1n) }, // outputBits = true
    ],
    instruction: () => new ToRadixBE(0, 0, 1, 2, 3, 4),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MISC
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.DEBUGLOG]: {
    setup: [
      { offset: 0, value: new Field(0n) }, // level (0 = trace)
      { offset: 1, value: new Field(0n) }, // message
      { offset: 2, value: new Field(0n) }, // fields
      { offset: 3, value: new Uint32(0n) }, // fieldsSize = 0
    ],
    instruction: () => new DebugLog(0, 0, 1, 2, 3, 0), // messageSize = 0
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a SET instruction from a MemoryValue.
 * Chooses smallest SET variant based on offset and value magnitude for optimal bytecode density.
 *
 * Wire format constraints:
 * - SET_8: UINT8 offset (0-255), UINT8 value
 * - SET_16+: UINT16 offset (0-65535), larger values
 */
function createSetFromMemoryValue(offset: number, memValue: MemoryValue): Bufferable {
  const tag = memValue.getTag();
  const value = memValue.toBigInt();

  // SET_8 only supports offset <= 255 and value <= 255
  if (offset <= 0xff && value <= 0xffn) {
    return new Set(0, offset, tag, Number(value)).as(Opcode.SET_8, Set.wireFormat8);
  }
  // SET_16+ support offset <= 65535
  if (value <= 0xffffn) {
    return new Set(0, offset, tag, Number(value)).as(Opcode.SET_16, Set.wireFormat16);
  }
  if (value <= 0xffffffffn) {
    return new Set(0, offset, tag, Number(value)).as(Opcode.SET_32, Set.wireFormat32);
  }
  if (value <= 0xffffffffffffffffn) {
    return new Set(0, offset, tag, value).as(Opcode.SET_64, Set.wireFormat64);
  }
  if (value <= 0xffffffffffffffffffffffffffffffffn) {
    return new Set(0, offset, tag, value).as(Opcode.SET_128, Set.wireFormat128);
  }
  return new Set(0, offset, tag, value).as(Opcode.SET_FF, Set.wireFormatFF);
}

/**
 * Append an infinite loop that maximizes target instruction density.
 * Fills remaining bytecode space with unrolled target instructions.
 */
function appendInfiniteLoop(instructions: Bufferable[], config: SpamConfig): number {
  const setupBytecode = encodeToBytecode(instructions);
  const setupSize = setupBytecode.length;

  const targetInstr = config.instruction();
  const targetSize = encodeToBytecode([targetInstr]).length;
  const jumpSize = 5; // JUMP_32

  // Fill remaining space with target instructions
  const available = MAX_BYTECODE_BYTES - setupSize - jumpSize;
  const unroll = Math.floor(available / targetSize);

  const loopStart = setupSize;
  for (let i = 0; i < unroll; i++) {
    instructions.push(config.instruction());
  }
  instructions.push(new Jump(loopStart));

  return unroll;
}

/**
 * Append unrolled instructions for side-effect limited opcodes.
 * Inlines the instruction (limit - reserved) times, then reverts.
 * No loop needed since limits are small enough to inline directly.
 *
 * For most opcodes, reserved=0 so we emit exactly `limit` instructions.
 * For EMITNULLIFIER, reserved=1 because 1 nullifier is already used by private.
 */
function appendUnrolledWithRevert(instructions: Bufferable[], config: SpamConfig): number {
  const limit = config.limit!;
  const reserved = config.reserved ?? 0;
  const iterations = limit - reserved;

  // For opcodes that need unique values (e.g., EMITNULLIFIER), we need to increment
  // the value after each instruction. We do this inline.
  if (config.increment !== undefined) {
    // Set up a field-type one for incrementing
    instructions.push(new Set(0, FIELD_ONE, TypeTag.FIELD, 1).as(Opcode.SET_8, Set.wireFormat8));

    // Inline the instruction with increment after each
    for (let i = 0; i < iterations; i++) {
      instructions.push(config.instruction());
      instructions.push(new Add(0, config.increment, FIELD_ONE, config.increment).as(Opcode.ADD_8, Add.wireFormat8));
    }
  } else {
    // No increment needed - just inline the instruction
    for (let i = 0; i < iterations; i++) {
      instructions.push(config.instruction());
    }
  }

  // Exit with revert - use an offset beyond the setup memory
  // Find max offset used in setup to avoid conflicts
  const maxSetupOffset = config.setup.reduce((max, s) => Math.max(max, s.offset), 0);
  const revertSizeOffset = maxSetupOffset + 10; // Leave some buffer

  // Use SET_16 and REVERT_16 if offset > 255
  if (revertSizeOffset <= 0xff) {
    instructions.push(new Set(0, revertSizeOffset, TypeTag.UINT32, 0).as(Opcode.SET_8, Set.wireFormat8));
    instructions.push(new Revert(0, revertSizeOffset, revertSizeOffset).as(Opcode.REVERT_8, Revert.wireFormat8));
  } else {
    instructions.push(new Set(0, revertSizeOffset, TypeTag.UINT32, 0).as(Opcode.SET_16, Set.wireFormat16));
    instructions.push(new Revert(0, revertSizeOffset, revertSizeOffset).as(Opcode.REVERT_16, Revert.wireFormat16));
  }

  return iterations;
}

/**
 * Create bytecode for an outer loop that repeatedly calls an inner contract.
 * Used for side-effect limited opcodes to maximize total iterations.
 */
function createOuterCallLoopBytecode(innerAddress: Fr): Buffer {
  const instructions: Bufferable[] = [];

  // Setup call parameters
  // Gas values must be UINT32 (CALL checks tags)
  // Use max uint32 value to allocate as much gas as possible to nested call
  instructions.push(new Set(0, CALL_L2_GAS, TypeTag.UINT32, 0xffffffff).as(Opcode.SET_32, Set.wireFormat32));
  instructions.push(new Set(0, CALL_DA_GAS, TypeTag.UINT32, 0xffffffff).as(Opcode.SET_32, Set.wireFormat32));
  // Address is FIELD
  instructions.push(new Set(0, CALL_ADDR, TypeTag.FIELD, innerAddress.toBigInt()).as(Opcode.SET_FF, Set.wireFormatFF));
  // Args size is UINT32
  instructions.push(new Set(0, CALL_ARGS_SIZE, TypeTag.UINT32, 0).as(Opcode.SET_8, Set.wireFormat8));

  const loopStart = encodeToBytecode(instructions).length;

  // Call inner contract
  instructions.push(new Call(0, CALL_L2_GAS, CALL_DA_GAS, CALL_ADDR, CALL_ARGS_SIZE, CALL_ARGS_OFFSET));

  // Jump back to loop start
  instructions.push(new Jump(loopStart));

  return encodeToBytecode(instructions);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate bytecode that spams the given opcode.
 * Returns bytecode that runs until out-of-gas or hits a side-effect limit.
 */
export function createSpamBytecode(opcode: Opcode): SpamBytecodeResult {
  const config = SPAM_CONFIGS[opcode];
  if (!config) {
    throw new Error(`Opcode ${Opcode[opcode]} not configured for spamming`);
  }

  return createSpamBytecodeFromConfig(config);
}

/**
 * Generate bytecode from a SpamConfig.
 * Useful for testing type variants and wire format variants.
 *
 * Note: For side-effect limited opcodes (configs with `limit`), use
 * createNestedSpamBytecodeFromConfig instead - they need the nested call pattern.
 */
export function createSpamBytecodeFromConfig(config: SpamConfig): SpamBytecodeResult {
  if (config.limit) {
    throw new Error(
      'Cannot use createSpamBytecodeFromConfig for side-effect limited opcodes. ' +
        'Use createNestedSpamBytecodeFromConfig instead.',
    );
  }

  const instructions: Bufferable[] = [];

  // 1. Setup memory
  for (const { offset, value } of config.setup) {
    instructions.push(createSetFromMemoryValue(offset, value));
  }

  // 2. Infinite loop - maximize iterations until out-of-gas
  const unrollFactor = appendInfiniteLoop(instructions, config);
  const expectedIterations = Number.MAX_SAFE_INTEGER; // Runs until out-of-gas

  return {
    bytecode: encodeToBytecode(instructions),
    expectedIterations,
    unrollFactor,
  };
}

/**
 * Check if an opcode can be spammed.
 */
export function isSpammable(opcode: Opcode): boolean {
  return SPAM_CONFIGS[opcode] !== undefined;
}

/**
 * Get all spammable opcodes.
 */
export function getSpammableOpcodes(): Opcode[] {
  return Object.keys(SPAM_CONFIGS)
    .map(k => Number(k) as Opcode)
    .filter(k => !isNaN(k));
}

/**
 * Check if an opcode is side-effect limited.
 */
export function isSideEffectLimited(opcode: Opcode): boolean {
  const config = SPAM_CONFIGS[opcode];
  return config?.limit !== undefined;
}

/**
 * Get the side-effect limit for an opcode.
 */
export function getSideEffectLimit(opcode: Opcode): number | undefined {
  return SPAM_CONFIGS[opcode]?.limit;
}

/**
 * Generate nested bytecode for side-effect limited opcodes.
 *
 * Pattern: outer contract loops calling inner contract, which does (limit - reserved)
 * side effects then reverts. This allows thousands of iterations until out-of-gas
 * rather than just (limit - reserved) iterations per transaction.
 */
export function createNestedSpamBytecode(opcode: Opcode): NestedSpamBytecodeResult {
  const config = SPAM_CONFIGS[opcode];
  if (!config || !config.limit) {
    throw new Error(`Opcode ${Opcode[opcode]} is not a side-effect limited opcode`);
  }

  return createNestedSpamBytecodeFromConfig(config);
}

/**
 * Generate nested bytecode from a SpamConfig.
 * Useful for custom configs (e.g., max-size log).
 */
export function createNestedSpamBytecodeFromConfig(config: SpamConfig): NestedSpamBytecodeResult {
  if (!config.limit) {
    throw new Error('Config must have a limit for nested spam bytecode');
  }

  // Inner bytecode: setup + unrolled instructions (limit - reserved times) + revert
  const innerInstructions: Bufferable[] = [];
  for (const { offset, value } of config.setup) {
    innerInstructions.push(createSetFromMemoryValue(offset, value));
  }
  const iterationsPerCall = appendUnrolledWithRevert(innerInstructions, config);
  const innerBytecode = encodeToBytecode(innerInstructions);

  return {
    innerBytecode,
    createOuterBytecode: (innerAddress: Fr) => createOuterCallLoopBytecode(innerAddress),
    iterationsPerCall,
  };
}

// ============================================================================
// Type Variant Expansion
// ============================================================================

/**
 * Expand a config to test with different input types.
 * Returns array of [label, config] pairs.
 */
export function expandTypeVariants(opcode: Opcode, variants: TypeVariant[]): Array<[string, SpamConfig]> {
  const baseConfig = SPAM_CONFIGS[opcode];
  if (!baseConfig) {
    throw new Error(`No config for opcode ${Opcode[opcode]}`);
  }

  return variants.map(variant => {
    // Rebuild each setup MemoryValue with the variant's tag
    const expandedSetup = baseConfig.setup.map(s => ({
      offset: s.offset,
      value: TaggedMemory.buildFromTagTruncating(variant.value, variant.tag),
    }));

    return [`${Opcode[opcode]}/${variant.label}`, { ...baseConfig, setup: expandedSetup }];
  });
}

/**
 * Common type variants for arithmetic operations.
 */
export const ARITHMETIC_TYPE_VARIANTS: TypeVariant[] = [
  { tag: TypeTag.UINT8, value: 0xffn, label: 'UINT8' },
  { tag: TypeTag.UINT32, value: 0xffffffffn, label: 'UINT32' },
  { tag: TypeTag.UINT64, value: 0xffffffffffffffffn, label: 'UINT64' },
  { tag: TypeTag.UINT128, value: 0xffffffffffffffffffffffffffffffffn, label: 'UINT128' },
  { tag: TypeTag.FIELD, value: 1n, label: 'FIELD' },
];

/**
 * Common type variants for bitwise operations.
 */
export const BITWISE_TYPE_VARIANTS: TypeVariant[] = [
  { tag: TypeTag.UINT8, value: 0xffn, label: 'UINT8' },
  { tag: TypeTag.UINT32, value: 0xffffffffn, label: 'UINT32' },
  { tag: TypeTag.UINT64, value: 0xffffffffffffffffn, label: 'UINT64' },
  { tag: TypeTag.UINT128, value: 0xffffffffffffffffffffffffffffffffn, label: 'UINT128' },
];

// ============================================================================
// Wire Format Expansion
// ============================================================================

/**
 * Wire format variant for an opcode family.
 */
export interface WireFormatVariant {
  opcode: Opcode;
  wireFormat: unknown;
  label: string;
}

/**
 * Define wire format families for opcodes with multiple encodings.
 */
export const WIRE_FORMAT_FAMILIES: Record<string, WireFormatVariant[]> = {
  ADD: [
    { opcode: Opcode.ADD_8, wireFormat: Add.wireFormat8, label: '_8' },
    { opcode: Opcode.ADD_16, wireFormat: Add.wireFormat16, label: '_16' },
  ],
  SUB: [
    { opcode: Opcode.SUB_8, wireFormat: Sub.wireFormat8, label: '_8' },
    { opcode: Opcode.SUB_16, wireFormat: Sub.wireFormat16, label: '_16' },
  ],
  MUL: [
    { opcode: Opcode.MUL_8, wireFormat: Mul.wireFormat8, label: '_8' },
    { opcode: Opcode.MUL_16, wireFormat: Mul.wireFormat16, label: '_16' },
  ],
  DIV: [
    { opcode: Opcode.DIV_8, wireFormat: Div.wireFormat8, label: '_8' },
    { opcode: Opcode.DIV_16, wireFormat: Div.wireFormat16, label: '_16' },
  ],
  FDIV: [
    { opcode: Opcode.FDIV_8, wireFormat: FieldDiv.wireFormat8, label: '_8' },
    { opcode: Opcode.FDIV_16, wireFormat: FieldDiv.wireFormat16, label: '_16' },
  ],
  EQ: [
    { opcode: Opcode.EQ_8, wireFormat: Eq.wireFormat8, label: '_8' },
    { opcode: Opcode.EQ_16, wireFormat: Eq.wireFormat16, label: '_16' },
  ],
  LT: [
    { opcode: Opcode.LT_8, wireFormat: Lt.wireFormat8, label: '_8' },
    { opcode: Opcode.LT_16, wireFormat: Lt.wireFormat16, label: '_16' },
  ],
  LTE: [
    { opcode: Opcode.LTE_8, wireFormat: Lte.wireFormat8, label: '_8' },
    { opcode: Opcode.LTE_16, wireFormat: Lte.wireFormat16, label: '_16' },
  ],
  AND: [
    { opcode: Opcode.AND_8, wireFormat: And.wireFormat8, label: '_8' },
    { opcode: Opcode.AND_16, wireFormat: And.wireFormat16, label: '_16' },
  ],
  OR: [
    { opcode: Opcode.OR_8, wireFormat: Or.wireFormat8, label: '_8' },
    { opcode: Opcode.OR_16, wireFormat: Or.wireFormat16, label: '_16' },
  ],
  XOR: [
    { opcode: Opcode.XOR_8, wireFormat: Xor.wireFormat8, label: '_8' },
    { opcode: Opcode.XOR_16, wireFormat: Xor.wireFormat16, label: '_16' },
  ],
  NOT: [
    { opcode: Opcode.NOT_8, wireFormat: Not.wireFormat8, label: '_8' },
    { opcode: Opcode.NOT_16, wireFormat: Not.wireFormat16, label: '_16' },
  ],
  SHL: [
    { opcode: Opcode.SHL_8, wireFormat: Shl.wireFormat8, label: '_8' },
    { opcode: Opcode.SHL_16, wireFormat: Shl.wireFormat16, label: '_16' },
  ],
  SHR: [
    { opcode: Opcode.SHR_8, wireFormat: Shr.wireFormat8, label: '_8' },
    { opcode: Opcode.SHR_16, wireFormat: Shr.wireFormat16, label: '_16' },
  ],
  CAST: [
    { opcode: Opcode.CAST_8, wireFormat: Cast.wireFormat8, label: '_8' },
    { opcode: Opcode.CAST_16, wireFormat: Cast.wireFormat16, label: '_16' },
  ],
  MOV: [
    { opcode: Opcode.MOV_8, wireFormat: Mov.wireFormat8, label: '_8' },
    { opcode: Opcode.MOV_16, wireFormat: Mov.wireFormat16, label: '_16' },
  ],
};

/**
 * Get all wire format variants for a family.
 */
export function getWireFormatVariants(family: string): WireFormatVariant[] | undefined {
  return WIRE_FORMAT_FAMILIES[family];
}

// ============================================================================
// Special Case: Max-Size Log Config
// ============================================================================

/**
 * Memory layout for max-size log:
 * - Offset 0: logSize (UINT32)
 * - Offset 1 to (1 + MAX_PUBLIC_LOG_SIZE_IN_FIELDS - 1): log content (FIELDs)
 */
const LOG_SIZE_OFFSET = 0;
const LOG_CONTENT_OFFSET = 1;

/**
 * Create a SpamConfig for EMITUNENCRYPTEDLOG with max-size logs.
 * This can be used with createNestedSpamBytecodeFromConfig.
 */
export function createMaxSizeLogConfig(): SpamConfig {
  return {
    setup: [
      // logSize = MAX_PUBLIC_LOG_SIZE_IN_FIELDS
      { offset: LOG_SIZE_OFFSET, value: new Uint32(BigInt(MAX_PUBLIC_LOG_SIZE_IN_FIELDS)) },
      // Initialize all log content fields to zero (FIELD type)
      ...Array.from({ length: MAX_PUBLIC_LOG_SIZE_IN_FIELDS }, (_, i) => ({
        offset: LOG_CONTENT_OFFSET + i,
        value: new Field(0n),
      })),
    ],
    instruction: () => new EmitUnencryptedLog(0, LOG_SIZE_OFFSET, LOG_CONTENT_OFFSET),
    limit: 1, // Only 1 max-size log fits
  };
}

/**
 * Create nested bytecode for EMITUNENCRYPTEDLOG with max-size logs.
 *
 * This version emits a single log that takes up the entire log payload limit.
 * The inner contract emits 1 max-size log then reverts, allowing the outer
 * to loop calling it until out-of-gas.
 */
export function createMaxSizeLogNestedBytecode(): NestedSpamBytecodeResult {
  return createNestedSpamBytecodeFromConfig(createMaxSizeLogConfig());
}
