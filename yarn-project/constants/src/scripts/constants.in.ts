import * as fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const NOIR_CONSTANTS_FILE = '../../../../noir-projects/noir-protocol-circuits/crates/types/src/constants.nr';
const TS_CONSTANTS_FILE = '../constants.gen.ts';
const CPP_AZTEC_CONSTANTS_FILE = '../../../../barretenberg/cpp/src/barretenberg/aztec/aztec_constants.hpp';
const PIL_AZTEC_CONSTANTS_FILE = '../../../../barretenberg/cpp/pil/vm2/constants_gen.pil';
const SOLIDITY_CONSTANTS_FILE = '../../../../l1-contracts/src/core/libraries/ConstantsGen.sol';

// Additional Noir source files (outside constants.nr) to extract specific constants from, keyed by
// file path (relative to this script) and the exact constant names to pull from each. Used for
// constants that are defined alongside circuit code rather than in constants.nr, so they can be
// exported to the generated TS constants without duplicating their definition. The referenced
// constants may depend on constants.nr values, which are in scope because they are evaluated after
// the main file's constants.
const ADDITIONAL_NOIR_CONSTANT_FILES: { file: string; constants: string[] }[] = [
  {
    file: '../../../../noir-projects/noir-protocol-circuits/crates/types/src/blob_data/tx_blob_data.nr',
    constants: ['MAX_TX_BLOB_DATA_SIZE_IN_FIELDS'],
  },
];

// Whitelist of constants that will be copied to aztec_constants.hpp.
// We don't copy everything as just a handful are needed, and updating them breaks the cache and triggers expensive bb builds.
const CPP_CONSTANTS = [
  'MAX_ETH_ADDRESS_BIT_SIZE',
  'MAX_ETH_ADDRESS_VALUE',
  'GENESIS_BLOCK_HEADER_HASH',
  'GENESIS_ARCHIVE_ROOT',
  'MEM_TAG_U1',
  'MEM_TAG_U8',
  'MEM_TAG_U16',
  'MEM_TAG_U32',
  'MEM_TAG_U64',
  'MEM_TAG_U128',
  'MEM_TAG_FF',
  'MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS',
  'CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS',
  'CONTRACT_CLASS_REGISTRY_CONTRACT_ADDRESS',
  'FEE_JUICE_ADDRESS',
  'TX_DA_GAS_OVERHEAD',
  'FEE_JUICE_BALANCES_SLOT',
  'UPDATED_CLASS_IDS_SLOT',
  'UPDATES_DELAYED_PUBLIC_MUTABLE_VALUES_LEN',
  'PUBLIC_DATA_TREE_HEIGHT',
  'NULLIFIER_TREE_HEIGHT',
  'NULLIFIER_SUBTREE_HEIGHT',
  'NOTE_HASH_TREE_HEIGHT',
  'L1_TO_L2_MSG_TREE_HEIGHT',
  'ARCHIVE_HEIGHT',
  'TIMESTAMP_OF_CHANGE_BIT_SIZE',
  'UPDATES_DELAYED_PUBLIC_MUTABLE_METADATA_BIT_SIZE',
  'MAX_ENQUEUED_CALLS_PER_TX',
  'MAX_NOTE_HASHES_PER_TX',
  'MAX_NULLIFIERS_PER_TX',
  'MAX_L2_TO_L1_MSGS_PER_TX',
  'MAX_PROCESSABLE_L2_GAS',
  'MAX_PUBLIC_LOGS_PER_TX',
  'MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX',
  'MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS',
  'MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX',
  'MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX',
  'AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_ROW_IDX',
  'AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_CHAIN_ID_ROW_IDX',
  'AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_VERSION_ROW_IDX',
  'AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_BLOCK_NUMBER_ROW_IDX',
  'AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_SLOT_NUMBER_ROW_IDX',
  'AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_TIMESTAMP_ROW_IDX',
  'AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_COINBASE_ROW_IDX',
  'AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_FEE_RECIPIENT_ROW_IDX',
  'AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PROTOCOL_CONTRACTS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX',
  'AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX',
  'AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX',
  'AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX',
  'AVM_PUBLIC_INPUTS_START_GAS_USED_ROW_IDX',
  'AVM_PUBLIC_INPUTS_GAS_SETTINGS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_FEE_PAYER_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PUBLIC_SETUP_CALL_REQUESTS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PUBLIC_APP_LOGIC_CALL_REQUESTS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PUBLIC_TEARDOWN_CALL_REQUEST_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX',
  'AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX',
  'AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX',
  'AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX',
  'AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX',
  'AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX',
  'AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_PUBLIC_LOGS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_PUBLIC_DATA_WRITES_ROW_IDX',
  'AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ROW_IDX',
  'AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX',
  'AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_LOGS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_DATA_WRITES_ROW_IDX',
  'AVM_PUBLIC_INPUTS_TRANSACTION_FEE_ROW_IDX',
  'AVM_PUBLIC_INPUTS_REVERTED_ROW_IDX',
  'AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH',
  'AVM_NUM_PUBLIC_INPUT_COLUMNS',
  'AVM_PUBLIC_INPUTS_COLUMN_0_LENGTH',
  'AVM_PUBLIC_INPUTS_COLUMN_1_LENGTH',
  'AVM_PUBLIC_INPUTS_COLUMN_2_LENGTH',
  'AVM_PUBLIC_INPUTS_COLUMN_3_LENGTH',
  'AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH',
  'AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_HEIGHT',
  'AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_INITIAL_ROOT',
  'AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_INITIAL_SIZE',
  'NOTE_HASH_TREE_LEAF_COUNT',
  'L1_TO_L2_MSG_TREE_LEAF_COUNT',
  'FLAT_PUBLIC_LOGS_HEADER_LENGTH',
  'FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH',
  'PUBLIC_LOGS_LENGTH',
  'PUBLIC_LOG_HEADER_LENGTH',
  'PUBLIC_TX_L2_GAS_OVERHEAD',
  'MAX_PROTOCOL_CONTRACTS',
  'DEFAULT_MAX_DEBUG_LOG_MEMORY_READS',
];

const CPP_GENERATORS: string[] = [
  'BLOCK_HEADER_HASH',
  'SALTED_INITIALIZATION_HASH',
  'PARTIAL_ADDRESS',
  'CONTRACT_ADDRESS_V2',
  'CONTRACT_CLASS_ID',
  'PUBLIC_KEYS_HASH',
  'SINGLE_PUBLIC_KEY_HASH',
  'NOTE_HASH_NONCE',
  'UNIQUE_NOTE_HASH',
  'SILOED_NOTE_HASH',
  'SILOED_NULLIFIER',
  'PUBLIC_LEAF_SLOT',
  'PUBLIC_STORAGE_MAP_SLOT',
  'PUBLIC_CALLDATA',
  'PUBLIC_BYTECODE',
  'MERKLE_HASH',
  'NULLIFIER_MERKLE',
  'PUBLIC_DATA_MERKLE',
  'WRITTEN_SLOTS_MERKLE',
  'RETRIEVED_BYTECODES_MERKLE',
];

const PIL_CONSTANTS = [
  'MAX_ETH_ADDRESS_VALUE',
  'MEM_TAG_U1',
  'MEM_TAG_U8',
  'MEM_TAG_U16',
  'MEM_TAG_U32',
  'MEM_TAG_U64',
  'MEM_TAG_U128',
  'MEM_TAG_FF',
  'AVM_BITWISE_AND_OP_ID',
  'AVM_BITWISE_OR_OP_ID',
  'AVM_BITWISE_XOR_OP_ID',
  'AVM_KECCAKF1600_NUM_ROUNDS',
  'AVM_KECCAKF1600_STATE_SIZE',
  'AVM_TX_PHASE_VALUE_START',
  'AVM_TX_PHASE_VALUE_SETUP',
  'AVM_TX_PHASE_VALUE_LAST',
  'AVM_HIGHEST_MEM_ADDRESS',
  'AVM_MEMORY_NUM_BITS',
  'AVM_MEMORY_SIZE',
  'MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS',
  'MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX',
  'MAX_NOTE_HASHES_PER_TX',
  'GRUMPKIN_ONE_X',
  'GRUMPKIN_ONE_Y',
  'AVM_PC_SIZE_IN_BITS',
  'PUBLIC_DATA_TREE_HEIGHT',
  'NULLIFIER_TREE_HEIGHT',
  'NOTE_HASH_TREE_HEIGHT',
  'L1_TO_L2_MSG_TREE_HEIGHT',
  'UPDATED_CLASS_IDS_SLOT',
  'UPDATES_DELAYED_PUBLIC_MUTABLE_VALUES_LEN',
  'CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS',
  'CONTRACT_CLASS_REGISTRY_CONTRACT_ADDRESS',
  'FEE_JUICE_ADDRESS',
  'FEE_JUICE_BALANCES_SLOT',
  'TIMESTAMP_OF_CHANGE_BIT_SIZE',
  'UPDATES_DELAYED_PUBLIC_MUTABLE_METADATA_BIT_SIZE',
  'UPDATES_SHARED_MUTABLE_METADATA_BIT_SIZE',
  'MAX_ENQUEUED_CALLS_PER_TX',
  'MAX_NOTE_HASHES_PER_TX',
  'MAX_NULLIFIERS_PER_TX',
  'MAX_L2_TO_L1_MSGS_PER_TX',
  'MAX_PUBLIC_LOGS_PER_TX',
  'MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS',
  'MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX',
  'MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX',
  'AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_ROW_IDX',
  'AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_CHAIN_ID_ROW_IDX',
  'AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_VERSION_ROW_IDX',
  'AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_BLOCK_NUMBER_ROW_IDX',
  'AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_SLOT_NUMBER_ROW_IDX',
  'AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_TIMESTAMP_ROW_IDX',
  'AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_COINBASE_ROW_IDX',
  'AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_FEE_RECIPIENT_ROW_IDX',
  'AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PROTOCOL_CONTRACTS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX',
  'AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX',
  'AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX',
  'AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX',
  'AVM_PUBLIC_INPUTS_START_GAS_USED_ROW_IDX',
  'AVM_PUBLIC_INPUTS_GAS_SETTINGS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_GAS_SETTINGS_GAS_LIMITS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_GAS_SETTINGS_TEARDOWN_GAS_LIMITS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_FEE_PAYER_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PUBLIC_SETUP_CALL_REQUESTS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PUBLIC_APP_LOGIC_CALL_REQUESTS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PUBLIC_TEARDOWN_CALL_REQUEST_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX',
  'AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX',
  'AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX',
  'AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX',
  'AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX',
  'AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX',
  'AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_PUBLIC_LOGS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_PUBLIC_DATA_WRITES_ROW_IDX',
  'AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ROW_IDX',
  'AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX',
  'AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_LOGS_ROW_IDX',
  'AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_DATA_WRITES_ROW_IDX',
  'AVM_PUBLIC_INPUTS_TRANSACTION_FEE_ROW_IDX',
  'AVM_PUBLIC_INPUTS_REVERTED_ROW_IDX',
  'AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH',
  'AVM_NUM_PUBLIC_INPUT_COLUMNS',
  'AVM_SUBTRACE_ID_EXECUTION',
  'AVM_SUBTRACE_ID_ALU',
  'AVM_SUBTRACE_ID_CAST',
  'AVM_SUBTRACE_ID_SET',
  'AVM_SUBTRACE_ID_BITWISE',
  'AVM_SUBTRACE_ID_POSEIDON2_PERM',
  'AVM_SUBTRACE_ID_TO_RADIX',
  'AVM_SUBTRACE_ID_ECC',
  'AVM_SUBTRACE_ID_KECCAKF1600',
  'AVM_SUBTRACE_ID_CALLDATA_COPY',
  'AVM_SUBTRACE_ID_SHA256_COMPRESSION',
  'AVM_SUBTRACE_ID_RETURNDATA_COPY',
  'AVM_DYN_GAS_ID_CALLDATACOPY',
  'AVM_DYN_GAS_ID_RETURNDATACOPY',
  'AVM_DYN_GAS_ID_TORADIX',
  'AVM_DYN_GAS_ID_BITWISE',
  'AVM_DYN_GAS_ID_EMITPUBLICLOG',
  'AVM_DYN_GAS_ID_SSTORE',
  'AVM_SUBTRACE_ID_GETCONTRACTINSTANCE',
  'AVM_SUBTRACE_ID_EMITPUBLICLOG',
  'AVM_EXEC_OP_ID_GETENVVAR',
  'AVM_EXEC_OP_ID_MOV',
  'AVM_EXEC_OP_ID_JUMP',
  'AVM_EXEC_OP_ID_JUMPI',
  'AVM_EXEC_OP_ID_CALL',
  'AVM_EXEC_OP_ID_STATICCALL',
  'AVM_EXEC_OP_ID_INTERNALCALL',
  'AVM_EXEC_OP_ID_INTERNALRETURN',
  'AVM_EXEC_OP_ID_RETURN',
  'AVM_EXEC_OP_ID_REVERT',
  'AVM_EXEC_OP_ID_SUCCESSCOPY',
  'AVM_EXEC_OP_ID_ALU_ADD',
  'AVM_EXEC_OP_ID_ALU_SUB',
  'AVM_EXEC_OP_ID_ALU_MUL',
  'AVM_EXEC_OP_ID_ALU_DIV',
  'AVM_EXEC_OP_ID_ALU_FDIV',
  'AVM_EXEC_OP_ID_ALU_EQ',
  'AVM_EXEC_OP_ID_ALU_LT',
  'AVM_EXEC_OP_ID_ALU_LTE',
  'AVM_EXEC_OP_ID_ALU_NOT',
  'AVM_EXEC_OP_ID_ALU_SHL',
  'AVM_EXEC_OP_ID_ALU_SHR',
  'AVM_EXEC_OP_ID_ALU_TRUNCATE',
  'AVM_EXEC_OP_ID_RETURNDATASIZE',
  'AVM_EXEC_OP_ID_DEBUGLOG',
  'AVM_EXEC_OP_ID_SLOAD',
  'AVM_EXEC_OP_ID_SSTORE',
  'AVM_EXEC_OP_ID_NOTEHASH_EXISTS',
  'AVM_EXEC_OP_ID_EMIT_NOTEHASH',
  'AVM_EXEC_OP_ID_L1_TO_L2_MESSAGE_EXISTS',
  'AVM_EXEC_OP_ID_NULLIFIER_EXISTS',
  'AVM_EXEC_OP_ID_EMIT_NULLIFIER',
  'AVM_EXEC_OP_ID_SENDL2TOL1MSG',
  'AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_HEIGHT',
  'AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_INITIAL_ROOT',
  'AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_INITIAL_SIZE',
  'AVM_RETRIEVED_BYTECODES_TREE_HEIGHT',
  'AVM_RETRIEVED_BYTECODES_TREE_INITIAL_ROOT',
  'AVM_RETRIEVED_BYTECODES_TREE_INITIAL_SIZE',
  'NOTE_HASH_TREE_LEAF_COUNT',
  'L1_TO_L2_MSG_TREE_LEAF_COUNT',
  'FLAT_PUBLIC_LOGS_HEADER_LENGTH',
  'FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH',
  'PUBLIC_LOGS_LENGTH',
  'PUBLIC_LOG_HEADER_LENGTH',
  'MAX_PROTOCOL_CONTRACTS',
];

const PIL_GENERATORS: string[] = [
  'SALTED_INITIALIZATION_HASH',
  'PARTIAL_ADDRESS',
  'CONTRACT_ADDRESS_V2',
  'CONTRACT_CLASS_ID',
  'PUBLIC_KEYS_HASH',
  'SINGLE_PUBLIC_KEY_HASH',
  'NOTE_HASH_NONCE',
  'UNIQUE_NOTE_HASH',
  'SILOED_NOTE_HASH',
  'SILOED_NULLIFIER',
  'PUBLIC_LEAF_SLOT',
  'PUBLIC_STORAGE_MAP_SLOT',
  'PUBLIC_CALLDATA',
  'PUBLIC_BYTECODE',
  'MERKLE_HASH',
  'NULLIFIER_MERKLE',
  'PUBLIC_DATA_MERKLE',
  'WRITTEN_SLOTS_MERKLE',
  'RETRIEVED_BYTECODES_MERKLE',
];

const SOLIDITY_CONSTANTS = [
  'MAX_FIELD_VALUE',
  'MAX_L2_TO_L1_MSGS_PER_TX',
  'EMPTY_EPOCH_OUT_HASH',
  'L1_TO_L2_MSG_SUBTREE_HEIGHT',
  'NUM_MSGS_PER_BASE_PARITY',
  'NUM_BASE_PARITY_PER_ROOT_PARITY',
  'BLS12_POINT_COMPRESSED_BYTES',
  'ROOT_ROLLUP_PUBLIC_INPUTS_LENGTH',
  'INITIAL_CHECKPOINT_NUMBER',
  'GENESIS_ARCHIVE_ROOT',
  'FEE_JUICE_ADDRESS',
  'MAX_CHECKPOINTS_PER_EPOCH',
];

/**
 * Parsed content.
 */
interface ParsedContent {
  /**
   * Constants of the form "CONSTANT_NAME: number_as_string".
   */
  constants: { [key: string]: string };
  /**
   * DomainSeparatorEnum.
   */
  domainSeparatorEnum: { [key: string]: number };
}

/**
 * Raw expressions parsed from a Noir file, prior to evaluation. Keeping expressions unevaluated lets
 * us merge constants from multiple files and resolve cross-file references in a single evaluation pass.
 */
interface ParsedExpressions {
  /**
   * Ordered list of "CONSTANT_NAME: expression" pairs.
   */
  constantsExpressions: [string, string][];
  /**
   * DomainSeparatorEnum.
   */
  domainSeparatorEnum: { [key: string]: number };
}

/**
 * Processes a collection of constants and generates code to export them as TypeScript constants.
 *
 * @param constants - An object containing key-value pairs representing constants.
 * @returns A string containing code that exports the constants as TypeScript constants.
 */
function processConstantsTS(constants: { [key: string]: string }): string {
  const code: string[] = [];
  Object.entries(constants).forEach(([key, value]) => {
    code.push(`export const ${key} = ${+value > Number.MAX_SAFE_INTEGER ? value + 'n' : value};`);
  });
  return code.join('\n');
}

/**
 * Processes a collection of constants and generates code to export them as cpp constants.
 * Required to ensure consistency between the constants used in pil and used in the vm witness generator.
 *
 * @param constants - An object containing key-value pairs representing constants.
 * @returns A string containing code that exports the constants as cpp constants.
 */
function processConstantsCpp(
  constants: { [key: string]: string },
  generatorIndices: { [key: string]: number },
): string {
  const code: string[] = [];
  Object.entries(constants).forEach(([key, value]) => {
    if (CPP_CONSTANTS.includes(key) || key.startsWith('AVM_')) {
      if (BigInt(value) <= 2n ** 31n - 1n) {
        code.push(`#define ${key} ${value}`);
      } else if (BigInt(value) <= 2n ** 64n - 1n) {
        code.push(`#define ${key} 0x${BigInt(value).toString(16)}`); // hex literals
      } else {
        code.push(`#define ${key} "0x${BigInt(value).toString(16).padStart(64, '0')}"`); // stringify large numbers
      }
    }
  });
  Object.entries(generatorIndices).forEach(([key, value]) => {
    if (CPP_GENERATORS.includes(key)) {
      code.push(`#define DOM_SEP__${key} ${value}UL`);
    }
  });
  return code.join('\n');
}

/**
 * Processes a collection of constants and generates code to export them as PIL constants.
 * Required to ensure consistency between the constants used in pil and used in the vm witness generator.
 *
 * @param constants - An object containing key-value pairs representing constants.
 * @returns A string containing code that exports the constants as cpp constants.
 */
function processConstantsPil(
  constants: { [key: string]: string },
  generatorIndices: { [key: string]: number },
): string {
  const code: string[] = [];
  Object.entries(constants).forEach(([key, value]) => {
    if (PIL_CONSTANTS.includes(key)) {
      code.push(`    pol ${key} = ${value};`);
    }
  });
  Object.entries(generatorIndices).forEach(([key, value]) => {
    if (PIL_GENERATORS.includes(key)) {
      code.push(`    pol DOM_SEP__${key} = ${value};`);
    }
  });

  return code.join('\n');
}
/**
 * Processes an enum and generates code to export it as a TypeScript enum.
 *
 * @param enumName - The name of the enum.
 * @param enumValues - An object containing key-value pairs representing enum values.
 * @returns A string containing code that exports the enum as a TypeScript enum.
 */
function processEnumTS(enumName: string, enumValues: { [key: string]: number }): string {
  const code: string[] = [];

  code.push(`export enum ${enumName} {`);

  Object.entries(enumValues).forEach(([key, value]) => {
    code.push(`  ${key} = ${value},`);
  });

  code.push('}');

  return code.join('\n');
}

/**
 * Processes a collection of constants and generates code to export them as Solidity constants.
 *
 * @param constants - An object containing key-value pairs representing constants.
 * @param prefix - A prefix to add to the constant names.
 * @returns A string containing code that exports the constants as Noir constants.
 */
function processConstantsSolidity(constants: { [key: string]: string }, prefix = ''): string {
  const code: string[] = [];
  Object.entries(constants).forEach(([key, value]) => {
    if (SOLIDITY_CONSTANTS.includes(key)) {
      code.push(`  uint256 internal constant ${prefix}${key} = ${value};`);
    }
  });
  return code.join('\n');
}

/**
 * Generate the constants file in Typescript.
 */
function generateTypescriptConstants({ constants, domainSeparatorEnum }: ParsedContent, targetPath: string) {
  const result = [
    '// GENERATED FILE - DO NOT EDIT, RUN yarn remake-constants',
    processConstantsTS(constants),
    processEnumTS('DomainSeparator', domainSeparatorEnum),
  ].join('\n');

  fs.writeFileSync(targetPath, result);
}

/**
 * Generate the constants file in C++.
 */
function generateCppConstants({ constants, domainSeparatorEnum }: ParsedContent, targetPath: string) {
  const resultCpp: string = `// GENERATED FILE - DO NOT EDIT, RUN yarn remake-constants in yarn-project/constants
#pragma once

${processConstantsCpp(constants, domainSeparatorEnum)}
`;

  fs.writeFileSync(targetPath, resultCpp);
}

/**
 * Generate the constants file in PIL.
 */
function generatePilConstants({ constants, domainSeparatorEnum }: ParsedContent, targetPath: string) {
  const resultPil: string = `// GENERATED FILE - DO NOT EDIT, RUN yarn remake-constants in yarn-project/constants
namespace constants;
${processConstantsPil(constants, domainSeparatorEnum)}
\n`;

  fs.writeFileSync(targetPath, resultPil);
}

/**
 * Generate the constants file in Solidity.
 */
function generateSolidityConstants({ constants }: ParsedContent, targetPath: string) {
  const resultSolidity: string = `// GENERATED FILE - DO NOT EDIT, RUN yarn remake-constants in yarn-project/constants
// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.27;

/**
 * @title Constants Library
 * @author Aztec Labs
 * @notice Library that contains constants used throughout the Aztec protocol
 */
library Constants {
  // Prime field modulus
  uint256 internal constant P =
    21888242871839275222246405745257275088548364400416034343698204186575808495617;

${processConstantsSolidity(constants)}
}\n`;

  fs.writeFileSync(targetPath, resultSolidity);
}

/**
 * Parse the content of the constants file in Noir.
 */
function parseNoirFile(
  fileContent: string,
  { stripLineComments = false }: { stripLineComments?: boolean } = {},
): ParsedExpressions {
  const constantsExpressions: [string, string][] = [];
  const domainSeparatorEnum: { [key: string]: number } = {};

  const emptyExpression = (): { name: string; content: string[] } => ({ name: '', content: [] });
  let expression = emptyExpression();
  fileContent.split('\n').forEach(l => {
    // Strip trailing `//` line comments so multi-line expressions with inline comments (e.g.
    // MAX_TX_BLOB_DATA_SIZE_IN_FIELDS) parse correctly. Disabled for constants.nr to keep its
    // existing parsing behavior byte-for-byte unchanged.
    const line = (stripLineComments ? l.replace(/\/\/.*$/, '') : l).trim();

    if (!line) {
      // Empty line.
      return;
    }

    if (line.match(/^\/\/|^\s*\/?\*/)) {
      // Comment.
      return;
    }

    {
      const [, name, _type, value, end] = line.match(/global\s+(\w+)(\s*:\s*\w+)?\s*=\s*([^;]*)(;)?/) || [];
      if (name && value) {
        const [, indexName] = name.match(/DOM_SEP__(\w+)/) || [];
        if (indexName) {
          // Generator index.
          domainSeparatorEnum[indexName] = +value;
        } else if (end) {
          // A single line of expression.
          constantsExpressions.push([name, value]);
        } else {
          // The first line of an expression.
          expression = { name, content: [value] };
        }
        return;
      } else if (name) {
        // This case happens if we have only a name, with the value being on the next line
        expression = { name, content: [] };
        return;
      }
    }

    if (expression.name) {
      // The expression continues...
      const [, content, end] = line.match(/\s*([^;]+)(;)?/) || [];
      expression.content.push(content);
      if (end) {
        // The last line of an expression.
        constantsExpressions.push([expression.name, expression.content.join('')]);
        expression = emptyExpression();
      }
      return;
    }

    if (!line.includes('use crate')) {
      // eslint-disable-next-line no-console
      console.warn(`Unknown content: ${line}`);
    }
  });

  return { constantsExpressions, domainSeparatorEnum };
}

/**
 * Converts constants defined as expressions to constants with actual values.
 * @param expressions Ordered list of expressions of the type: "CONSTANT_NAME: expression".
 *   where the expression is a string that can be evaluated to a number.
 *   For example: "CONSTANT_NAME: 2 + 2" or "CONSTANT_NAME: CONSTANT_A * CONSTANT_B".
 * @returns Parsed expressions of the form: "CONSTANT_NAME: number_as_string".
 */
function evaluateExpressions(expressions: [string, string][]): { [key: string]: string } {
  const constants: { [key: string]: string } = {};

  const knownBigInts = ['AZTEC_EPOCH_DURATION', 'FEE_RECIPIENT_LENGTH'];

  // Create JS expressions. It is not as easy as just evaluating the expression!
  // We basically need to convert everything to BigInts, otherwise things don't fit.
  // However, (1) the bigints need to be initialized from strings; (2) everything needs to
  // be a bigint, even the actual constant values!
  const prelude = expressions
    .map(([name, rhs]) => {
      const guardedRhs = rhs
        // Remove 'as u8', 'as u32' and 'as u64' castings
        .replaceAll(' as u8', '')
        .replaceAll(' as u32', '')
        .replaceAll(' as u64', '')
        // Remove the 'AztecAddress::from_field(...)' pattern.
        // Also copes with the noir formatter re-formatting over multiple lines.
        .replace(/AztecAddress::from_field\(\s*(0x[a-fA-F0-9]+|\d+)\s*,?\s*\)/gs, '$1')
        // We make some space around the parentheses, so that constant numbers are still split.
        .replace(/\(/g, '( ')
        .replace(/\)/g, ' )')
        // We also make some space around common operators
        .replace(/\+/g, ' + ')
        .replace(/(?<!\/)\*(?!\/)/, ' * ')
        // We split the expression into terms...
        .split(/\s+/)
        // ...and then we convert each term to a BigInt if it is a number.
        .map(term => {
          // Remove underscores from numeric literals (e.g., 6_000_000 -> 6000000)
          const termWithoutUnderscores = term.replace(/_/g, '');
          return isNaN(+termWithoutUnderscores) ? term : `BigInt('${termWithoutUnderscores}')`;
        })
        // .. also, we convert the known bigints to BigInts.
        .map(term => (knownBigInts.includes(term) ? `BigInt(${term})` : term))
        // We join the terms back together.
        .join(' ');
      return `var ${name} = ${guardedRhs};`;
    })
    .join('\n');

  // Extract each value from the expressions. Observe that this will still be a string,
  // so that we can then choose to express it as BigInt or Number depending on the size.
  for (const [name, _] of expressions) {
    constants[name] = eval(prelude + `; BigInt(${name}).toString()`);
  }

  return constants;
}

/**
 * Convert the Noir constants to TypeScript and Solidity.
 */
function main(): void {
  const __dirname = dirname(fileURLToPath(import.meta.url));

  const noirConstantsFile = join(__dirname, NOIR_CONSTANTS_FILE);
  const noirConstants = fs.readFileSync(noirConstantsFile, 'utf-8');
  const { constantsExpressions, domainSeparatorEnum } = parseNoirFile(noirConstants);

  // Pull in explicitly-listed constants defined outside constants.nr (e.g. alongside circuit code).
  // They are appended after the main constants so they can reference them when evaluated together.
  for (const { file, constants: names } of ADDITIONAL_NOIR_CONSTANT_FILES) {
    const additionalContent = fs.readFileSync(join(__dirname, file), 'utf-8');
    const { constantsExpressions: additionalExpressions } = parseNoirFile(additionalContent, {
      stripLineComments: true,
    });
    for (const name of names) {
      const expression = additionalExpressions.find(([exprName]) => exprName === name);
      if (!expression) {
        throw new Error(`Constant ${name} not found in ${file}`);
      }
      constantsExpressions.push(expression);
    }
  }

  const parsedContent: ParsedContent = {
    constants: evaluateExpressions(constantsExpressions),
    domainSeparatorEnum,
  };

  // Typescript
  const tsTargetPath = join(__dirname, TS_CONSTANTS_FILE);
  generateTypescriptConstants(parsedContent, tsTargetPath);

  // Cpp
  const cppTargetPath = join(__dirname, CPP_AZTEC_CONSTANTS_FILE);
  generateCppConstants(parsedContent, cppTargetPath);

  // PIL
  const pilTargetPath = join(__dirname, PIL_AZTEC_CONSTANTS_FILE);
  generatePilConstants(parsedContent, pilTargetPath);

  // Solidity
  const solidityTargetPath = join(__dirname, SOLIDITY_CONSTANTS_FILE);
  fs.mkdirSync(dirname(solidityTargetPath), { recursive: true });
  generateSolidityConstants(parsedContent, solidityTargetPath);
}

main();
