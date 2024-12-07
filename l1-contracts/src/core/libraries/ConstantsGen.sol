// GENERATED FILE - DO NOT EDIT, RUN yarn remake-constants in circuits.js
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

  uint256 internal constant MAX_FIELD_VALUE =
    21888242871839275222246405745257275088548364400416034343698204186575808495616;
  uint256 internal constant ARGS_LENGTH = 16;
  uint256 internal constant MAX_NOTE_HASHES_PER_CALL = 16;
  uint256 internal constant MAX_NULLIFIERS_PER_CALL = 16;
  uint256 internal constant MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL = 5;
  uint256 internal constant MAX_ENQUEUED_CALLS_PER_CALL = 16;
  uint256 internal constant MAX_L2_TO_L1_MSGS_PER_CALL = 2;
  uint256 internal constant MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL = 64;
  uint256 internal constant MAX_PUBLIC_DATA_READS_PER_CALL = 64;
  uint256 internal constant MAX_NOTE_HASH_READ_REQUESTS_PER_CALL = 16;
  uint256 internal constant MAX_NULLIFIER_READ_REQUESTS_PER_CALL = 16;
  uint256 internal constant MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_CALL = 16;
  uint256 internal constant MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_CALL = 16;
  uint256 internal constant MAX_KEY_VALIDATION_REQUESTS_PER_CALL = 16;
  uint256 internal constant MAX_PRIVATE_LOGS_PER_CALL = 16;
  uint256 internal constant MAX_UNENCRYPTED_LOGS_PER_CALL = 4;
  uint256 internal constant MAX_CONTRACT_CLASS_LOGS_PER_CALL = 1;
  uint256 internal constant ARCHIVE_HEIGHT = 29;
  uint256 internal constant VK_TREE_HEIGHT = 6;
  uint256 internal constant PROTOCOL_CONTRACT_TREE_HEIGHT = 3;
  uint256 internal constant FUNCTION_TREE_HEIGHT = 5;
  uint256 internal constant NOTE_HASH_TREE_HEIGHT = 40;
  uint256 internal constant PUBLIC_DATA_TREE_HEIGHT = 40;
  uint256 internal constant NULLIFIER_TREE_HEIGHT = 40;
  uint256 internal constant L1_TO_L2_MSG_TREE_HEIGHT = 39;
  uint256 internal constant ARTIFACT_FUNCTION_TREE_MAX_HEIGHT = 5;
  uint256 internal constant NULLIFIER_TREE_ID = 0;
  uint256 internal constant NOTE_HASH_TREE_ID = 1;
  uint256 internal constant PUBLIC_DATA_TREE_ID = 2;
  uint256 internal constant L1_TO_L2_MESSAGE_TREE_ID = 3;
  uint256 internal constant ARCHIVE_TREE_ID = 4;
  uint256 internal constant NOTE_HASH_SUBTREE_HEIGHT = 6;
  uint256 internal constant NULLIFIER_SUBTREE_HEIGHT = 6;
  uint256 internal constant PUBLIC_DATA_SUBTREE_HEIGHT = 6;
  uint256 internal constant L1_TO_L2_MSG_SUBTREE_HEIGHT = 4;
  uint256 internal constant NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH = 34;
  uint256 internal constant NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH = 34;
  uint256 internal constant L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH = 35;
  uint256 internal constant MAX_NOTE_HASHES_PER_TX = 64;
  uint256 internal constant MAX_NULLIFIERS_PER_TX = 64;
  uint256 internal constant MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX = 8;
  uint256 internal constant MAX_ENQUEUED_CALLS_PER_TX = 32;
  uint256 internal constant PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX = 1;
  uint256 internal constant MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX = 64;
  uint256 internal constant MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX = 63;
  uint256 internal constant MAX_PUBLIC_DATA_READS_PER_TX = 64;
  uint256 internal constant MAX_L2_TO_L1_MSGS_PER_TX = 8;
  uint256 internal constant MAX_NOTE_HASH_READ_REQUESTS_PER_TX = 64;
  uint256 internal constant MAX_NULLIFIER_READ_REQUESTS_PER_TX = 64;
  uint256 internal constant MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX = 64;
  uint256 internal constant MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX = 64;
  uint256 internal constant MAX_KEY_VALIDATION_REQUESTS_PER_TX = 64;
  uint256 internal constant MAX_PRIVATE_LOGS_PER_TX = 32;
  uint256 internal constant MAX_UNENCRYPTED_LOGS_PER_TX = 8;
  uint256 internal constant MAX_CONTRACT_CLASS_LOGS_PER_TX = 1;
  uint256 internal constant NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP = 16;
  uint256 internal constant EMPTY_NESTED_INDEX = 0;
  uint256 internal constant PRIVATE_KERNEL_EMPTY_INDEX = 1;
  uint256 internal constant PRIVATE_KERNEL_INIT_INDEX = 2;
  uint256 internal constant PRIVATE_KERNEL_INNER_INDEX = 3;
  uint256 internal constant PRIVATE_KERNEL_TAIL_INDEX = 4;
  uint256 internal constant PRIVATE_KERNEL_TAIL_TO_PUBLIC_INDEX = 5;
  uint256 internal constant TUBE_VK_INDEX = 6;
  uint256 internal constant PRIVATE_BASE_ROLLUP_VK_INDEX = 8;
  uint256 internal constant PUBLIC_BASE_ROLLUP_VK_INDEX = 9;
  uint256 internal constant BASE_PARITY_INDEX = 10;
  uint256 internal constant ROOT_PARITY_INDEX = 11;
  uint256 internal constant MERGE_ROLLUP_INDEX = 12;
  uint256 internal constant BLOCK_ROOT_ROLLUP_INDEX = 13;
  uint256 internal constant BLOCK_MERGE_ROLLUP_INDEX = 14;
  uint256 internal constant ROOT_ROLLUP_INDEX = 15;
  uint256 internal constant BLOCK_ROOT_ROLLUP_EMPTY_INDEX = 16;
  uint256 internal constant PRIVATE_KERNEL_RESET_INDEX = 20;
  uint256 internal constant FUNCTION_SELECTOR_NUM_BYTES = 4;
  uint256 internal constant INITIALIZATION_SLOT_SEPARATOR = 1000000000;
  uint256 internal constant INITIAL_L2_BLOCK_NUM = 1;
  uint256 internal constant PRIVATE_LOG_SIZE_IN_FIELDS = 18;
  uint256 internal constant BLOB_SIZE_IN_BYTES = 126976;
  uint256 internal constant AZTEC_MAX_EPOCH_DURATION = 32;
  uint256 internal constant GENESIS_ARCHIVE_ROOT =
    1002640778211850180189505934749257244705296832326768971348723156503780793518;
  uint256 internal constant FEE_JUICE_INITIAL_MINT = 200000000000000000000;
  uint256 internal constant PUBLIC_DISPATCH_SELECTOR = 3578010381;
  uint256 internal constant MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS = 3000;
  uint256 internal constant MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS = 3000;
  uint256 internal constant MAX_PACKED_BYTECODE_SIZE_PER_UNCONSTRAINED_FUNCTION_IN_FIELDS = 3000;
  uint256 internal constant REGISTERER_PRIVATE_FUNCTION_BROADCASTED_ADDITIONAL_FIELDS = 19;
  uint256 internal constant REGISTERER_UNCONSTRAINED_FUNCTION_BROADCASTED_ADDITIONAL_FIELDS = 12;
  uint256 internal constant REGISTERER_CONTRACT_CLASS_REGISTERED_MAGIC_VALUE =
    11121068431693264234253912047066709627593769337094408533543930778360;
  uint256 internal constant REGISTERER_PRIVATE_FUNCTION_BROADCASTED_MAGIC_VALUE =
    2889881020989534926461066592611988634597302675057895885580456197069;
  uint256 internal constant REGISTERER_UNCONSTRAINED_FUNCTION_BROADCASTED_MAGIC_VALUE =
    24399338136397901754495080759185489776044879232766421623673792970137;
  uint256 internal constant DEPLOYER_CONTRACT_INSTANCE_DEPLOYED_MAGIC_VALUE =
    14061769416655647708490531650437236735160113654556896985372298487345;
  uint256 internal constant DEFAULT_GAS_LIMIT = 1000000000;
  uint256 internal constant DEFAULT_TEARDOWN_GAS_LIMIT = 12000000;
  uint256 internal constant MAX_L2_GAS_PER_ENQUEUED_CALL = 12000000;
  uint256 internal constant DA_BYTES_PER_FIELD = 32;
  uint256 internal constant DA_GAS_PER_BYTE = 16;
  uint256 internal constant FIXED_DA_GAS = 512;
  uint256 internal constant FIXED_L2_GAS = 512;
  uint256 internal constant FIXED_AVM_STARTUP_L2_GAS = 1024;
  uint256 internal constant L2_GAS_DISTRIBUTED_STORAGE_PREMIUM = 1024;
  uint256 internal constant L2_GAS_PER_READ_MERKLE_HASH = 30;
  uint256 internal constant L2_GAS_PER_WRITE_MERKLE_HASH = 40;
  uint256 internal constant L2_GAS_PER_PUBLIC_DATA_UPDATE = 2624;
  uint256 internal constant L2_GAS_PER_NOTE_HASH = 2624;
  uint256 internal constant L2_GAS_PER_NULLIFIER = 4224;
  uint256 internal constant L2_GAS_PER_PUBLIC_DATA_READ = 1200;
  uint256 internal constant L2_GAS_PER_NOTE_HASH_READ_REQUEST = 1200;
  uint256 internal constant L2_GAS_PER_NULLIFIER_READ_REQUEST = 2400;
  uint256 internal constant L2_GAS_PER_L1_TO_L2_MSG_READ_REQUEST = 1170;
  uint256 internal constant L2_GAS_PER_LOG_BYTE = 4;
  uint256 internal constant L2_GAS_PER_PRIVATE_LOG = 0;
  uint256 internal constant L2_GAS_PER_L2_TO_L1_MSG = 200;
  uint256 internal constant MAX_PROTOCOL_CONTRACTS = 7;
  uint256 internal constant CANONICAL_AUTH_REGISTRY_ADDRESS = 1;
  uint256 internal constant DEPLOYER_CONTRACT_ADDRESS = 2;
  uint256 internal constant REGISTERER_CONTRACT_ADDRESS = 3;
  uint256 internal constant MULTI_CALL_ENTRYPOINT_ADDRESS = 4;
  uint256 internal constant FEE_JUICE_ADDRESS = 5;
  uint256 internal constant ROUTER_ADDRESS = 6;
  uint256 internal constant DEFAULT_NPK_M_X =
    582240093077765400562621227108555700500271598878376310175765873770292988861;
  uint256 internal constant DEFAULT_NPK_M_Y =
    10422444662424639723529825114205836958711284159673861467999592572974769103684;
  uint256 internal constant DEFAULT_IVPK_M_X =
    339708709767762472786445938838804872781183545349360029270386718856175781484;
  uint256 internal constant DEFAULT_IVPK_M_Y =
    12719619215050539905199178334954929730355853796706924300730604757520758976849;
  uint256 internal constant DEFAULT_OVPK_M_X =
    12212787719617305570587928860288475454328008955283046946846066128763901043335;
  uint256 internal constant DEFAULT_OVPK_M_Y =
    3646747884782549389807830220601404629716007431341772952958971658285958854707;
  uint256 internal constant DEFAULT_TPK_M_X =
    728059161893070741164607238299536939695876538801885465230641192969135857403;
  uint256 internal constant DEFAULT_TPK_M_Y =
    14575718736702206050102425029229426215631664471161015518982549597389390371695;
  uint256 internal constant AZTEC_ADDRESS_LENGTH = 1;
  uint256 internal constant GAS_FEES_LENGTH = 2;
  uint256 internal constant GAS_LENGTH = 2;
  uint256 internal constant GAS_SETTINGS_LENGTH = 6;
  uint256 internal constant CALL_CONTEXT_LENGTH = 4;
  uint256 internal constant CONTENT_COMMITMENT_LENGTH = 4;
  uint256 internal constant CONTRACT_INSTANCE_LENGTH = 16;
  uint256 internal constant CONTRACT_STORAGE_READ_LENGTH = 3;
  uint256 internal constant CONTRACT_STORAGE_UPDATE_REQUEST_LENGTH = 3;
  uint256 internal constant ETH_ADDRESS_LENGTH = 1;
  uint256 internal constant FUNCTION_DATA_LENGTH = 2;
  uint256 internal constant FUNCTION_LEAF_PREIMAGE_LENGTH = 5;
  uint256 internal constant GLOBAL_VARIABLES_LENGTH = 9;
  uint256 internal constant APPEND_ONLY_TREE_SNAPSHOT_LENGTH = 2;
  uint256 internal constant L1_TO_L2_MESSAGE_LENGTH = 6;
  uint256 internal constant L2_TO_L1_MESSAGE_LENGTH = 3;
  uint256 internal constant SCOPED_L2_TO_L1_MESSAGE_LENGTH = 4;
  uint256 internal constant MAX_BLOCK_NUMBER_LENGTH = 2;
  uint256 internal constant KEY_VALIDATION_REQUEST_LENGTH = 4;
  uint256 internal constant KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH = 5;
  uint256 internal constant SCOPED_KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH = 6;
  uint256 internal constant PARTIAL_STATE_REFERENCE_LENGTH = 6;
  uint256 internal constant READ_REQUEST_LENGTH = 2;
  uint256 internal constant TREE_LEAF_READ_REQUEST_LENGTH = 2;
  uint256 internal constant PRIVATE_LOG_DATA_LENGTH = 20;
  uint256 internal constant SCOPED_PRIVATE_LOG_DATA_LENGTH = 21;
  uint256 internal constant LOG_HASH_LENGTH = 3;
  uint256 internal constant SCOPED_LOG_HASH_LENGTH = 4;
  uint256 internal constant NOTE_HASH_LENGTH = 2;
  uint256 internal constant SCOPED_NOTE_HASH_LENGTH = 3;
  uint256 internal constant NULLIFIER_LENGTH = 3;
  uint256 internal constant SCOPED_NULLIFIER_LENGTH = 4;
  uint256 internal constant PUBLIC_DATA_WRITE_LENGTH = 2;
  uint256 internal constant PUBLIC_CALL_STACK_ITEM_COMPRESSED_LENGTH = 12;
  uint256 internal constant PRIVATE_CALL_REQUEST_LENGTH = 8;
  uint256 internal constant PUBLIC_CALL_REQUEST_LENGTH = 5;
  uint256 internal constant COUNTED_PUBLIC_CALL_REQUEST_LENGTH = 6;
  uint256 internal constant PUBLIC_INNER_CALL_REQUEST_LENGTH = 13;
  uint256 internal constant ROLLUP_VALIDATION_REQUESTS_LENGTH = 2;
  uint256 internal constant STATE_REFERENCE_LENGTH = 8;
  uint256 internal constant TREE_SNAPSHOTS_LENGTH = 8;
  uint256 internal constant TX_CONTEXT_LENGTH = 8;
  uint256 internal constant TX_REQUEST_LENGTH = 12;
  uint256 internal constant TOTAL_FEES_LENGTH = 1;
  uint256 internal constant TOTAL_MANA_USED_LENGTH = 1;
  uint256 internal constant HEADER_LENGTH = 25;
  uint256 internal constant PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH = 739;
  uint256 internal constant PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH = 867;
  uint256 internal constant PRIVATE_CONTEXT_INPUTS_LENGTH = 38;
  uint256 internal constant FEE_RECIPIENT_LENGTH = 2;
  uint256 internal constant AGGREGATION_OBJECT_LENGTH = 16;
  uint256 internal constant SCOPED_READ_REQUEST_LEN = 3;
  uint256 internal constant PUBLIC_DATA_READ_LENGTH = 3;
  uint256 internal constant PRIVATE_VALIDATION_REQUESTS_LENGTH = 772;
  uint256 internal constant COMBINED_ACCUMULATED_DATA_LENGTH = 900;
  uint256 internal constant TX_CONSTANT_DATA_LENGTH = 35;
  uint256 internal constant COMBINED_CONSTANT_DATA_LENGTH = 44;
  uint256 internal constant PRIVATE_ACCUMULATED_DATA_LENGTH = 1412;
  uint256 internal constant PRIVATE_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH = 2226;
  uint256 internal constant PRIVATE_TO_PUBLIC_ACCUMULATED_DATA_LENGTH = 900;
  uint256 internal constant PRIVATE_TO_AVM_ACCUMULATED_DATA_LENGTH = 160;
  uint256 internal constant NUM_PRIVATE_TO_AVM_ACCUMULATED_DATA_ARRAYS = 3;
  uint256 internal constant PRIVATE_TO_PUBLIC_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH = 1845;
  uint256 internal constant KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH = 956;
  uint256 internal constant CONSTANT_ROLLUP_DATA_LENGTH = 13;
  uint256 internal constant BASE_OR_MERGE_PUBLIC_INPUTS_LENGTH = 31;
  uint256 internal constant BLOCK_ROOT_OR_BLOCK_MERGE_PUBLIC_INPUTS_LENGTH = 90;
  uint256 internal constant ROOT_ROLLUP_PUBLIC_INPUTS_LENGTH = 76;
  uint256 internal constant GET_NOTES_ORACLE_RETURN_LENGTH = 674;
  uint256 internal constant NOTE_HASHES_NUM_BYTES_PER_BASE_ROLLUP = 2048;
  uint256 internal constant NULLIFIERS_NUM_BYTES_PER_BASE_ROLLUP = 2048;
  uint256 internal constant PUBLIC_DATA_WRITES_NUM_BYTES_PER_BASE_ROLLUP = 4096;
  uint256 internal constant PRIVATE_LOGS_NUM_BYTES_PER_BASE_ROLLUP = 18432;
  uint256 internal constant CONTRACTS_NUM_BYTES_PER_BASE_ROLLUP = 32;
  uint256 internal constant CONTRACT_DATA_NUM_BYTES_PER_BASE_ROLLUP = 64;
  uint256 internal constant CONTRACT_DATA_NUM_BYTES_PER_BASE_ROLLUP_UNPADDED = 52;
  uint256 internal constant L2_TO_L1_MSGS_NUM_BYTES_PER_BASE_ROLLUP = 256;
  uint256 internal constant LOGS_HASHES_NUM_BYTES_PER_BASE_ROLLUP = 64;
  uint256 internal constant NUM_MSGS_PER_BASE_PARITY = 4;
  uint256 internal constant NUM_BASE_PARITY_PER_ROOT_PARITY = 4;
  uint256 internal constant RECURSIVE_PROOF_LENGTH = 463;
  uint256 internal constant NESTED_RECURSIVE_PROOF_LENGTH = 463;
  uint256 internal constant TUBE_PROOF_LENGTH = 463;
  uint256 internal constant HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS = 128;
  uint256 internal constant CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS = 143;
  uint256 internal constant MEM_TAG_FF = 0;
  uint256 internal constant MEM_TAG_U1 = 1;
  uint256 internal constant MEM_TAG_U8 = 2;
  uint256 internal constant MEM_TAG_U16 = 3;
  uint256 internal constant MEM_TAG_U32 = 4;
  uint256 internal constant MEM_TAG_U64 = 5;
  uint256 internal constant MEM_TAG_U128 = 6;
  uint256 internal constant SENDER_KERNEL_INPUTS_COL_OFFSET = 0;
  uint256 internal constant ADDRESS_KERNEL_INPUTS_COL_OFFSET = 1;
  uint256 internal constant FUNCTION_SELECTOR_KERNEL_INPUTS_COL_OFFSET = 2;
  uint256 internal constant IS_STATIC_CALL_KERNEL_INPUTS_COL_OFFSET = 3;
  uint256 internal constant CHAIN_ID_KERNEL_INPUTS_COL_OFFSET = 4;
  uint256 internal constant VERSION_KERNEL_INPUTS_COL_OFFSET = 5;
  uint256 internal constant BLOCK_NUMBER_KERNEL_INPUTS_COL_OFFSET = 6;
  uint256 internal constant TIMESTAMP_KERNEL_INPUTS_COL_OFFSET = 7;
  uint256 internal constant FEE_PER_DA_GAS_KERNEL_INPUTS_COL_OFFSET = 8;
  uint256 internal constant FEE_PER_L2_GAS_KERNEL_INPUTS_COL_OFFSET = 9;
  uint256 internal constant DA_START_GAS_KERNEL_INPUTS_COL_OFFSET = 10;
  uint256 internal constant L2_START_GAS_KERNEL_INPUTS_COL_OFFSET = 11;
  uint256 internal constant DA_END_GAS_KERNEL_INPUTS_COL_OFFSET = 12;
  uint256 internal constant L2_END_GAS_KERNEL_INPUTS_COL_OFFSET = 13;
  uint256 internal constant TRANSACTION_FEE_KERNEL_INPUTS_COL_OFFSET = 14;
  uint256 internal constant START_NOTE_HASH_EXISTS_WRITE_OFFSET = 0;
  uint256 internal constant START_NULLIFIER_EXISTS_OFFSET = 16;
  uint256 internal constant START_NULLIFIER_NON_EXISTS_OFFSET = 32;
  uint256 internal constant START_L1_TO_L2_MSG_EXISTS_WRITE_OFFSET = 48;
  uint256 internal constant START_SSTORE_WRITE_OFFSET = 64;
  uint256 internal constant START_SLOAD_WRITE_OFFSET = 128;
  uint256 internal constant START_EMIT_NOTE_HASH_WRITE_OFFSET = 192;
  uint256 internal constant START_EMIT_NULLIFIER_WRITE_OFFSET = 208;
  uint256 internal constant START_EMIT_L2_TO_L1_MSG_WRITE_OFFSET = 224;
  uint256 internal constant START_EMIT_UNENCRYPTED_LOG_WRITE_OFFSET = 226;
  uint256 internal constant PROOF_TYPE_PLONK = 0;
  uint256 internal constant PROOF_TYPE_HONK = 1;
  uint256 internal constant PROOF_TYPE_OINK = 2;
  uint256 internal constant PROOF_TYPE_PG = 3;
  uint256 internal constant PROOF_TYPE_AVM = 4;
}
