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
 * - `EMITPUBLICLOG`: limited by total log payload size
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
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_PUBLIC_LOG_SIZE_IN_FIELDS,
  PUBLIC_LOG_HEADER_LENGTH,
} from '@aztec/constants';
import { Grumpkin } from '@aztec/foundation/crypto/grumpkin';
import { randomBigInt } from '@aztec/foundation/crypto/random';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { Bufferable } from '@aztec/foundation/serialize';
import { type CallStackMetadata, PublicDataWrite, type PublicTxResult } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import { MerkleTreeId } from '@aztec/stdlib/trees';

import assert from 'assert';

import { Field, type MemoryValue, TaggedMemory, TypeTag, Uint1, Uint32, Uint64 } from '../avm/avm_memory_types.js';
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
  EmitPublicLog,
  Eq,
  FieldDiv,
  GetContractInstance,
  GetEnvVar,
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
} from '../avm/opcodes/index.js';
import { encodeToBytecode } from '../avm/serialization/bytecode_serialization.js';
import { Opcode } from '../avm/serialization/instruction_serialization.js';
import { deployCustomBytecode, executeCustomBytecode } from './custom_bytecode_tester.js';
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

  /** Whether to pass the contract address as calldata[0] */
  addressAsCalldata?: boolean;
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
 * Constants for "warm" tree reads - these values are inserted into the trees
 * before running the spammer so that existence checks can find them.
 */
export const WARM_NOTE_HASH = new Fr(0xdeadbeefn);
export const WARM_L1_TO_L2_MSG = new Fr(0xcafebabedeadbeefn);

/** Warm nullifier constant - a pre-siloed nullifier value inserted directly into the tree */
export const WARM_SILOED_NULLIFIER = new Fr(0xdeadbeef0001n);

/** Warm storage constants - storage is inserted for the deployed contract's address */
export const WARM_STORAGE_SLOT = new Fr(0xdeadbeef0002n);
export const WARM_STORAGE_VALUE = new Fr(0xcafebabe0003n);

/**
 * Leaf indices inserted to by insertWarmTreeEntries().
 * Ideally we'd getTreeInfo and set dynamically, but that doesn't
 * work easily with static spam configs, so we assume intial index 0.
 */
export const WARM_NOTE_HASH_LEAF_INDEX = 0n;
export const WARM_L1_TO_L2_MSG_LEAF_INDEX = 0n;

/**
 * Insert entries into the trees so that "warm" configs can find them with existence checks.
 * Call this before running the opcode spammer to enable warm tree reads.
 *
 * Inserts:
 * - Note hash into NOTE_HASH_TREE
 * - L1 to L2 message into L1_TO_L2_MESSAGE_TREE
 * - Siloed nullifier into NULLIFIER_TREE (for NULLIFIEREXISTS warm check)
 * - Storage value into PUBLIC_DATA_TREE (for SLOAD warm check)
 */
export async function insertWarmTreeEntries(
  merkleTrees: MerkleTreeWriteOperations,
  contractAddress: AztecAddress,
): Promise<void> {
  // Insert into note hash tree
  await merkleTrees.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, [WARM_NOTE_HASH]);

  // Insert into L1 to L2 message tree
  await merkleTrees.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, [WARM_L1_TO_L2_MSG]);

  // Insert siloed nullifier into nullifier tree (already siloed - used directly by NULLIFIEREXISTS)
  await merkleTrees.sequentialInsert(MerkleTreeId.NULLIFIER_TREE, [WARM_SILOED_NULLIFIER.toBuffer()]);

  // Insert storage value into public data tree
  const leafSlot = await computePublicDataTreeLeafSlot(contractAddress, WARM_STORAGE_SLOT);
  const publicDataWrite = new PublicDataWrite(leafSlot, WARM_STORAGE_VALUE);
  await merkleTrees.sequentialInsert(MerkleTreeId.PUBLIC_DATA_TREE, [publicDataWrite.toBuffer()]);
}

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
const INTERNALCALL_SIZE = encodeToBytecode([new InternalCall(0)]).length;

// ============================================================================
// Type Variant Helpers (for generating multiple configs per opcode)
// ============================================================================

// Not using these sets directly because we want to control order
//const ALL_TAGS = Array.from(VALID_TAGS);
//const INT_TAGS = Array.from(INTEGRAL_TAGS);
// Ordered so that limiting #configs per opcode still tests max size (Field)
const ALL_TAGS = [
  TypeTag.FIELD,
  TypeTag.UINT1,
  TypeTag.UINT8,
  TypeTag.UINT16,
  TypeTag.UINT32,
  TypeTag.UINT64,
  TypeTag.UINT128,
];

// ordered so that limiting #configs per opcode still tests max size
const INT_TAGS = [TypeTag.UINT128, TypeTag.UINT1, TypeTag.UINT8, TypeTag.UINT16, TypeTag.UINT32, TypeTag.UINT64];

/** Build from tag truncating - shorter name */
function withTag(v: bigint, tag: TypeTag): MemoryValue {
  return TaggedMemory.buildFromTagTruncating(v, tag);
}

// ============================================================================
// Random Value Helpers (seeded via SEED env var for reproducibility)
// ============================================================================

/** Modulus (really just max+1) for each integer type tag */
const TAG_MODULI: Partial<Record<TypeTag, bigint>> = {
  [TypeTag.UINT1]: 2n,
  [TypeTag.UINT8]: 256n,
  [TypeTag.UINT16]: 65536n,
  [TypeTag.UINT32]: 0x1_0000_0000n,
  [TypeTag.UINT64]: 0x1_0000_0000_0000_0000n,
  [TypeTag.UINT128]: 0x1_0000_0000_0000_0000_0000_0000_0000_0000n,
  [TypeTag.FIELD]: Fr.MODULUS,
};

/** Generate a random value with the given type tag. Uses SEED env var if set. */
function randomWithTag(tag: TypeTag): MemoryValue {
  const modulus = TAG_MODULI[tag];
  if (modulus === undefined) {
    throw new Error(`Unsupported tag for random generation: ${TypeTag[tag]}`);
  }
  const value = randomBigInt(modulus);
  return TaggedMemory.buildFromTagTruncating(value, tag);
}

/** Generate a random non-zero value with the given type tag (for division). */
function randomNonZeroWithTag(tag: TypeTag): MemoryValue {
  const modulus = TAG_MODULI[tag];
  if (modulus === undefined) {
    throw new Error(`Unsupported tag for random generation: ${TypeTag[tag]}`);
  }
  // Generate random in range [1, max) by generating [0, max-1) and adding 1
  const value = randomBigInt(modulus - 1n) + 1n;
  return TaggedMemory.buildFromTagTruncating(value, tag);
}

/** Generate a random non-zero Field value (for field division). */
function randomNonZeroField(): Field {
  return new Field(randomBigInt(Fr.MODULUS - 1n) + 1n);
}

/** Reserved memory offsets for external call loop (used by CALL spam and side-effect opcodes) */
const CONST_0_OFFSET = 0; // Uint32(0)
const CONST_1_OFFSET = 1; // Uint32(1)
const CONST_MAX_U32_OFFSET = 2; // Uint32(MAX_U32)
const CALL_ADDR_OFFSET = 3; // copy addr from calldata to here, and then use this addr for CALL
const CALL_ARGS_OFFSET = CALL_ADDR_OFFSET; // address is the arg to send to CALL
const CALL_COPY_SIZE_OFFSET = CONST_1_OFFSET; // copy size = 1 (forward calldata[0])
const CALL_CALLDATA_INDEX_OFFSET = CONST_0_OFFSET; // calldata[0]
const CALL_L2_GAS_OFFSET = CONST_MAX_U32_OFFSET; // MAX_U32 gets capped to remaining gas by AVM
const CALL_DA_GAS_OFFSET = CONST_MAX_U32_OFFSET; // MAX_U32 gets capped to remaining gas by AVM
const CALL_ARGS_SIZE_OFFSET = CONST_1_OFFSET; // argsSize = 1 (forward calldata[0] - might contain contract address)
const MAX_U32 = 0xffffffffn;

/**
 * A SpamConfig for to make external CALLs to an address specified in calldata[0].
 */
export const EXTERNAL_CALL_CONFIG: SpamConfig = {
  setup: [
    // calldata will contain 1 item: the external call address
    { offset: CONST_0_OFFSET, value: new Uint32(0) }, // used for cdStartOffset
    { offset: CONST_1_OFFSET, value: new Uint32(1) }, // used for copySize and argsSize
    { offset: CONST_MAX_U32_OFFSET, value: new Uint32(MAX_U32) }, // l2Gas/daGas - MAX_U32 gets capped to remaining gas
    () => [
      new CalldataCopy(
        /*addressing_mode=*/ 0,
        /*copySizeOffset=*/ CALL_COPY_SIZE_OFFSET,
        /*cdStartOffset=*/ CALL_CALLDATA_INDEX_OFFSET,
        /*dstOffset=*/ CALL_ADDR_OFFSET,
      ),
    ], // address = calldata[0] of parent call
  ],
  targetInstructions: () => [
    new Call(
      /*addressing_mode=*/ 0,
      /*l2GasOffset=*/ CALL_L2_GAS_OFFSET,
      /*daGasOffset=*/ CALL_DA_GAS_OFFSET,
      /*addrOffset=*/ CALL_ADDR_OFFSET,
      /*argsSizeOffset=*/ CALL_ARGS_SIZE_OFFSET,
      /*argsOffset=*/ CALL_ARGS_OFFSET,
    ),
  ],
  addressAsCalldata: true, // indicates that the contract address should be passed as calldata[0]
};

const STATIC_CALL_CONFIG: SpamConfig = {
  setup: [
    // calldata will contain 1 item: the external call address
    { offset: CONST_0_OFFSET, value: new Uint32(0) }, // used for cdStartOffset
    { offset: CONST_1_OFFSET, value: new Uint32(1) }, // used for copySize and argsSize
    { offset: CONST_MAX_U32_OFFSET, value: new Uint32(MAX_U32) }, // l2Gas/daGas - MAX_U32 gets capped to remaining gas
    () => [
      new CalldataCopy(
        /*addressing_mode=*/ 0,
        /*copySizeOffset=*/ CALL_COPY_SIZE_OFFSET,
        /*cdStartOffset=*/ CALL_CALLDATA_INDEX_OFFSET,
        /*dstOffset=*/ CALL_ADDR_OFFSET,
      ),
    ], // address = calldata[0] of parent call
  ],
  targetInstructions: () => [
    new StaticCall(
      /*addressing_mode=*/ 0,
      /*l2GasOffset=*/ CALL_L2_GAS_OFFSET,
      /*daGasOffset=*/ CALL_DA_GAS_OFFSET,
      /*addrOffset=*/ CALL_ADDR_OFFSET,
      /*argsSizeOffset=*/ CALL_ARGS_SIZE_OFFSET,
      /*argsOffset=*/ CALL_ARGS_OFFSET,
    ),
  ],
  addressAsCalldata: true, // indicates that the contract address should be passed as calldata[0]
};

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
  // ARITHMETIC - Test with all type variants (random values, seeded via SEED env var)
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.ADD_8]: ALL_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [
      { offset: 0, value: randomWithTag(tag) }, // random accumulator
      { offset: 1, value: randomWithTag(tag) }, // random addend
    ],
    targetInstructions: () => [
      new Add(/*addressing_mode=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 0).as(
        Opcode.ADD_8,
        Add.wireFormat8,
      ),
    ],
  })),

  [Opcode.SUB_8]: ALL_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [
      { offset: 0, value: randomWithTag(tag) }, // random minuend
      { offset: 1, value: randomWithTag(tag) }, // random subtrahend
    ],
    targetInstructions: () => [
      new Sub(/*addressing_mode=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 0).as(
        Opcode.SUB_8,
        Sub.wireFormat8,
      ),
    ],
  })),

  [Opcode.MUL_8]: ALL_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [
      { offset: 0, value: randomWithTag(tag) }, // random multiplicand
      { offset: 1, value: randomWithTag(tag) }, // random multiplier
    ],
    targetInstructions: () => [
      new Mul(/*addressing_mode=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 0).as(
        Opcode.MUL_8,
        Mul.wireFormat8,
      ),
    ],
  })),

  // DIV doesn't support FIELD type
  [Opcode.DIV_8]: INT_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [
      { offset: 0, value: randomWithTag(tag) }, // random dividend
      { offset: 1, value: randomNonZeroWithTag(tag) }, // random non-zero divisor
    ],
    targetInstructions: () => [
      new Div(/*addressing_mode=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 0).as(
        Opcode.DIV_8,
        Div.wireFormat8,
      ),
    ],
  })),

  // Field-only
  [Opcode.FDIV_8]: [
    {
      setup: [
        { offset: 0, value: new Field(Fr.random()) }, // random dividend
        { offset: 1, value: randomNonZeroField() }, // random non-zero divisor
      ],
      targetInstructions: () => [
        new FieldDiv(/*addressing_mode=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 0).as(
          Opcode.FDIV_8,
          FieldDiv.wireFormat8,
        ),
      ],
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPARATORS - Test with all type variants (random values)
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.EQ_8]: ALL_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [
      { offset: 0, value: randomWithTag(tag) }, // random value a
      { offset: 1, value: randomWithTag(tag) }, // random value b
    ],
    targetInstructions: () => [
      new Eq(/*addressing_mode=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).as(Opcode.EQ_8, Eq.wireFormat8),
    ],
  })),

  [Opcode.LT_8]: ALL_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [
      { offset: 0, value: randomWithTag(tag) }, // random value a
      { offset: 1, value: randomWithTag(tag) }, // random value b
    ],
    targetInstructions: () => [
      new Lt(/*addressing_mode=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).as(Opcode.LT_8, Lt.wireFormat8),
    ],
  })),

  [Opcode.LTE_8]: ALL_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [
      { offset: 0, value: randomWithTag(tag) }, // random value a
      { offset: 1, value: randomWithTag(tag) }, // random value b
    ],
    targetInstructions: () => [
      new Lte(/*addressing_mode=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).as(
        Opcode.LTE_8,
        Lte.wireFormat8,
      ),
    ],
  })),

  // ═══════════════════════════════════════════════════════════════════════════
  // BITWISE - Integer types only (no FIELD) (random values)
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.AND_8]: INT_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [
      { offset: 0, value: randomWithTag(tag) }, // random value a
      { offset: 1, value: randomWithTag(tag) }, // random value b
    ],
    targetInstructions: () => [
      new And(/*addressing_mode=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 0).as(
        Opcode.AND_8,
        And.wireFormat8,
      ),
    ],
  })),

  [Opcode.OR_8]: INT_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [
      { offset: 0, value: randomWithTag(tag) }, // random value a
      { offset: 1, value: randomWithTag(tag) }, // random value b
    ],
    targetInstructions: () => [
      new Or(/*addressing_mode=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 0).as(Opcode.OR_8, Or.wireFormat8),
    ],
  })),

  [Opcode.XOR_8]: INT_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [
      { offset: 0, value: randomWithTag(tag) }, // random value a
      { offset: 1, value: randomWithTag(tag) }, // random value b
    ],
    targetInstructions: () => [
      new Xor(/*addressing_mode=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 0).as(
        Opcode.XOR_8,
        Xor.wireFormat8,
      ),
    ],
  })),

  [Opcode.NOT_8]: INT_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [{ offset: 0, value: randomWithTag(tag) }], // random value
    targetInstructions: () => [
      new Not(/*addressing_mode=*/ 0, /*srcOffset=*/ 0, /*dstOffset=*/ 0).as(Opcode.NOT_8, Not.wireFormat8),
    ],
  })),

  [Opcode.SHL_8]: INT_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [
      { offset: 0, value: randomWithTag(tag) }, // random value to shift
      { offset: 1, value: withTag(1n, tag) }, // shift by 1 (small fixed amount to avoid overflow)
    ],
    targetInstructions: () => [
      new Shl(/*addressing_mode=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 0).as(
        Opcode.SHL_8,
        Shl.wireFormat8,
      ),
    ],
  })),

  [Opcode.SHR_8]: INT_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [
      { offset: 0, value: randomWithTag(tag) }, // random value to shift
      { offset: 1, value: withTag(1n, tag) }, // shift by 1 (small fixed amount)
    ],
    targetInstructions: () => [
      new Shr(/*addressing_mode=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 0).as(
        Opcode.SHR_8,
        Shr.wireFormat8,
      ),
    ],
  })),

  // ═══════════════════════════════════════════════════════════════════════════
  // CAST / MOV - Test with all type variants (random values)
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.CAST_8]: ALL_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [{ offset: 0, value: randomWithTag(tag) }], // random value to cast
    targetInstructions: () => [
      new Cast(/*addressing_mode=*/ 0, /*srcOffset=*/ 0, /*dstOffset=*/ 1, /*dstTag=*/ TypeTag.UINT32).as(
        Opcode.CAST_8,
        Cast.wireFormat8,
      ),
    ],
  })),

  [Opcode.MOV_8]: ALL_TAGS.map(tag => ({
    label: TypeTag[tag],
    setup: [{ offset: 0, value: randomWithTag(tag) }], // random value to move
    targetInstructions: () => [
      new Mov(/*addressing_mode=*/ 0, /*srcOffset=*/ 0, /*dstOffset=*/ 1).as(Opcode.MOV_8, Mov.wireFormat8),
    ],
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
        new Set(/*addressing_mode=*/ 0, /*dstOffset=*/ 0, /*inTag=*/ TypeTag.UINT128, /*value=*/ 4242424242424242n).as(
          Opcode.SET_128,
          Set.wireFormat128,
        ),
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
      targetInstructions: () => [new Jump(/*jumpOffset=*/ 0)],
    },
  ],

  [Opcode.JUMPI_32]: [
    {
      setup: [{ offset: 0, value: new Uint1(0n) }], // Always false
      targetInstructions: () => [new JumpI(/*addressing_mode=*/ 0, /*condOffset=*/ 0, /*loc=*/ 0)],
    },
  ],

  // INTERNALCALL: calls itself infinitely by jumping to its own PC (PC 0, since no setup)
  // Creates infinite recursion until OOG (internal call stack grows forever)
  [Opcode.INTERNALCALL]: [
    {
      setup: [],
      targetInstructions: () => [new InternalCall(/*loc=*/ 0)],
    },
  ],

  // INTERNALRETURN: needs INTERNALCALL to return without error
  // Layout: INTERNALCALL(10) -> JUMP(0) -> INTERNALRETURN
  // INTERNALCALL jumps to INTERNALRETURN, which returns to JUMP, which loops back
  [Opcode.INTERNALRETURN]: [
    {
      setup: [],
      targetInstructions: () => [
        new InternalCall(/*loc=*/ INTERNALCALL_SIZE + JUMP_SIZE), // jump to INTERNALRETURN
        new Jump(/*jumpOffset=*/ 0), // loop back to start
        new InternalReturn(), // return back to jump
      ],
    },
  ],

  // CALL (EXTERNALCALL): calls the current contract address (self) in a loop
  // Contract address is passed via calldata[0] and propagated to nested calls
  [Opcode.CALL]: [EXTERNAL_CALL_CONFIG],
  [Opcode.STATICCALL]: [STATIC_CALL_CONFIG],

  // RETURN: terminates execution, so we need to use the two-contract pattern
  // Outer contract CALLs inner contract in a loop, inner contract does RETURN
  [Opcode.RETURN]: [
    {
      setup: [
        { offset: 0, value: new Uint32(0) }, // returnSize = 0
      ],
      targetInstructions: () => [
        new Return(/*addressing_mode=*/ 0, /*returnSizeOffset=*/ 0, /*returnOffset=*/ 0), // return nothing (size=0)
      ],
      // Use the side-effect-limit pattern (even though it's not a side-effect) as it fits
      // this case (we want to CALL, RETURN, then CALL again back in parent). We omit "cleanup"
      // because we don't need to REVERT as we do for real side-effects.
      limit: 1, // RETURN can only execute once per call
    },
  ],

  // REVERT: terminates execution, so we need to use the two-contract pattern
  // Outer contract CALLs inner contract in a loop, inner contract does REVERT
  [Opcode.REVERT_8]: [
    {
      setup: [
        { offset: 0, value: new Uint32(0) }, // retSize = 0
      ],
      targetInstructions: () => [
        new Revert(/*addressing_mode=*/ 0, /*retSizeOffset=*/ 0, /*returnOffset=*/ 1).as(
          Opcode.REVERT_8,
          Revert.wireFormat8,
        ),
      ],
      limit: 1, // REVERT can only execute once per call
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // ENVIRONMENT
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.GETENVVAR_16]: [
    {
      setup: [],
      targetInstructions: () => [
        new GetEnvVar(/*addressing_mode=*/ 0, /*dstOffset=*/ 0, /*varEnum=*/ 0).as(
          Opcode.GETENVVAR_16,
          GetEnvVar.wireFormat16,
        ),
      ],
    },
  ],

  // CALLDATACOPY has dynamic gas scaling with copySize
  [Opcode.CALLDATACOPY]: [
    {
      label: 'Min copy size',
      // CalldataCopy with copySize=0 is a no-op but still executes the opcode
      setup: [
        { offset: 0, value: new Uint32(0n) }, // copySize = 0 (minimum)
        { offset: 1, value: new Uint32(0n) }, // cdStart = 0
      ],
      targetInstructions: () => [
        new CalldataCopy(/*addressing_mode=*/ 0, /*copySizeOffset=*/ 0, /*cdStartOffset=*/ 1, /*dstOffset=*/ 2),
      ],
    },
    {
      label: 'Large copy size',
      // Large copySize with large dynamic gas - will OOG quickly
      // NOTE: we don't want it so large that it exceeds memory bounds (MAX_MEMORY_SIZE = 2^32)
      // and we really want it small enough that we run at least 1 successful target opcode.
      setup: [
        { offset: 0, value: new Uint32(1000n) }, // copySize = 1000 (large enough to show scaling)
        { offset: 1, value: new Uint32(0n) }, // cdStart = 0
      ],
      targetInstructions: () => [
        new CalldataCopy(/*addressing_mode=*/ 0, /*copySizeOffset=*/ 0, /*cdStartOffset=*/ 1, /*dstOffset=*/ 2),
      ],
    },
    {
      label: 'Near min copy size of 1',
      // Near-min but actually copies data (more meaningful than size=0 no-op)
      setup: [
        { offset: 0, value: new Uint32(1n) }, // copySize = 1
        { offset: 1, value: new Uint32(0n) }, // cdStart = 0
      ],
      targetInstructions: () => [
        new CalldataCopy(/*addressing_mode=*/ 0, /*copySizeOffset=*/ 0, /*cdStartOffset=*/ 1, /*dstOffset=*/ 2),
      ],
    },
  ],

  [Opcode.SUCCESSCOPY]: [
    {
      setup: [],
      targetInstructions: () => [new SuccessCopy(/*addressing_mode=*/ 0, /*dstOffset=*/ 0)],
    },
  ],

  [Opcode.RETURNDATASIZE]: [
    {
      setup: [],
      targetInstructions: () => [new ReturndataSize(/*addressing_mode=*/ 0, /*dstOffset=*/ 0)],
    },
  ],

  // RETURNDATACOPY has dynamic gas scaling with copySize
  [Opcode.RETURNDATACOPY]: [
    {
      label: 'Min copy size',
      setup: [
        { offset: 0, value: new Uint32(0n) }, // copySize = 0 (minimum)
        { offset: 1, value: new Uint32(0n) }, // rdOffset
      ],
      targetInstructions: () => [
        new ReturndataCopy(/*addressing_mode=*/ 0, /*copySizeOffset=*/ 0, /*rdStartOffset=*/ 1, /*dstOffset=*/ 2),
      ],
    },
    {
      label: 'Large copy size',
      // Large copySize to maximize dynamic gas - will OOG quickly
      // NOTE: we don't want it so large that it exceeds memory bounds (MAX_MEMORY_SIZE = 2^32)
      // and we really want it small enough that we run at least 1 successful target opcode.
      setup: [
        { offset: 0, value: new Uint32(1000n) }, // copySize = 1000 (large enough to show scaling)
        { offset: 1, value: new Uint32(0n) }, // rdOffset
      ],
      targetInstructions: () => [
        new ReturndataCopy(/*addressing_mode=*/ 0, /*copySizeOffset=*/ 0, /*rdStartOffset=*/ 1, /*dstOffset=*/ 2),
      ],
    },
    {
      label: 'Near min copy size of 1',
      // Near-min but actually copies data (more meaningful than size=0 no-op)
      setup: [
        { offset: 0, value: new Uint32(1n) }, // copySize = 1
        { offset: 1, value: new Uint32(0n) }, // rdOffset
      ],
      targetInstructions: () => [
        new ReturndataCopy(/*addressing_mode=*/ 0, /*copySizeOffset=*/ 0, /*rdStartOffset=*/ 1, /*dstOffset=*/ 2),
      ],
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // WORLD STATE READS
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.SLOAD]: [
    {
      label: 'Cold read (slot not written)',
      setup: [
        { offset: 0, value: new Field(Fr.random()) }, // random slot
        () => [
          // Get current contract address into offset 1
          new GetEnvVar(/*addressing_mode=*/ 0, /*dstOffset=*/ 1, /*varEnum=*/ 0).as(
            Opcode.GETENVVAR_16,
            GetEnvVar.wireFormat16,
          ),
        ],
      ],
      targetInstructions: () => [
        new SLoad(/*addressing_mode=*/ 0, /*slotOffset=*/ 0, /*contractAddressOffset=*/ 1, /*dstOffset=*/ 2),
      ],
    },
    {
      label: 'Warm read (from tree)',
      // Uses pre-inserted storage from insertWarmTreeEntries() which is called after contract deployment
      setup: [
        { offset: 0, value: new Field(WARM_STORAGE_SLOT) }, // pre-inserted slot
        () => [
          // Get current contract address into offset 1
          new GetEnvVar(/*addressing_mode=*/ 0, /*dstOffset=*/ 1, /*varEnum=*/ 0).as(
            Opcode.GETENVVAR_16,
            GetEnvVar.wireFormat16,
          ),
        ],
      ],
      targetInstructions: () => [
        new SLoad(/*addressing_mode=*/ 0, /*slotOffset=*/ 0, /*contractAddressOffset=*/ 1, /*dstOffset=*/ 2),
      ],
    },
    {
      label: 'Warm read (SSTORE first, unique slot per SLOAD)',
      // Memory layout: slot (incremented), value, constant 1, contract address (from GETENVVAR), revertSize, loaded value
      setup: [
        { offset: 0, value: new Field(Fr.random()) }, // slot (will be incremented)
        { offset: 1, value: new Field(Fr.random()) }, // value to store
        { offset: 2, value: new Field(1n) }, // constant 1 for ADD
        () => [
          // Get current contract address into offset 3
          new GetEnvVar(/*addressing_mode=*/ 0, /*dstOffset=*/ 3, /*varEnum=*/ 0).as(
            Opcode.GETENVVAR_16,
            GetEnvVar.wireFormat16,
          ),
        ],
        { offset: 4, value: new Uint32(0n) }, // revertSize
      ],
      targetInstructions: () => [
        new SStore(/*addressing_mode=*/ 0, /*srcOffset=*/ 1, /*slotOffset=*/ 0),
        new SLoad(/*addressing_mode=*/ 0, /*slotOffset=*/ 0, /*contractAddressOffset=*/ 3, /*dstOffset=*/ 5),
        new Add(/*addressing_mode=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 2, /*dstOffset=*/ 0).as(
          Opcode.ADD_8,
          Add.wireFormat8,
        ), // slot++
      ],
      cleanupInstructions: () => [
        new Revert(/*addressing_mode=*/ 0, /*retSizeOffset=*/ 4, /*returnOffset=*/ 0).as(
          Opcode.REVERT_8,
          Revert.wireFormat8,
        ),
      ],
      limit: MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    },
  ],

  [Opcode.NOTEHASHEXISTS]: [
    {
      label: 'Cold (non-existent)',
      // Note: Can't easily do "write first" version - would need to know the leaf index
      // that EMITNOTEHASH will produce, which depends on tree state
      setup: [
        { offset: 0, value: new Field(Fr.random()) }, // random noteHash
        { offset: 1, value: randomWithTag(TypeTag.UINT64) }, // random leafIndex
      ],
      targetInstructions: () => [
        new NoteHashExists(/*addressing_mode=*/ 0, /*noteHashOffset=*/ 0, /*leafIndexOffset=*/ 1, /*existsOffset=*/ 2),
      ],
    },
    {
      label: 'Warm (exists in tree)',
      // Uses pre-inserted note hash from insertWarmTreeEntries()
      setup: [
        { offset: 0, value: new Field(WARM_NOTE_HASH) }, // pre-inserted noteHash
        { offset: 1, value: new Uint64(WARM_NOTE_HASH_LEAF_INDEX) }, // known leafIndex
      ],
      targetInstructions: () => [
        new NoteHashExists(/*addressing_mode=*/ 0, /*noteHashOffset=*/ 0, /*leafIndexOffset=*/ 1, /*existsOffset=*/ 2),
      ],
    },
  ],

  [Opcode.NULLIFIEREXISTS]: [
    {
      label: 'Non-existent nullifier',
      // NULLIFIEREXISTS now takes a siloed nullifier directly (no address parameter)
      setup: [
        { offset: 0, value: new Field(Fr.random()) }, // random siloed nullifier (won't exist)
      ],
      targetInstructions: () => [
        new NullifierExists(/*addressing_mode=*/ 0, /*siloedNullifierOffset=*/ 0, /*existsOffset=*/ 1),
      ],
    },
    {
      label: 'Existing nullifier (warm - from tree)',
      // Uses pre-inserted siloed nullifier from insertWarmTreeEntries()
      // NULLIFIEREXISTS now takes a siloed nullifier directly
      setup: [
        { offset: 0, value: new Field(WARM_SILOED_NULLIFIER) }, // pre-inserted siloed nullifier
      ],
      targetInstructions: () => [
        new NullifierExists(/*addressing_mode=*/ 0, /*siloedNullifierOffset=*/ 0, /*existsOffset=*/ 1),
      ],
    },
  ],

  [Opcode.L1TOL2MSGEXISTS]: [
    {
      label: 'Cold (non-existent)',
      setup: [
        { offset: 0, value: new Field(Fr.random()) }, // random msgHash
        { offset: 1, value: randomWithTag(TypeTag.UINT64) }, // random msgLeafIndex
      ],
      targetInstructions: () => [
        new L1ToL2MessageExists(
          /*addressing_mode=*/ 0,
          /*msgHashOffset=*/ 0,
          /*msgLeafIndexOffset=*/ 1,
          /*existsOffset=*/ 2,
        ),
      ],
    },
    {
      label: 'Warm (exists in tree)',
      // Uses pre-inserted L1 to L2 message from insertWarmTreeEntries()
      setup: [
        { offset: 0, value: new Field(WARM_L1_TO_L2_MSG) }, // pre-inserted msgHash
        { offset: 1, value: new Uint64(WARM_L1_TO_L2_MSG_LEAF_INDEX) }, // known msgLeafIndex
      ],
      targetInstructions: () => [
        new L1ToL2MessageExists(
          /*addressing_mode=*/ 0,
          /*msgHashOffset=*/ 0,
          /*msgLeafIndexOffset=*/ 1,
          /*existsOffset=*/ 2,
        ),
      ],
    },
  ],

  [Opcode.GETCONTRACTINSTANCE]: [
    {
      // Use GETENVVAR to get current contract address (varEnum 0 = ADDRESS)
      // This ensures we're querying a valid deployed contract
      setup: [
        () => [
          new GetEnvVar(/*addressing_mode=*/ 0, /*dstOffset=*/ 0, /*varEnum=*/ 0).as(
            Opcode.GETENVVAR_16,
            GetEnvVar.wireFormat16,
          ),
        ],
      ],
      // memberEnum 0 = DEPLOYER
      targetInstructions: () => [
        new GetContractInstance(/*addressing_mode=*/ 0, /*addressOffset=*/ 0, /*dstOffset=*/ 1, /*memberEnum=*/ 0),
      ],
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // SIDE-EFFECT LIMITED (have per-TX limit, use nested call pattern)
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.EMITNOTEHASH]: [
    {
      setup: [
        { offset: 0, value: new Field(Fr.random()) }, // random noteHash
        { offset: 1, value: new Uint32(0n) }, // revertSize
      ],
      targetInstructions: () => [new EmitNoteHash(/*addressing_mode=*/ 0, /*noteHashOffset=*/ 0)],
      cleanupInstructions: () => [
        new Revert(/*addressing_mode=*/ 0, /*retSizeOffset=*/ 1, /*returnOffset=*/ 0).as(
          Opcode.REVERT_8,
          Revert.wireFormat8,
        ),
      ], // revert with empty
      limit: MAX_NOTE_HASHES_PER_TX,
    },
  ],

  [Opcode.EMITNULLIFIER]: [
    {
      // Nullifiers must be unique - increment value after each emit
      // Memory layout: offset 0 = nullifier value, offset 1 = constant 1 for incrementing
      setup: [
        { offset: 0, value: new Field(Fr.random()) }, // random nullifier (will be incremented)
        { offset: 1, value: new Field(1n) }, // constant 1 for ADD
        { offset: 2, value: new Uint32(0n) }, // revertSize
      ],
      targetInstructions: () => [
        new EmitNullifier(/*addressing_mode=*/ 0, /*nullifierOffset=*/ 0),
        new Add(/*addressing_mode=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 0).as(
          Opcode.ADD_8,
          Add.wireFormat8,
        ), // nullifier++
      ],
      cleanupInstructions: () => [
        new Revert(/*addressing_mode=*/ 0, /*retSizeOffset=*/ 2, /*returnOffset=*/ 0).as(
          Opcode.REVERT_8,
          Revert.wireFormat8,
        ),
      ], // revert with empty
      limit: MAX_NULLIFIERS_PER_TX - 1, // minus 1 because a TX will always have 1 "TX nullifier" from private
    },
  ],

  [Opcode.SENDL2TOL1MSG]: [
    {
      setup: [
        { offset: 0, value: new Field(Fr.random()) }, // random recipient
        { offset: 1, value: new Field(Fr.random()) }, // random content
        { offset: 2, value: new Uint32(0n) }, // revertSize
      ],
      targetInstructions: () => [
        new SendL2ToL1Message(/*addressing_mode=*/ 0, /*recipientOffset=*/ 0, /*contentOffset=*/ 1),
      ],
      cleanupInstructions: () => [
        new Revert(/*addressing_mode=*/ 0, /*retSizeOffset=*/ 2, /*returnOffset=*/ 0).as(
          Opcode.REVERT_8,
          Revert.wireFormat8,
        ),
      ], // revert with empty
      limit: MAX_L2_TO_L1_MSGS_PER_TX,
    },
  ],

  // SSTORE has two modes:
  // 1. Same slot: Writing to the same slot repeatedly has no per-TX limit - it just overwrites.
  // 2. Unique slots: Writing to unique slots is limited by MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX.
  [Opcode.SSTORE]: [
    {
      label: 'Same slot (no limit)',
      setup: [
        { offset: 0, value: new Field(Fr.random()) }, // random value
        { offset: 1, value: new Field(Fr.random()) }, // random slot (same slot each iteration)
        { offset: 2, value: new Uint32(0n) }, // revertSize
      ],
      targetInstructions: () => [new SStore(/*addressing_mode=*/ 0, /*srcOffset=*/ 0, /*slotOffset=*/ 1)],
      cleanupInstructions: () => [
        new Revert(/*addressing_mode=*/ 0, /*retSizeOffset=*/ 2, /*returnOffset=*/ 0).as(
          Opcode.REVERT_8,
          Revert.wireFormat8,
        ),
      ], // revert with empty
    },
    {
      label: 'Unique slots (side-effect limited)',
      setup: [
        { offset: 0, value: new Field(Fr.random()) }, // random value (constant)
        { offset: 1, value: new Field(Fr.random()) }, // random slot (will be incremented)
        { offset: 2, value: new Field(1n) }, // constant 1 for ADD
        { offset: 3, value: new Uint32(0n) }, // revertSize
      ],
      targetInstructions: () => [
        new SStore(/*addressing_mode=*/ 0, /*srcOffset=*/ 0, /*slotOffset=*/ 1),
        new Add(/*addressing_mode=*/ 0, /*aOffset=*/ 1, /*bOffset=*/ 2, /*dstOffset=*/ 1).as(
          Opcode.ADD_8,
          Add.wireFormat8,
        ), // slot++
      ],
      cleanupInstructions: () => [
        new Revert(/*addressing_mode=*/ 0, /*retSizeOffset=*/ 3, /*returnOffset=*/ 0).as(
          Opcode.REVERT_8,
          Revert.wireFormat8,
        ),
      ], // revert with empty
      limit: MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    },
  ],

  // EMITPUBLICLOG - two configs: minimal (many small logs) and max-size (one large log)
  [Opcode.EMITPUBLICLOG]: [
    {
      label: 'Many empty logs, revert, repeat',
      setup: [
        { offset: 0, value: new Uint32(0n) }, // logSize = 0 fields (minimal)
        { offset: 1, value: new Uint32(0n) }, // revertSize
      ],
      targetInstructions: () => [new EmitPublicLog(/*addressing_mode=*/ 0, /*logSizeOffset=*/ 0, /*logOffset=*/ 1)], // logOffset doesn't matter when size is 0
      cleanupInstructions: () => [
        new Revert(/*addressing_mode=*/ 0, /*retSizeOffset=*/ 1, /*returnOffset=*/ 0).as(
          Opcode.REVERT_8,
          Revert.wireFormat8,
        ),
      ], // revert with empty
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
      targetInstructions: () => [new EmitPublicLog(/*addressing_mode=*/ 0, /*logSizeOffset=*/ 0, /*logOffset=*/ 2)], // uses logOffset 2 (uninitialized Field(0))
      cleanupInstructions: () => [
        new Revert(/*addressing_mode=*/ 0, /*retSizeOffset=*/ 1, /*returnOffset=*/ 0).as(
          Opcode.REVERT_8,
          Revert.wireFormat8,
        ),
      ], // revert with empty
      limit: 1, // Only 1 max-size log fits
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // GADGETS - Random inputs (seeded via SEED env var)
  // ═══════════════════════════════════════════════════════════════════════════
  [Opcode.POSEIDON2]: [
    {
      // Poseidon2 takes 4 field elements as input
      setup: Array.from({ length: 4 }, (_, i) => ({
        offset: i,
        value: new Field(Fr.random()), // random field element
      })),
      // Poseidon hash data at M[0..3], write result to M[0:3] (reuse results as next inputs)
      targetInstructions: () => [
        new Poseidon2(/*addressing_mode=*/ 0, /*inputStateOffset=*/ 0, /*outputStateOffset=*/ 0),
      ],
    },
  ],

  [Opcode.SHA256COMPRESSION]: [
    {
      setup: [
        // State: 8 x UINT32 at offsets 0-7 (random initial state)
        ...Array.from({ length: 8 }, (_, i) => ({
          offset: i,
          value: randomWithTag(TypeTag.UINT32),
        })),
        // Inputs: 16 x UINT32 at offsets 8-23 (random message block)
        ...Array.from({ length: 16 }, (_, i) => ({
          offset: 8 + i,
          value: randomWithTag(TypeTag.UINT32),
        })),
      ],
      targetInstructions: () => [
        new Sha256Compression(/*addressing_mode=*/ 0, /*outputOffset=*/ 0, /*stateOffset=*/ 0, /*inputsOffset=*/ 8),
      ],
    },
  ],

  [Opcode.KECCAKF1600]: [
    {
      // Keccak state: 25 x UINT64 (5x5 lane array) with random values
      setup: Array.from({ length: 25 }, (_, i) => ({
        offset: i,
        value: randomWithTag(TypeTag.UINT64),
      })),
      targetInstructions: () => [new KeccakF1600(/*addressing_mode=*/ 0, /*dstOffset=*/ 0, /*inputOffset=*/ 0)],
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
      targetInstructions: () => [
        new EcAdd(
          /*addressing_mode=*/ 0,
          /*p1XOffset=*/ 0,
          /*p1YOffset=*/ 1,
          /*p1IsInfiniteOffset=*/ 2,
          /*p2XOffset=*/ 3,
          /*p2YOffset=*/ 4,
          /*p2IsInfiniteOffset=*/ 5,
          /*dstOffset=*/ 0,
        ),
      ],
    },
  ],

  // TORADIXBE has dynamic gas scaling with numLimbs
  [Opcode.TORADIXBE]: [
    {
      label: 'Min limbs',
      setup: [
        { offset: 0, value: new Field(1n) }, // small value that fits in 1 limb (can't randomize - would truncate)
        { offset: 1, value: new Uint32(2n) }, // radix = 2 (binary)
        { offset: 2, value: new Uint32(1n) }, // numLimbs = 1 (minimum)
        { offset: 3, value: new Uint1(0n) }, // outputBits = false
      ],
      targetInstructions: () => [
        new ToRadixBE(
          /*addressing_mode=*/ 0,
          /*srcOffset=*/ 0,
          /*radixOffset=*/ 1,
          /*numLimbsOffset=*/ 2,
          /*outputBitsOffset=*/ 3,
          /*dstOffset=*/ 4,
        ),
      ],
    },
    {
      label: 'Max limbs',
      setup: [
        { offset: 0, value: new Field(Fr.random()) }, // random field value (fits in 256 bits)
        { offset: 1, value: new Uint32(2n) }, // radix = 2 (binary)
        { offset: 2, value: new Uint32(256n) }, // numLimbs = 256 (max bits in field)
        { offset: 3, value: new Uint1(0n) }, // outputBits = false
      ],
      targetInstructions: () => [
        new ToRadixBE(
          /*addressing_mode=*/ 0,
          /*srcOffset=*/ 0,
          /*radixOffset=*/ 1,
          /*numLimbsOffset=*/ 2,
          /*outputBitsOffset=*/ 3,
          /*dstOffset=*/ 4,
        ),
      ],
    },
    {
      label: 'Radix 3 (slow divmod path)',
      // Radix 3 bypasses the fast path for power-of-2 radixes (4, 8, 16, 32, 64, 128, 256)
      // and uses the slow divmod implementation instead
      setup: [
        { offset: 0, value: new Field(Fr.random()) }, // random field value
        { offset: 1, value: new Uint32(3n) }, // radix = 3 (non-power-of-2)
        { offset: 2, value: new Uint32(161n) }, // numLimbs = 161 (ceil(256 / log2(3)) ≈ 161 limbs to represent 256 bits)
        { offset: 3, value: new Uint1(0n) }, // outputBits = false
      ],
      targetInstructions: () => [
        new ToRadixBE(
          /*addressing_mode=*/ 0,
          /*srcOffset=*/ 0,
          /*radixOffset=*/ 1,
          /*numLimbsOffset=*/ 2,
          /*outputBitsOffset=*/ 3,
          /*dstOffset=*/ 4,
        ),
      ],
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // MISC
  // ═══════════════════════════════════════════════════════════════════════════
  // DEBUGLOG only has base gas (no dynamic gas scaling) - memory reads only happen
  // when collectDebugLogs config is enabled
  [Opcode.DEBUGLOG]: [
    {
      setup: [
        { offset: 0, value: new Field(0n) }, // level (0 = trace)
        { offset: 1, value: new Field(0n) }, // message
        { offset: 2, value: new Field(0n) }, // fields
        { offset: 3, value: new Uint32(0n) }, // fieldsSize = 0
      ],
      // messageSize = 0
      targetInstructions: () => [
        new DebugLog(
          /*addressing_mode=*/ 0,
          /*levelOffset=*/ 0,
          /*messageOffset=*/ 1,
          /*fieldsOffset=*/ 2,
          /*fieldsSizeOffset=*/ 3,
          /*messageSize=*/ 0,
        ),
      ],
    },
    // No real reason to test this by default since debug logs only meaningfully do scaling work
    // when collectDebugLogs is enabled.
    // {
    //   label: 'Max sizes',
    //   setup: [
    //     { offset: 0, value: new Field(0n) }, // level (0 = trace)
    //     { offset: 1, value: new Field(0n) }, // message start
    //     { offset: 2, value: new Field(0n) }, // fields start
    //     { offset: 3, value: new Uint32(1000n) }, // fieldsSize = 1000 (large enough to show scaling)
    //   ],
    //   // messageSize = 1000 (large enough to show scaling)
    //   targetInstructions: () => [
    //     new DebugLog(
    //       /*addressing_mode=*/ 0,
    //       /*levelOffset=*/ 0,
    //       /*messageOffset=*/ 1,
    //       /*fieldsOffset=*/ 2,
    //       /*fieldsSizeOffset=*/ 3,
    //       /*messageSize=*/ 1000,
    //     ),
    //   ],
    // },
  ],
};

/**
 * Get all spam test cases grouped by opcode.
 * This is the main entry point for tests - it handles all the complexity of
 * type variants, multiple configs, etc.
 *
 * Returns hierarchical structure for nested describe blocks in tests.
 *
 * @param maxConfigsPerOpcode - Maximum number of configs to include per opcode.
 *                              Defaults to Infinity (no limit). Useful for quick
 *                              smoke tests where testing all type variants is too slow,
 *                              or for proving tests that are inherently slower.
 */
export function getSpamConfigsPerOpcode(maxConfigsPerOpcode: number = Infinity): SpamConfigsForOpcode[] {
  const groups: SpamConfigsForOpcode[] = [];

  for (const [opcodeKey, configs] of Object.entries(SPAM_CONFIGS)) {
    const opcode = Opcode[Number(opcodeKey) as Opcode];
    if (!configs) {
      throw new Error(`Opcode ${opcode} listed in spam configs, but empty`);
    }

    // Apply the limit to the number of configs per opcode
    const limitedConfigs = configs.slice(0, maxConfigsPerOpcode);

    const cases: SpamConfig[] = limitedConfigs.map(config => ({
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

  // 2. Infinite loop - maximize calls to target until out-of-gas
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

async function testStandardOpcodeSpam(
  tester: PublicTxSimulationTester,
  config: SpamConfig,
  expectToBeTrue: (x: boolean) => void,
): Promise<PublicTxResult> {
  const bytecode = createOpcodeSpamBytecode(config);
  const contract = await deployCustomBytecode(bytecode, tester, config.label);

  await insertWarmTreeEntries(tester.merkleTrees, contract.address);

  // Should we pass the contract address as calldata?
  const calldata = config.addressAsCalldata ? [contract.address.toField()] : [];
  const result = await executeCustomBytecode(contract, tester, config.label, calldata);

  // should have halted with out of gas
  expectToBeTrue(!result.revertCode.isOK());
  const revertReason = result.findRevertReason()?.message.toLowerCase();
  const allowedReasons = ['out of gas', 'not enough l2gas'];
  // expect the reason to match ONE of the allowed reasons
  expectToBeTrue(allowedReasons.some(allowedReason => revertReason?.includes(allowedReason)));
  return result;
}

async function testSideEffectOpcodeSpam(
  tester: PublicTxSimulationTester,
  config: SpamConfig,
  expectToBeTrue: (x: boolean) => void,
): Promise<PublicTxResult> {
  // Inner contract will spam the side-effect limited opcode up to its limit, then REVERT
  const innerBytecode = createSideEffectSpamBytecode(config);
  // Outer contract will CALL to inner contract in a loop
  const outerBytecode = createOpcodeSpamBytecode(EXTERNAL_CALL_CONFIG);
  const innerContract = await deployCustomBytecode(innerBytecode, tester, `${config.label}_Inner`);
  const outerContract = await deployCustomBytecode(outerBytecode, tester, `${config.label}_Outer`);
  // Outer contract reads calldata[0] as inner contract address to CALL to
  const result = await executeCustomBytecode(outerContract, tester, config.label, [innerContract.address.toField()]);

  // should have halted with out of gas or explicit REVERT (assertion failed)
  expectToBeTrue(!result.revertCode.isOK());
  const revertReason = result.findRevertReason()?.message.toLowerCase();
  const allowedReasons = ['assertion failed', 'out of gas', 'not enough l2gas'];
  // expect the reason to match ONE of the allowed reasons
  expectToBeTrue(allowedReasons.some(allowedReason => revertReason?.includes(allowedReason)));

  // Top-level should _always_ run out of gas for these tests
  // Check top-level halting message
  // WARNING: only the C++ simulator (or TsVsCpp) will have haltingMessage
  const allowedOuterReasons = ['out of gas', 'not enough l2gas'];
  if (result.callStackMetadata && result.callStackMetadata.length > 0) {
    const outerCallMetadata = result.callStackMetadata[0] as CallStackMetadata;
    const outerReason = outerCallMetadata.haltingMessage?.toLowerCase();
    // expect the reason to match ONE of the allowed reasons
    expectToBeTrue(allowedOuterReasons.some(allowedReason => outerReason?.includes(allowedReason)));
  }

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
