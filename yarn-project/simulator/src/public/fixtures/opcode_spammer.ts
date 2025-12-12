/**
 * Opcode Spammer - A minimal, data-driven opcode spammer for AVM gas benchmarking.
 *
 * Design principles:
 * 1. Data over code: Opcode behavior is configuration, not control flow
 * 2. Derive, don't declare: Categories and strategies follow from the data
 * 3. Maximize coverage: Fill bytecode to the limit for accurate gas measurement
 * 4. Smallest wire format: Use _8 variants over _16 to fit more instructions per loop
 * 5. Single file: Everything in one module
 *
 * ## Architecture
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                        SPAM_CONFIGS                             │
 * │  Record<Opcode, SpamConfig[]>                                   │
 * │                                                                 │
 * │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
 * │  │   ADD_8     │  │  POSEIDON2  │  │EMITNULLIFIER│  ...         │
 * │  │ [7 configs] │  │ [1 config]  │  │ [1 config]  │              │
 * │  │ (per type)  │  │             │  │ (limit=63)  │              │
 * │  └─────────────┘  └─────────────┘  └─────────────┘              │
 * └─────────────────────────────────────────────────────────────────┘
 *                               │
 *                               ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                   getSpamConfigsPerOpcode()                     │
 * │  Returns { opcodes, config[] } for test iteration               │
 * └─────────────────────────────────────────────────────────────────┘
 *                               │
 *                               ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    testOpcodeSpamCase()                         │
 * │  Routes to appropriate bytecode generator & executes test       │
 * │                                                                 │
 * │  config.limit === undefined?                                    │
 * │      YES → testStandardOpcodeSpam()                             │
 * │      NO  → testSideEffectOpcodeSpam()                           │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Two Execution Strategies
 *
 * ### Strategy 1: Standard Opcodes (Gas-Limited)
 *
 * For opcodes without per-TX limits (arithmetic, comparisons, memory ops, etc.), we create a single contract with an infinite loop:
 *
 * ```
 * ┌────────────────────────────────────────────────────────────────┐
 * │                    SINGLE CONTRACT                             │
 * │                                                                │
 * │  ┌──────────────────────────────────────────────────────────┐  │
 * │  │ SETUP PHASE                                              │  │
 * │  │  SET mem[0] = initial_value                              │  │
 * │  │  SET mem[1] = operand                                    │  │
 * │  │  ...                                                     │  │
 * │  └──────────────────────────────────────────────────────────┘  │
 * │                           │                                    │
 * │                           ▼                                    │
 * │  ┌──────────────────────────────────────────────────────────┐  │
 * │  │ LOOP (fills remaining bytecode space)          ◄─────┐   │  │
 * │  │  TARGET_OPCODE  ─┐                                   │   │  │
 * │  │  TARGET_OPCODE   │ unrolled N times                  │   │  │
 * │  │  TARGET_OPCODE   │ (N = available_bytes / instr_size)│   │  │
 * │  │  ...            ─┘                                   │   │  │
 * │  │  JUMP back ──────────────────────────────────────────┘   │  │
 * │  └──────────────────────────────────────────────────────────┘  │
 * │                                                                │
 * │  Executes until: OUT OF GAS                                    │
 * └────────────────────────────────────────────────────────────────┘
 * ```
 *
 * **Bytecode Layout:**
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ 0x00: SET instructions (setup)                                  │
 * │ ...                                                             │
 * │ 0xNN: ┌─── LOOP START ◄──────────────────────────────────────┐  │
 * │       │ TARGET_OPCODE                                        │  │
 * │       │ TARGET_OPCODE  (unrolled to fill max bytecode size)  │  │
 * │       │ TARGET_OPCODE                                        │  │
 * │       │ ...                                                  │  │
 * │       └─► JUMP 0xNN ─────────────────────────────────────────┘  │
 * │ MAX_BYTECODE_BYTES                                              │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ### Strategy 2: Side-Effect Limited Opcodes (Nested Call Pattern)
 *
 * For opcodes with per-TX limits (EMITNOTEHASH, EMITNULLIFIER, SENDL2TOL1MSG, etc.), we use a two-contract pattern where the inner contract executes side effects up to the limit, then REVERTs to discard them:
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                      OUTER CONTRACT                             │
 * │                                                                 │
 * │  ┌───────────────────────────────────────────────────────────┐  │
 * │  │ SETUP                                                     │  │
 * │  │  CALLDATACOPY inner_address from calldata[0]              │  │
 * │  │  SET l2Gas = MAX_UINT32                                   │  │
 * │  │  SET daGas = MAX_UINT32                                   │  │
 * │  └───────────────────────────────────────────────────────────┘  │
 * │                           │                                     │
 * │                           ▼                                     │
 * │  ┌───────────────────────────────────────────────────────────┐  │
 * │  │ LOOP                                               ◄────┐ │  │
 * │  │  CALL inner_contract ──────────────────────┐            │ │  │
 * │  │  JUMP back ─────────────────────────────────────────────┘ │  │
 * │  └───────────────────────────────────────────────────────────┘  │
 * │                                               │                 │
 * │  Executes until: OUT OF GAS                   │                 │
 * └───────────────────────────────────────────────│─────────────────┘
 *                                                 │
 *                                                 ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                      INNER CONTRACT                             │
 * │                                                                 │
 * │  ┌───────────────────────────────────────────────────────────┐  │
 * │  │ SETUP                                                     │  │
 * │  │  SET initial values for side-effect opcode                │  │
 * │  └───────────────────────────────────────────────────────────┘  │
 * │                           │                                     │
 * │                           ▼                                     │
 * │  ┌───────────────────────────────────────────────────────────┐  │
 * │  │ BODY (unrolled, NOT a loop)                               │  │
 * │  │  SIDE_EFFECT_OPCODE  ─┐                                   │  │
 * │  │  SIDE_EFFECT_OPCODE   │ repeated `limit` times            │  │
 * │  │  SIDE_EFFECT_OPCODE   │ (e.g., 64 for EMITNOTEHASH)       │  │
 * │  │  ...                 ─┘                                   │  │
 * │  └───────────────────────────────────────────────────────────┘  │
 * │                           │                                     │
 * │                           ▼                                     │
 * │  ┌───────────────────────────────────────────────────────────┐  │
 * │  │ CLEANUP                                                   │  │
 * │  │  REVERT (discards all side effects from this call)        │  │
 * │  └───────────────────────────────────────────────────────────┘  │
 * │                                                                 │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * **Why this pattern?**
 *
 * Side-effect opcodes have per-TX limits:
 * - `EMITNOTEHASH`: max 64 per TX
 * - `EMITNULLIFIER`: max 63 per TX (one reserved for TX nullifier)
 * - `SENDL2TOL1MSG`: max 8 per TX
 * - `EMITUNENCRYPTEDLOG`: limited by total log payload size
 *
 * By having the inner contract REVERT after emitting side effects, those effects are discarded, allowing the outer contract to call it again. This enables thousands of opcode executions per TX instead of just the limit.
 *
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
import { Grumpkin } from '@aztec/foundation/crypto/grumpkin';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { Bufferable } from '@aztec/foundation/serialize';
import type { CallStackMetadata, PublicTxResult } from '@aztec/stdlib/avm';

import assert from 'assert';

import {
  Field,
  INTEGRAL_TAGS,
  type MemoryValue,
  TaggedMemory,
  TypeTag,
  Uint1,
  Uint32,
  Uint64,
  VALID_TAGS,
} from '../avm/avm_memory_types.js';
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
} from '../avm/opcodes/index.js';
import { encodeToBytecode } from '../avm/serialization/bytecode_serialization.js';
import { Opcode } from '../avm/serialization/instruction_serialization.js';
import { deployCustomBytecode, executeCustomBytecode } from './custom_bytecode_tester.js';
import { deployAndExecuteCustomBytecode } from './index.js';
import type { PublicTxSimulationTester } from './public_tx_simulation_tester.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Memory cell to initialize before spamming.
 */
interface MemSetup {
  offset: number;
  value: MemoryValue;
}

/**
 * Some setup action to take before spamming.
 * Either a memory cell to initialize, or some instruction generator.
 */
type SetupItem = MemSetup | (() => Bufferable[]);

/**
 * Everything needed to spam an opcode.
 */
export interface SpamConfig {
  /** Memory cells to initialize */
  setup: SetupItem[];

  /** Factory to create target instruction(s) to spam */
  targetInstructions: () => Bufferable[];

  /** Instructions to run after target spam (e.g., REVERT) */
  cleanupInstructions?: () => Bufferable[];

  /**
   * Per-TX limit for the target opcode (for side-effect-limited opcodes)
   * If set:
   *   1. makes nested CALL
   *   2. executes target opcode #limit times in a nested call
   *   3. REVERT
   *   4. CALL again to repeat
   */
  limit?: number;

  /** Optional label for this config variant (e.g., UINT8 or MAXSIZE) */
  label?: string;
}

/**
 * An object containing opcode name and its SpamConfigs
 * Useful when ready to iterate over all opcodes and test them.
 */
export interface SpamConfigsForOpcode {
  /** Opcode name (e.g., "ADD_8") */
  opcode: string;

  /** All spam configs for this opcode (one or more) */
  configs: SpamConfig[];
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

const JUMP_SIZE = encodeToBytecode([new Jump(0)]).length; // JUMP_32

// ============================================================================
// Type Variant Helpers (for generating multiple configs per opcode)
// ============================================================================

const ALL_TAGS = Array.from(VALID_TAGS);
const INT_TAGS = Array.from(INTEGRAL_TAGS);

/** Build from tag truncating - shorter name */
function withTag(v: bigint, tag: TypeTag): MemoryValue {
  return TaggedMemory.buildFromTagTruncating(v, tag);
}

// ============================================================================
// Configuration Map
// ============================================================================

/**
 * Opcode spammer configs for ~all opcodes.
 * Each opcode maps to an array of configs (usually one, but can be multiple for type variants, etc.)
 * Uses smallest wire format (_8) for maximum instruction density.
 */
export const SPAM_CONFIGS: Partial<Record<Opcode, SpamConfig[]>> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // ARITHMETIC - Test with all type variants
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.ADD_8]: ALL_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [
      { offset: 0, value: withTag(1n, tag) }, // accumulator
      { offset: 1, value: withTag(1n, tag) }, // constant addend
    ],
    targetInstructions: () => [new Add(0, 0, 1, 0).as(Opcode.ADD_8, Add.wireFormat8)],
  })),

  [Opcode.SUB_8]: ALL_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [
      { offset: 0, value: withTag(1000000n, tag) }, // start high
      { offset: 1, value: withTag(1n, tag) }, // subtract 1
    ],
    targetInstructions: () => [new Sub(0, 0, 1, 0).as(Opcode.SUB_8, Sub.wireFormat8)],
  })),

  [Opcode.MUL_8]: ALL_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [
      { offset: 0, value: withTag(2n, tag) }, // accumulator
      { offset: 1, value: withTag(2n, tag) }, // multiply by 2
    ],
    targetInstructions: () => [new Mul(0, 0, 1, 0).as(Opcode.MUL_8, Mul.wireFormat8)],
  })),

  // DIV doesn't support FIELD type
  [Opcode.DIV_8]: INT_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [
      { offset: 0, value: withTag(111111111111111111n, tag) },
      { offset: 1, value: withTag(1n, tag) }, // divide by 2 (identity)
    ],
    targetInstructions: () => [new Div(0, 0, 1, 0).as(Opcode.DIV_8, Div.wireFormat8)],
  })),

  // Field-only
  [Opcode.FDIV_8]: [
    {
      setup: [
        { offset: 0, value: new Field(1000000n) },
        { offset: 1, value: new Field(1n) }, // divide by 1 (identity)
      ],
      targetInstructions: () => [new FieldDiv(0, 0, 1, 0).as(Opcode.FDIV_8, FieldDiv.wireFormat8)],
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPARATORS - Test with all type variants
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.EQ_8]: ALL_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [
      { offset: 0, value: withTag(42n, tag) },
      { offset: 1, value: withTag(42n, tag) },
    ],
    targetInstructions: () => [new Eq(0, 0, 1, 2).as(Opcode.EQ_8, Eq.wireFormat8)],
  })),

  [Opcode.LT_8]: ALL_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [
      { offset: 0, value: withTag(1n, tag) },
      { offset: 1, value: withTag(1000000n, tag) },
    ],
    targetInstructions: () => [new Lt(0, 0, 1, 2).as(Opcode.LT_8, Lt.wireFormat8)],
  })),

  [Opcode.LTE_8]: ALL_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [
      { offset: 0, value: withTag(1n, tag) },
      { offset: 1, value: withTag(1000000n, tag) },
    ],
    targetInstructions: () => [new Lte(0, 0, 1, 2).as(Opcode.LTE_8, Lte.wireFormat8)],
  })),

  // ═══════════════════════════════════════════════════════════════════════════
  // BITWISE - Integer types only (no FIELD)
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.AND_8]: INT_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [
      { offset: 0, value: withTag(0xffffffffffffffffffffffffffffffffn, tag) },
      { offset: 1, value: withTag(0xffffffffffffffffffffffffffffffffn, tag) },
    ],
    targetInstructions: () => [new And(0, 0, 1, 0).as(Opcode.AND_8, And.wireFormat8)],
  })),

  [Opcode.OR_8]: INT_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [
      { offset: 0, value: withTag(0xffffffffffffffffffffffffffffffffn, tag) },
      { offset: 1, value: withTag(0n, tag) },
    ],
    targetInstructions: () => [new Or(0, 0, 1, 0).as(Opcode.OR_8, Or.wireFormat8)],
  })),

  [Opcode.XOR_8]: INT_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [
      { offset: 0, value: withTag(0xdeadbeefcafebaben, tag) },
      { offset: 1, value: withTag(0x1234567890abcdefn, tag) },
    ],
    targetInstructions: () => [new Xor(0, 0, 1, 0).as(Opcode.XOR_8, Xor.wireFormat8)],
  })),

  [Opcode.NOT_8]: INT_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [{ offset: 0, value: withTag(0xffffffffffffffffn, tag) }],
    targetInstructions: () => [new Not(0, 0, 0).as(Opcode.NOT_8, Not.wireFormat8)],
  })),

  [Opcode.SHL_8]: INT_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [
      { offset: 0, value: withTag(1n, tag) },
      { offset: 1, value: withTag(1n, tag) },
    ],
    targetInstructions: () => [new Shl(0, 0, 1, 0).as(Opcode.SHL_8, Shl.wireFormat8)],
  })),

  [Opcode.SHR_8]: INT_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [
      { offset: 0, value: withTag(0xffffffffffffffffn, tag) },
      { offset: 1, value: withTag(1n, tag) },
    ],
    targetInstructions: () => [new Shr(0, 0, 1, 0).as(Opcode.SHR_8, Shr.wireFormat8)],
  })),

  // ═══════════════════════════════════════════════════════════════════════════
  // CAST / MOV - Test with all type variants
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.CAST_8]: ALL_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [{ offset: 0, value: withTag(42n, tag) }],
    targetInstructions: () => [new Cast(0, 0, 1, TypeTag.UINT32).as(Opcode.CAST_8, Cast.wireFormat8)],
  })),

  [Opcode.MOV_8]: ALL_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [{ offset: 0, value: withTag(42n, tag) }],
    targetInstructions: () => [new Mov(0, 0, 1).as(Opcode.MOV_8, Mov.wireFormat8)],
  })),

  // ═══════════════════════════════════════════════════════════════════════════
  // MEMORY - SET
  // ═══════════════════════════════════════════════════════════════════════════
  // Not testing all wire formats as they should be roughly the same in terms of simulation
  // and proving time
  //[Opcode.SET_8]: [
  //  {
  //    setup: [],
  //    targetInstructions: () => [new Set(0, 0, TypeTag.UINT8, 42).as(Opcode.SET_8, Set.wireFormat8)],
  //  },
  //],

  //[Opcode.SET_16]: [
  //  {
  //    setup: [],
  //    targetInstructions: () => [new Set(0, 0, TypeTag.UINT16, 4242).as(Opcode.SET_16, Set.wireFormat16)],
  //  },
  //],

  //[Opcode.SET_32]: [
  //  {
  //    setup: [],
  //    targetInstructions: () => [new Set(0, 0, TypeTag.UINT32, 424242).as(Opcode.SET_32, Set.wireFormat32)],
  //  },
  //],

  //[Opcode.SET_64]: [
  //  {
  //    setup: [],
  //    targetInstructions: () => [new Set(0, 0, TypeTag.UINT64, 42424242n).as(Opcode.SET_64, Set.wireFormat64)],
  //  },
  //],

  [Opcode.SET_128]: [
    {
      setup: [],
      targetInstructions: () => [
        new Set(0, 0, TypeTag.UINT128, 4242424242424242n).as(Opcode.SET_128, Set.wireFormat128),
      ],
    },
  ],

  //[Opcode.SET_FF]: [
  //  {
  //    setup: [],
  //    targetInstructions: () => [new Set(0, 0, TypeTag.FIELD, 42n).as(Opcode.SET_FF, Set.wireFormatFF)],
  //  },
  //],

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTROL FLOW
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.JUMP_32]: [
    {
      setup: [],
      // Target will be overwritten by loop builder
      targetInstructions: () => [new Jump(0)],
    },
  ],

  [Opcode.JUMPI_32]: [
    {
      setup: [{ offset: 0, value: new Uint1(0n) }], // Always false
      targetInstructions: () => [new JumpI(0, 0, 0)],
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // ENVIRONMENT
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.GETENVVAR_16]: [
    {
      setup: [],
      targetInstructions: () => [new GetEnvVar(0, 0, 0).as(Opcode.GETENVVAR_16, GetEnvVar.wireFormat16)],
    },
  ],

  [Opcode.CALLDATACOPY]: [
    {
      // CalldataCopy(indirect=0, copySizeOffset=0, cdStartOffset=1, dstOffset=2)
      // Copies M[0]=1 elements starting from CD[M[1]]=CD[0] into M[2].
      // In other words: M[2] = CD[0]
      setup: [
        { offset: 0, value: new Uint32(1n) }, // copySize = 1
        { offset: 1, value: new Uint32(0n) }, // cdStart = 0 (start copying from calldata[0])
      ],
      targetInstructions: () => [
        new CalldataCopy(/*indirect=*/ 0, /*copySizeOffset=*/ 0, /*cdStartOffset=*/ 1, /*dstOffset=*/ 2),
      ],
    },
  ],

  [Opcode.SUCCESSCOPY]: [
    {
      setup: [],
      targetInstructions: () => [new SuccessCopy(0, 0)],
    },
  ],

  [Opcode.RETURNDATASIZE]: [
    {
      setup: [],
      targetInstructions: () => [new ReturndataSize(0, 0)],
    },
  ],

  [Opcode.RETURNDATACOPY]: [
    {
      setup: [
        { offset: 0, value: new Uint32(0n) }, // copySize = 0
        { offset: 1, value: new Uint32(0n) }, // rdOffset
      ],
      targetInstructions: () => [new ReturndataCopy(0, 0, 1, 2)],
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // WORLD STATE READS
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.SLOAD]: [
    {
      setup: [{ offset: 0, value: new Field(0n) }], // slot
      targetInstructions: () => [new SLoad(0, 0, 1)],
    },
  ],

  [Opcode.NOTEHASHEXISTS]: [
    {
      setup: [
        { offset: 0, value: new Field(0n) }, // noteHash
        { offset: 1, value: new Uint64(0n) }, // leafIndex
      ],
      targetInstructions: () => [new NoteHashExists(0, 0, 1, 2)],
    },
  ],

  [Opcode.NULLIFIEREXISTS]: [
    {
      setup: [
        { offset: 0, value: new Field(0n) }, // nullifier
        { offset: 1, value: new Field(0n) }, // address
      ],
      targetInstructions: () => [new NullifierExists(0, 0, 1, 2)],
    },
  ],

  [Opcode.L1TOL2MSGEXISTS]: [
    {
      setup: [
        { offset: 0, value: new Field(0n) }, // msgHash
        { offset: 1, value: new Uint64(0n) }, // msgLeafIndex
      ],
      targetInstructions: () => [new L1ToL2MessageExists(0, 0, 1, 2)],
    },
  ],

  [Opcode.GETCONTRACTINSTANCE]: [
    {
      setup: [{ offset: 0, value: new Field(0n) }], // address
      targetInstructions: () => [new GetContractInstance(0, 0, 1, 0)], // memberEnum 0 = DEPLOYER
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // SIDE-EFFECT LIMITED (have per-TX limit, use nested call pattern)
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.EMITNOTEHASH]: [
    {
      setup: [
        { offset: 0, value: new Field(0x1000n) },
        { offset: 1, value: new Uint32(0n) }, // revertSize
      ],
      targetInstructions: () => [new EmitNoteHash(0, 0)],
      cleanupInstructions: () => [new Revert(0, 1, 0).as(Opcode.REVERT_8, Revert.wireFormat8)], // revert with empty
      limit: MAX_NOTE_HASHES_PER_TX,
    },
  ],

  [Opcode.EMITNULLIFIER]: [
    {
      // Nullifiers must be unique - increment value after each emit
      // Memory layout: offset 0 = nullifier value, offset 1 = constant 1 for incrementing
      setup: [
        { offset: 0, value: new Field(0x2000n) }, // nullifier (will be incremented)
        { offset: 1, value: new Field(1n) }, // constant 1 for ADD
        { offset: 2, value: new Uint32(0n) }, // revertSize
      ],
      targetInstructions: () => [
        new EmitNullifier(0, 0),
        new Add(0, 0, 1, 0).as(Opcode.ADD_8, Add.wireFormat8), // nullifier++
      ],
      cleanupInstructions: () => [new Revert(0, 2, 0).as(Opcode.REVERT_8, Revert.wireFormat8)], // revert with empty
      limit: MAX_NULLIFIERS_PER_TX - 1, // minus 1 because a TX will always have 1 "TX nullifier" from private
    },
  ],

  [Opcode.SENDL2TOL1MSG]: [
    {
      setup: [
        { offset: 0, value: new Field(1n) }, // recipient
        { offset: 1, value: new Field(0x3000n) }, // content
        { offset: 2, value: new Uint32(0n) }, // revertSize
      ],
      targetInstructions: () => [new SendL2ToL1Message(0, 0, 1)],
      cleanupInstructions: () => [new Revert(0, 2, 0).as(Opcode.REVERT_8, Revert.wireFormat8)], // revert with empty
      limit: MAX_L2_TO_L1_MSGS_PER_TX,
    },
  ],

  // SSTORE IS NOT STRICTLY A SIDE-EFFECT LIMITED OPCODE
  // SSTORE to the same slot repeatedly has no limit - it just overwrites the same slot.
  // Only writing to unique slots would hit MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX.
  [Opcode.SSTORE]: [
    {
      setup: [
        { offset: 0, value: new Field(42n) }, // value
        { offset: 1, value: new Field(0x100n) }, // slot (same slot each iteration)
        { offset: 2, value: new Uint32(0n) }, // revertSize
      ],
      targetInstructions: () => [new SStore(0, 0, 1)],
      cleanupInstructions: () => [new Revert(0, 2, 0).as(Opcode.REVERT_8, Revert.wireFormat8)], // revert with empty
    },
  ],

  // EMITUNENCRYPTEDLOG - two configs: minimal (many small logs) and max-size (one large log)
  [Opcode.EMITUNENCRYPTEDLOG]: [
    {
      label: 'Many empty logs, revert, repeat',
      setup: [
        { offset: 0, value: new Uint32(0n) }, // logSize = 0 fields (minimal)
        { offset: 1, value: new Uint32(0n) }, // revertSize
      ],
      targetInstructions: () => [new EmitUnencryptedLog(0, 0, 1)], // logOffset doesn't matter when size is 0
      cleanupInstructions: () => [new Revert(0, 1, 0).as(Opcode.REVERT_8, Revert.wireFormat8)], // revert with empty
      // Max logs with 0-field content: floor(4096 / 2) = 2048
      limit: Math.floor(FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH / PUBLIC_LOG_HEADER_LENGTH),
    },
    {
      label: 'One max size log, revert, repeat',
      setup: [
        // logSize = MAX_PUBLIC_LOG_SIZE_IN_FIELDS
        { offset: 0, value: new Uint32(BigInt(MAX_PUBLIC_LOG_SIZE_IN_FIELDS)) },
        { offset: 1, value: new Uint32(0n) }, // revertSize
        // NOTE: We don't initialize the log contents and just let it use default values (Field(0n))
        // so that we save more gas and bytecode space for the Emit.
        //// Initialize all log content fields to zero (FIELD type)
        //...Array.from({ length: MAX_PUBLIC_LOG_SIZE_IN_FIELDS }, (_, i) => ({
        //  offset: 2 + i,
        //  value: new Field(0n),
        //})),
      ],
      targetInstructions: () => [new EmitUnencryptedLog(0, 0, 2)], // uses logOffset 2 (uninitialized Field(0))
      cleanupInstructions: () => [new Revert(0, 1, 0).as(Opcode.REVERT_8, Revert.wireFormat8)], // revert with empty
      limit: 1, // Only 1 max-size log fits
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // GADGETS - Use non-trivial inputs to avoid special-case optimizations
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.POSEIDON2]: [
    {
      // Poseidon2 takes 4 field elements as input
      setup: Array.from({ length: 4 }, (_, i) => ({
        offset: i,
        value: new Field(BigInt(0xdeadbeef + i * 0x1111)),
      })),
      // Poseidon hash data at M[0..3], write result to M[0:3] (reuse results as next inputs)
      targetInstructions: () => [new Poseidon2(0, 0, 0)],
    },
  ],

  [Opcode.SHA256COMPRESSION]: [
    {
      setup: [
        // State: 8 x UINT32 at offsets 0-7 (use SHA256 initial hash values)
        { offset: 0, value: new Uint32(0x6a09e667n) },
        { offset: 1, value: new Uint32(0xbb67ae85n) },
        { offset: 2, value: new Uint32(0x3c6ef372n) },
        { offset: 3, value: new Uint32(0xa54ff53an) },
        { offset: 4, value: new Uint32(0x510e527fn) },
        { offset: 5, value: new Uint32(0x9b05688cn) },
        { offset: 6, value: new Uint32(0x1f83d9abn) },
        { offset: 7, value: new Uint32(0x5be0cd19n) },
        // Inputs: 16 x UINT32 at offsets 8-23 (non-trivial message block)
        ...Array.from({ length: 16 }, (_, i) => ({
          offset: 8 + i,
          value: new Uint32((0xcafebaben + BigInt(i) * 0x01010101n) & 0xffffffffn),
        })),
      ],
      targetInstructions: () => [new Sha256Compression(0, 0, 0, 8)],
    },
  ],

  [Opcode.KECCAKF1600]: [
    {
      // Keccak state: 25 x UINT64 (5x5 lane array)
      setup: Array.from({ length: 25 }, (_, i) => ({
        offset: i,
        value: new Uint64((0xdeadbeefcafebaben + BigInt(i) * 0x0101010101010101n) & 0xffffffffffffffffn),
      })),
      targetInstructions: () => [new KeccakF1600(0, 0, 0)],
    },
  ],

  [Opcode.ECADD]: [
    {
      // Use the Grumpkin generator point G for both points (valid curve point)
      setup: [
        { offset: 0, value: new Field(Grumpkin.generator.x) }, // p1X = G.x
        { offset: 1, value: new Field(Grumpkin.generator.y) }, // p1Y = G.y
        { offset: 2, value: new Uint1(0n) }, // p1IsInfinite = false
        { offset: 3, value: new Field(Grumpkin.generator.x) }, // p2X = G.x
        { offset: 4, value: new Field(Grumpkin.generator.y) }, // p2Y = G.y
        { offset: 5, value: new Uint1(0n) }, // p2IsInfinite = false
      ],
      targetInstructions: () => [new EcAdd(0, 0, 1, 2, 3, 4, 5, 0)],
    },
  ],

  [Opcode.TORADIXBE]: [
    {
      setup: [
        { offset: 0, value: new Field(0xdeadbeefcafebaben) }, // non-trivial src value
        { offset: 1, value: new Uint32(16n) }, // radix = 16 (hex)
        { offset: 2, value: new Uint32(16n) }, // numLimbs = 16
        { offset: 3, value: new Uint1(0n) }, // outputBits = false
      ],
      targetInstructions: () => [new ToRadixBE(0, 0, 1, 2, 3, 4)],
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // MISC
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.DEBUGLOG]: [
    {
      setup: [
        { offset: 0, value: new Field(0n) }, // level (0 = trace)
        { offset: 1, value: new Field(0n) }, // message
        { offset: 2, value: new Field(0n) }, // fields
        { offset: 3, value: new Uint32(0n) }, // fieldsSize = 0
      ],
      targetInstructions: () => [new DebugLog(0, 0, 1, 2, 3, 0)], // messageSize = 0
    },
  ],
};

/**
 * Get all spam test cases grouped by opcode.
 * This is the main entry point for tests - it handles all the complexity of
 * type variants, multiple configs, etc.
 *
 * Returns hierarchical structure for nested describe blocks in tests.
 */
export function getSpamConfigsPerOpcode(): SpamConfigsForOpcode[] {
  const groups: SpamConfigsForOpcode[] = [];

  for (const [opcodeKey, configs] of Object.entries(SPAM_CONFIGS)) {
    const opcode = Opcode[Number(opcodeKey) as Opcode];
    if (!configs) {
      throw new Error(`Opcode ${opcode} listed in spam configs, but empty`);
    }

    const cases: SpamConfig[] = configs.map(config => ({
      ...config,
      // unlabeled configs just get opcode name
      label: config.label ? `${opcode}/${config.label}` : opcode,
    }));

    groups.push({ opcode: opcode, configs: cases });
  }

  return groups;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a SET instruction from a MemoryValue.
 * Chooses smallest SET variant based on offset and value magnitude for optimal bytecode density.
 */
function createSetInstruction(offset: number, memValue: MemoryValue): Bufferable {
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
 * Append (to the instructions array) the SET instructions for the setup.
 *
 * @param instructions - the instructions array to append the setup to
 * @param setup - the setup configuration specifying what SETs to do
 */
function appendSetupInstructions(instructions: Bufferable[], setup: SetupItem[]): void {
  for (const item of setup) {
    if (typeof item === 'function') {
      // item is a function that creates setup instructions (like)
      instructions.push(...item());
    } else {
      // MemSetup
      instructions.push(createSetInstruction(item.offset, item.value));
    }
  }
}

/**
 * Append (to the instructions array) the target instructions nTimes times.
 *
 * @param instructions - the instructions array to append the loop to
 * @param config - the spam config to use
 * @param nTimes - the number of times to append the target instructions
 * @returns the number of target instructions appended
 */
function appendTargetNTimes(instructions: Bufferable[], config: SpamConfig, nTimes: number) {
  for (let i = 0; i < nTimes; i++) {
    instructions.push(...config.targetInstructions());
  }
}

/**
 * Append (to the instructions array) an infinite loop that maximizes target instruction density.
 * Fills remaining bytecode space with unrolled target instructions.
 *
 * @param instructions - the instructions array to append the loop to
 * @param config - the spam config to use
 * @returns the number of target instructions in the loop body
 */
function appendInfiniteLoop(instructions: Bufferable[], config: SpamConfig): number {
  const setupBytecode = encodeToBytecode(instructions);
  const setupSize = setupBytecode.length;

  // Compute the size of the target instruction(s)
  const targetSize = encodeToBytecode(config.targetInstructions()).length;

  // Fill remaining space (loop body) with target instructions
  const availableForLoopBody = MAX_BYTECODE_BYTES - setupSize - JUMP_SIZE;
  const numTargetsInLoopBody = Math.floor(availableForLoopBody / targetSize);

  const loopStartPc = setupSize;
  appendTargetNTimes(instructions, config, numTargetsInLoopBody);
  instructions.push(new Jump(loopStartPc)); // JUMP_SIZE (JUMP_32)

  return numTargetsInLoopBody;
}

/**
 * Generate basic opcode spam bytecode from a SpamConfig.
 * Spams the target instruction(s) in an infinite loop until out-of-gas.
 */
export function createOpcodeSpamBytecode(config: SpamConfig): Buffer {
  assert(
    config.limit === undefined,
    'If config has `limit`, use createSideEffectLimitedSpamInRevertingNestedCall instead',
  );

  const instructions: Bufferable[] = [];

  // 1. Setup memory
  appendSetupInstructions(instructions, config.setup);

  // 2. Infinite loop - maximize iterations until out-of-gas
  appendInfiniteLoop(instructions, config);

  return encodeToBytecode(instructions);
}

/**
 * Generate a bytecode that spams a side-effect limited opcode #limit times
 * NOT in a loop, but inline/unrolled. Then revert.
 *
 * @param config - the side-effect limited spam config to use
 * @returns the bytecode for the side-effect limited spam
 */
export function createSideEffectSpamBytecode(config: SpamConfig): Buffer {
  assert(
    config.limit !== undefined,
    'If config has `limit`, use createSideEffectLimitedSpamInRevertingNestedCall instead',
  );
  const instructions: Bufferable[] = [];

  // 1. Setup
  appendSetupInstructions(instructions, config.setup);

  // 2. Body - run target instruction(s) #limit times
  appendTargetNTimes(instructions, config, config.limit);

  // 3. Cleanup (revert)
  if (config.cleanupInstructions) {
    instructions.push(...config.cleanupInstructions());
  }

  return encodeToBytecode(instructions);
}

/** Reserved memory offsets for outer call loop */
const CONST_1_OFFSET = 0;
const CALL_L2_GAS_OFFSET = 1;
const CALL_DA_GAS_OFFSET = 2;
const CALL_ADDR_OFFSET = 3;
const CALL_ARGS_SIZE = 4;
const CALL_ARGS_OFFSET = 5;
const CALLDATA_INDEX_OFFSET = 6; // calldata index as in calldata[index]

/**
 * A SpamConfig for an external call loop.
 */
const EXTERNAL_CALL_LOOP_CONFIG: SpamConfig = {
  setup: [
    // calldata will contain 1 item: the external call address
    { offset: CONST_1_OFFSET, value: new Uint32(1) }, // calldata size = 1
    { offset: CALLDATA_INDEX_OFFSET, value: new Uint32(0) }, // we want calldata[0]
    { offset: CALL_L2_GAS_OFFSET, value: new Uint32(0xffffffffn) }, // l2Gas = max uint32
    { offset: CALL_DA_GAS_OFFSET, value: new Uint32(0xffffffffn) }, // daGas = max uint32
    () => [new CalldataCopy(0, /*copySizeOffset=*/ CONST_1_OFFSET, CALLDATA_INDEX_OFFSET, CALL_ADDR_OFFSET)], // address = calldata[0] of parent call
    { offset: CALL_ARGS_SIZE, value: new Uint32(0) }, // argsSize = max uint32
    { offset: CALL_ARGS_SIZE, value: new Uint32(0) }, // argsSize = max uint32
  ],
  targetInstructions: () => [
    new Call(0, CALL_L2_GAS_OFFSET, CALL_DA_GAS_OFFSET, CALL_ADDR_OFFSET, CALL_ARGS_SIZE, CALL_ARGS_OFFSET),
  ],
};

/**
 * Create bytecode that makes an external call in a loop.
 *
 * @returns the bytecode for the external call loop
 */
export function createExternalCallLoopBytecode(): Buffer {
  const config = EXTERNAL_CALL_LOOP_CONFIG;
  const instructions: Bufferable[] = [];

  // 1. Setup memory
  appendSetupInstructions(instructions, config.setup);
  // 2. Infinite loop of external calls - maximize iterations until out-of-gas
  appendInfiniteLoop(instructions, config);
  return encodeToBytecode(instructions);
}

async function testStandardOpcodeSpam(
  tester: PublicTxSimulationTester,
  config: SpamConfig,
  expectToBeTrue: (x: boolean) => void,
): Promise<PublicTxResult> {
  const bytecode = createOpcodeSpamBytecode(config);
  const result = await deployAndExecuteCustomBytecode(bytecode, tester, config.label);

  // should have halted with out of gas
  expectToBeTrue(!result.revertCode.isOK());
  const revertReason = result.findRevertReason()?.message.toLowerCase();
  const allowedReasons = ['out of gas', 'not enough l2gas'];
  // expect the reason to match ONE of the allowed reasons
  expectToBeTrue(allowedReasons.some(allowedReason => revertReason!.includes(allowedReason)));
  return result;
}

async function testSideEffectOpcodeSpam(
  tester: PublicTxSimulationTester,
  config: SpamConfig,
  expectToBeTrue: (x: boolean) => void,
): Promise<PublicTxResult> {
  const innerBytecode = createSideEffectSpamBytecode(config);
  const outerBytecode = createExternalCallLoopBytecode();
  const innerContract = await deployCustomBytecode(innerBytecode, tester, `${config.label}_Inner`);
  const outerContract = await deployCustomBytecode(outerBytecode, tester, `${config.label}_Outer`);
  // Outer contract reads calldata[0] as inner contract address to CALL to
  const result = await executeCustomBytecode(outerContract, tester, config.label, [innerContract.address.toField()]);

  // should have halted with out of gas or explicit REVERT (assertion failed)
  expectToBeTrue(!result.revertCode.isOK());
  const revertReason = result.findRevertReason()?.message.toLowerCase();
  const allowedReasons = ['assertion failed', 'out of gas', 'not enough l2gas'];
  // expect the reason to match ONE of the allowed reasons
  expectToBeTrue(allowedReasons.some(allowedReason => revertReason!.includes(allowedReason)));

  // Top-level should _always_ run out of gas for these tests
  // Check top-level halting message
  // WARNING: only the C++ simulator (or TsVsCpp) will have haltingMessage
  const allowedOuterReasons = ['out of gas', 'not enough l2gas'];
  const outerCallMetadata = result.callStackMetadata[0] as CallStackMetadata;
  const outerReason = outerCallMetadata.haltingMessage?.toLowerCase();
  // expect the reason to match ONE of the allowed reasons
  expectToBeTrue(allowedOuterReasons.some(allowedReason => outerReason!.includes(allowedReason)));

  return result;
}

export async function testOpcodeSpamCase(
  tester: PublicTxSimulationTester,
  config: SpamConfig,
  expectToBeTrue: (x: boolean) => void = () => {}, // default no-op
): Promise<PublicTxResult> {
  if (config.limit) {
    return await testSideEffectOpcodeSpam(tester, config, expectToBeTrue);
  }
  return await testStandardOpcodeSpam(tester, config, expectToBeTrue);
}
