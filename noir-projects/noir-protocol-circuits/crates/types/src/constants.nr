use crate::address::AztecAddress;

pub global MAX_FIELD_VALUE: Field =
    21888242871839275222246405745257275088548364400416034343698204186575808495616;
pub global ARGS_LENGTH: u32 = 16;

/**
 * Convention for constant array lengths are mainly divided in 2 classes:
 *  - FUNCTION CALL
 *  - TRANSACTION
 *
 * Agreed convention is to use MAX_XXX_PER_CALL resp. MAX_XXX_PER_TX, where XXX denotes a type of element such as
 * commitment, or nullifier, e.g.,:
 *  - MAX_NULLIFIERS_PER_CALL
 *  - MAX_NOTE_HASHES_PER_TX
 *
 * In the kernel circuits, we accumulate elements such as note hashes and the nullifiers from all functions calls in a
 * transaction. Therefore, we always must have:
 * MAX_XXX_PER_TX >= MAX_XXX_PER_CALL
 *
 * For instance:
 * MAX_NOTE_HASHES_PER_TX >= MAX_NOTE_HASHES_PER_CALL
 * MAX_NULLIFIERS_PER_TX >= MAX_NULLIFIERS_PER_CALL
 *
 */

// docs:start:constants
// "PER CALL" CONSTANTS
pub global MAX_NOTE_HASHES_PER_CALL: u32 = 16;
pub global MAX_NULLIFIERS_PER_CALL: u32 = 16;
pub global MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL: u32 = 5;
pub global MAX_ENQUEUED_CALLS_PER_CALL: u32 = 16;
pub global MAX_L2_TO_L1_MSGS_PER_CALL: u32 = 2;
pub global MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL: u32 = 64;
pub global MAX_PUBLIC_DATA_READS_PER_CALL: u32 = 64;
pub global MAX_NOTE_HASH_READ_REQUESTS_PER_CALL: u32 = 16;
pub global MAX_NULLIFIER_READ_REQUESTS_PER_CALL: u32 = 16;
pub global MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_CALL: u32 = 16;
pub global MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_CALL: u32 = 16;
pub global MAX_KEY_VALIDATION_REQUESTS_PER_CALL: u32 = 16;
pub global MAX_PRIVATE_LOGS_PER_CALL: u32 = 16;
pub global MAX_UNENCRYPTED_LOGS_PER_CALL: u32 = 4;
pub global MAX_CONTRACT_CLASS_LOGS_PER_CALL: u32 = 1;

// TREES RELATED CONSTANTS
pub global ARCHIVE_HEIGHT: u32 = 29;
pub global VK_TREE_HEIGHT: u32 = 6;
pub global PROTOCOL_CONTRACT_TREE_HEIGHT: u32 = 3;
pub global FUNCTION_TREE_HEIGHT: u32 = 5;
pub global NOTE_HASH_TREE_HEIGHT: u32 = 40;
pub global PUBLIC_DATA_TREE_HEIGHT: u32 = 40;
pub global NULLIFIER_TREE_HEIGHT: u32 = 40;
pub global L1_TO_L2_MSG_TREE_HEIGHT: u32 = 39;
pub global ARTIFACT_FUNCTION_TREE_MAX_HEIGHT: u32 = 5;
pub global NULLIFIER_TREE_ID: Field = 0;
pub global NOTE_HASH_TREE_ID: Field = 1;
pub global PUBLIC_DATA_TREE_ID: Field = 2;
pub global L1_TO_L2_MESSAGE_TREE_ID: Field = 3;
pub global ARCHIVE_TREE_ID: Field = 4;

// SUB-TREES RELATED CONSTANTS
pub global NOTE_HASH_SUBTREE_HEIGHT: u32 = 6;
pub global NULLIFIER_SUBTREE_HEIGHT: u32 = 6;
// Deprecated: to be removed after removal of legacy ts trees
pub global PUBLIC_DATA_SUBTREE_HEIGHT: u32 = 6;
pub global L1_TO_L2_MSG_SUBTREE_HEIGHT: u32 = 4;
pub global NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH: u32 =
    NOTE_HASH_TREE_HEIGHT - NOTE_HASH_SUBTREE_HEIGHT;
pub global NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH: u32 =
    NULLIFIER_TREE_HEIGHT - NULLIFIER_SUBTREE_HEIGHT;
pub global L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH: u32 =
    L1_TO_L2_MSG_TREE_HEIGHT - L1_TO_L2_MSG_SUBTREE_HEIGHT;

// "PER TRANSACTION" CONSTANTS
pub global MAX_NOTE_HASHES_PER_TX: u32 = (1 as u8 << NOTE_HASH_SUBTREE_HEIGHT as u8) as u32;
pub global MAX_NULLIFIERS_PER_TX: u32 = (1 as u8 << NULLIFIER_SUBTREE_HEIGHT as u8) as u32;
pub global MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX: u32 = 8;
pub global MAX_ENQUEUED_CALLS_PER_TX: u32 = 32;
pub global PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX: u32 = 1;
pub global MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX: u32 =
    (1 as u8 << PUBLIC_DATA_SUBTREE_HEIGHT as u8) as u32;
pub global MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX: u32 =
    MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX - PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX;
pub global MAX_PUBLIC_DATA_READS_PER_TX: u32 = 64;
pub global MAX_L2_TO_L1_MSGS_PER_TX: u32 = 8;
pub global MAX_NOTE_HASH_READ_REQUESTS_PER_TX: u32 = 64;
pub global MAX_NULLIFIER_READ_REQUESTS_PER_TX: u32 = 64;
pub global MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX: u32 = 64;
pub global MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX: u32 = 64;
// TODO: for large multisends we might run out of key validation requests here but not dealing with this now as
// databus will hopefully make the issue go away.
pub global MAX_KEY_VALIDATION_REQUESTS_PER_TX: u32 = 64;
pub global MAX_PRIVATE_LOGS_PER_TX: u32 = 32;
pub global MAX_UNENCRYPTED_LOGS_PER_TX: u32 = 8;
pub global MAX_CONTRACT_CLASS_LOGS_PER_TX: u32 = 1;
// docs:end:constants

// ROLLUP CONTRACT CONSTANTS - constants used only in l1-contracts
pub global NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP: u32 = 16;

// VK TREE CONSTANTS
pub comptime global EMPTY_NESTED_INDEX: u32 = 0;
pub comptime global PRIVATE_KERNEL_EMPTY_INDEX: u32 = 1;
pub comptime global PRIVATE_KERNEL_INIT_INDEX: u32 = 2;
pub comptime global PRIVATE_KERNEL_INNER_INDEX: u32 = 3;
pub comptime global PRIVATE_KERNEL_TAIL_INDEX: u32 = 4;
pub comptime global PRIVATE_KERNEL_TAIL_TO_PUBLIC_INDEX: u32 = 5;
pub comptime global TUBE_VK_INDEX: u32 = 6;
pub comptime global AVM_VK_INDEX: u32 = 7;
pub comptime global PRIVATE_BASE_ROLLUP_VK_INDEX: u32 = 8;
pub comptime global PUBLIC_BASE_ROLLUP_VK_INDEX: u32 = 9;
pub comptime global BASE_PARITY_INDEX: u32 = 10;
pub comptime global ROOT_PARITY_INDEX: u32 = 11;
pub comptime global MERGE_ROLLUP_INDEX: u32 = 12;
pub comptime global BLOCK_ROOT_ROLLUP_INDEX: u32 = 13;
pub comptime global BLOCK_MERGE_ROLLUP_INDEX: u32 = 14;
pub comptime global ROOT_ROLLUP_INDEX: u32 = 15;
pub comptime global BLOCK_ROOT_ROLLUP_EMPTY_INDEX: u32 = 16;
pub comptime global PRIVATE_KERNEL_RESET_INDEX: u32 = 20;
// Important: Do not define indexes after the PRIVATE_KERNEL_RESET_INDEX. They are allocated for the variants of private kernel reset.

// MISC CONSTANTS
pub global FUNCTION_SELECTOR_NUM_BYTES: Field = 4;
// The following is used in immutable state variables to compute an initialization slot whose value is used to
// determine whether a given variable has been initialized (by asserting that the value in the slot is 0).
// The initialization slot is computed by adding the constant below to the variable's storage slot. This constant has
// to be large enough so that it's ensured that it doesn't collide with storage slots of other variables.
pub global INITIALIZATION_SLOT_SEPARATOR: Field = 1000_000_000;
pub global INITIAL_L2_BLOCK_NUM: Field = 1;
pub global PRIVATE_LOG_SIZE_IN_FIELDS: u32 = 18; // This is currently affected by the size of the log overhead defined in aztec-nr/aztec/src/encrypted_logs/payload.nr.
pub global BLOB_SIZE_IN_BYTES: Field = 31 * 4096;
pub global AZTEC_MAX_EPOCH_DURATION: u32 = 32;
// The following is taken from building a block and looking at the `lastArchive` value in it.
// You can run the `integration_l1_publisher.test.ts` and look at the first blocks in the fixtures.
pub global GENESIS_ARCHIVE_ROOT: Field =
    0x0237797d6a2c04d20d4fa06b74482bd970ccd51a43d9b05b57e9b91fa1ae1cae;
// The following and the value in `deploy_l1_contracts` must match. We should not have the code both places, but
// we are running into circular dependency issues. #3342
global FEE_JUICE_INITIAL_MINT: Field = 200000000000000000000;
// Last 4 bytes of the Poseidon2 hash of 'public_dispatch(Field)'.
pub global PUBLIC_DISPATCH_SELECTOR: Field = 0xd5441b0d;

// CONTRACT CLASS CONSTANTS
pub global MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS: u32 = 3000;
// Bytecode size for private functions is per function, not for the entire contract.
// Note that private functions bytecode includes a mix of acir and brillig.
pub global MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS: u32 = 3000;
// Same for unconstrained functions: the size is per function.
pub global MAX_PACKED_BYTECODE_SIZE_PER_UNCONSTRAINED_FUNCTION_IN_FIELDS: u32 = 3000;
// How many fields are on the serialized ClassPrivateFunctionBroadcasted event in addition to MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS.
pub global REGISTERER_PRIVATE_FUNCTION_BROADCASTED_ADDITIONAL_FIELDS: u32 = 19;
// How many fields are on the serialized ClassUnconstrainedFunctionBroadcasted event in addition to MAX_PACKED_BYTECODE_SIZE_PER_UNCONSTRAINED_FUNCTION_IN_FIELDS.
pub global REGISTERER_UNCONSTRAINED_FUNCTION_BROADCASTED_ADDITIONAL_FIELDS: u32 = 12;
// Since we are not yet emitting selectors we'll use this magic value to identify events emitted by the ClassRegisterer.
// This is just a stopgap until we implement proper selectors.
// sha224sum 'struct ContractClassRegistered {contract_class_id: ContractClassId, version: Field, artifact_hash: Field, private_functions_root: Field, packed_public_bytecode: [Field; MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS] }'
pub global REGISTERER_CONTRACT_CLASS_REGISTERED_MAGIC_VALUE: Field =
    0x6999d1e02b08a447a463563453cb36919c9dd7150336fc7c4d2b52f8;
// sha224sum 'struct ClassPrivateFunctionBroadcasted'
pub global REGISTERER_PRIVATE_FUNCTION_BROADCASTED_MAGIC_VALUE: Field =
    0x1b70e95fde0b70adc30496b90a327af6a5e383e028e7a43211a07bcd;
// sha224sum 'struct ClassUnconstrainedFunctionBroadcasted'
pub global REGISTERER_UNCONSTRAINED_FUNCTION_BROADCASTED_MAGIC_VALUE: Field =
    0xe7af816635466f128568edb04c9fa024f6c87fb9010fdbffa68b3d99;

// CONTRACT INSTANCE CONSTANTS
// sha224sum 'struct ContractInstanceDeployed'
pub global DEPLOYER_CONTRACT_INSTANCE_DEPLOYED_MAGIC_VALUE: Field =
    0x85864497636cf755ae7bde03f267ce01a520981c21c3682aaf82a631;

// GAS DEFAULTS
pub global DEFAULT_GAS_LIMIT: u32 = 1_000_000_000;
pub global DEFAULT_TEARDOWN_GAS_LIMIT: u32 = 12_000_000;
pub global MAX_L2_GAS_PER_ENQUEUED_CALL: u32 = 12_000_000;
pub global DA_BYTES_PER_FIELD: u32 = 32;
pub global DA_GAS_PER_BYTE: u32 = 16;
// pays for preamble information in TX Effects
pub global FIXED_DA_GAS: u32 = 512;
// pays for fixed tx costs like validation, and updating state roots
pub global FIXED_L2_GAS: u32 = 512;
// base cost for a single public call
pub global FIXED_AVM_STARTUP_L2_GAS: u32 = 1024;

// Some tree insertions incur an additional cost associated with
// the new database entry to be stored by all network participants.
pub global L2_GAS_DISTRIBUTED_STORAGE_PREMIUM: u32 = 1024;

// Kernel and/or rollup circuits perform a hash per tree-level for insertions and reads.
// All network participants need to perform tree insertions.
// Not _all_ network participants need to perform membership checks, so they're cheaper.
pub global L2_GAS_PER_READ_MERKLE_HASH: u32 = 30;
pub global L2_GAS_PER_WRITE_MERKLE_HASH: u32 = 40;

// Gas for tree insertions and associated storage
pub global L2_GAS_PER_PUBLIC_DATA_UPDATE: u32 =
    L2_GAS_DISTRIBUTED_STORAGE_PREMIUM + (PUBLIC_DATA_TREE_HEIGHT * L2_GAS_PER_WRITE_MERKLE_HASH);
pub global L2_GAS_PER_NOTE_HASH: u32 =
    L2_GAS_DISTRIBUTED_STORAGE_PREMIUM + (NOTE_HASH_TREE_HEIGHT * L2_GAS_PER_WRITE_MERKLE_HASH);
// 2x because insertion into indexed tree requires a low-leaf membership check and a standard insertion
pub global L2_GAS_PER_NULLIFIER: u32 =
    L2_GAS_DISTRIBUTED_STORAGE_PREMIUM + (2 * NULLIFIER_TREE_HEIGHT * L2_GAS_PER_WRITE_MERKLE_HASH);

// Gas for tree read requests
pub global L2_GAS_PER_PUBLIC_DATA_READ: u32 = PUBLIC_DATA_TREE_HEIGHT * L2_GAS_PER_READ_MERKLE_HASH;
pub global L2_GAS_PER_NOTE_HASH_READ_REQUEST: u32 =
    NOTE_HASH_TREE_HEIGHT * L2_GAS_PER_READ_MERKLE_HASH;
// 2x because non-membership checks are really 2 membership checks
pub global L2_GAS_PER_NULLIFIER_READ_REQUEST: u32 =
    2 * NULLIFIER_TREE_HEIGHT * L2_GAS_PER_READ_MERKLE_HASH;
pub global L2_GAS_PER_L1_TO_L2_MSG_READ_REQUEST: u32 =
    L1_TO_L2_MSG_TREE_HEIGHT * L2_GAS_PER_READ_MERKLE_HASH;

// Gas for hashing and validating logs
pub global L2_GAS_PER_LOG_BYTE: u32 = 4;
// Zero gas because we don't have to hash and validate the private logs
pub global L2_GAS_PER_PRIVATE_LOG: u32 = 0;

// Gas for writing message to L1 portal
pub global L2_GAS_PER_L2_TO_L1_MSG: u32 = 200;

// CANONICAL CONTRACT ADDRESSES
pub global MAX_PROTOCOL_CONTRACTS: u32 = (1 << PROTOCOL_CONTRACT_TREE_HEIGHT as u8) - 1; // Index 0 can't be used.
pub global CANONICAL_AUTH_REGISTRY_ADDRESS: AztecAddress = AztecAddress::from_field(1);
pub global DEPLOYER_CONTRACT_ADDRESS: AztecAddress = AztecAddress::from_field(2);
pub global REGISTERER_CONTRACT_ADDRESS: AztecAddress = AztecAddress::from_field(3);
pub global MULTI_CALL_ENTRYPOINT_ADDRESS: AztecAddress = AztecAddress::from_field(4);
pub global FEE_JUICE_ADDRESS: AztecAddress = AztecAddress::from_field(5);
pub global ROUTER_ADDRESS: AztecAddress = AztecAddress::from_field(6);

// CANONICAL DEFAULT KEYS
// This below are:
// "az_null_npk"
// "az_null_ivpk"
// "az_null_ovpk"
// "az_null_tpk"
// as bytes, hashed to curve using grumpkin::g1::affine_element::hash_to_curve(<X>, 0);
pub global DEFAULT_NPK_M_X: Field =
    0x01498945581e0eb9f8427ad6021184c700ef091d570892c437d12c7d90364bbd;
pub global DEFAULT_NPK_M_Y: Field =
    0x170ae506787c5c43d6ca9255d571c10fa9ffa9d141666e290c347c5c9ab7e344;
pub global DEFAULT_IVPK_M_X: Field =
    0x00c044b05b6ca83b9c2dbae79cc1135155956a64e136819136e9947fe5e5866c;
pub global DEFAULT_IVPK_M_Y: Field =
    0x1c1f0ca244c7cd46b682552bff8ae77dea40b966a71de076ec3b7678f2bdb151;
pub global DEFAULT_OVPK_M_X: Field =
    0x1b00316144359e9a3ec8e49c1cdb7eeb0cedd190dfd9dc90eea5115aa779e287;
pub global DEFAULT_OVPK_M_Y: Field =
    0x080ffc74d7a8b0bccb88ac11f45874172f3847eb8b92654aaa58a3d2b8dc7833;
pub global DEFAULT_TPK_M_X: Field =
    0x019c111f36ad3fc1d9b7a7a14344314d2864b94f030594cd67f753ef774a1efb;
pub global DEFAULT_TPK_M_Y: Field =
    0x2039907fe37f08d10739255141bb066c506a12f7d1e8dfec21abc58494705b6f;

// LENGTH OF STRUCTS SERIALIZED TO FIELDS
pub global AZTEC_ADDRESS_LENGTH: u32 = 1;
pub global GAS_FEES_LENGTH: u32 = 2;
pub global GAS_LENGTH: u32 = 2;
pub global GAS_SETTINGS_LENGTH: u32 = GAS_LENGTH * 2 + GAS_FEES_LENGTH;
pub global CALL_CONTEXT_LENGTH: u32 = 4;
pub global CONTENT_COMMITMENT_LENGTH: u32 = 4;
pub global CONTRACT_INSTANCE_LENGTH: u32 = 16;
pub global CONTRACT_STORAGE_READ_LENGTH: u32 = 3;
pub global CONTRACT_STORAGE_UPDATE_REQUEST_LENGTH: u32 = 3;
pub global ETH_ADDRESS_LENGTH: u32 = 1;
pub global FUNCTION_DATA_LENGTH: u32 = 2;
pub global FUNCTION_LEAF_PREIMAGE_LENGTH: u32 = 5;
pub global GLOBAL_VARIABLES_LENGTH: u32 = 7 + GAS_FEES_LENGTH;
pub global APPEND_ONLY_TREE_SNAPSHOT_LENGTH: u32 = 2;
pub global L1_TO_L2_MESSAGE_LENGTH: u32 = 6;
pub global L2_TO_L1_MESSAGE_LENGTH: u32 = 3;
pub global SCOPED_L2_TO_L1_MESSAGE_LENGTH: u32 = L2_TO_L1_MESSAGE_LENGTH + 1;
pub global MAX_BLOCK_NUMBER_LENGTH: u32 = 2; // 1 for the option flag, 1 for the value
pub global KEY_VALIDATION_REQUEST_LENGTH: u32 = 4;
pub global KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH: u32 = KEY_VALIDATION_REQUEST_LENGTH + 1;
pub global SCOPED_KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH: u32 =
    KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH + 1;
pub global PARTIAL_STATE_REFERENCE_LENGTH: u32 = 6;
pub global READ_REQUEST_LENGTH: u32 = 2;
pub global TREE_LEAF_READ_REQUEST_LENGTH: u32 = 2;
pub global PRIVATE_LOG_DATA_LENGTH: u32 = PRIVATE_LOG_SIZE_IN_FIELDS
    + 1 /* note_hash_counter */
    + 1 /* counter */;
pub global SCOPED_PRIVATE_LOG_DATA_LENGTH: u32 = PRIVATE_LOG_DATA_LENGTH + 1;
pub global LOG_HASH_LENGTH: u32 = 3;
pub global SCOPED_LOG_HASH_LENGTH: u32 = LOG_HASH_LENGTH + 1;
pub global NOTE_HASH_LENGTH: u32 = 2;
pub global SCOPED_NOTE_HASH_LENGTH: u32 = NOTE_HASH_LENGTH + 1;
pub global NULLIFIER_LENGTH: u32 = 3;
pub global SCOPED_NULLIFIER_LENGTH: u32 = NULLIFIER_LENGTH + 1;
pub global PUBLIC_DATA_WRITE_LENGTH: u32 = 2;
pub global PUBLIC_CALL_STACK_ITEM_COMPRESSED_LENGTH: u32 =
    AZTEC_ADDRESS_LENGTH + CALL_CONTEXT_LENGTH + 3 + 2 * GAS_LENGTH;
pub global PRIVATE_CALL_REQUEST_LENGTH: u32 = CALL_CONTEXT_LENGTH + 4;
pub global PUBLIC_CALL_REQUEST_LENGTH: u32 = AZTEC_ADDRESS_LENGTH /* msg_sender */
    + AZTEC_ADDRESS_LENGTH /* contract_address */
    + 1 /* function_selector */
    + 1 /* is_static_call */
    + 1 /* args_hash */;
pub global COUNTED_PUBLIC_CALL_REQUEST_LENGTH: u32 = PUBLIC_CALL_REQUEST_LENGTH + 1;
pub global PUBLIC_INNER_CALL_REQUEST_LENGTH: u32 =
    PUBLIC_CALL_STACK_ITEM_COMPRESSED_LENGTH + 1 /* counter */;
pub global ROLLUP_VALIDATION_REQUESTS_LENGTH: u32 = MAX_BLOCK_NUMBER_LENGTH;
pub global STATE_REFERENCE_LENGTH: u32 =
    APPEND_ONLY_TREE_SNAPSHOT_LENGTH + PARTIAL_STATE_REFERENCE_LENGTH;
pub global TREE_SNAPSHOTS_LENGTH: u32 = APPEND_ONLY_TREE_SNAPSHOT_LENGTH * 4;
pub global TX_CONTEXT_LENGTH: u32 = 2 + GAS_SETTINGS_LENGTH;
pub global TX_REQUEST_LENGTH: u32 = 2 + TX_CONTEXT_LENGTH + FUNCTION_DATA_LENGTH;
pub global TOTAL_FEES_LENGTH: u32 = 1;
pub global TOTAL_MANA_USED_LENGTH: u32 = 1;
pub global BLOCK_HEADER_LENGTH: u32 = APPEND_ONLY_TREE_SNAPSHOT_LENGTH
    + CONTENT_COMMITMENT_LENGTH
    + STATE_REFERENCE_LENGTH
    + GLOBAL_VARIABLES_LENGTH
    + TOTAL_FEES_LENGTH
    + TOTAL_MANA_USED_LENGTH;
pub global PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH: u32 = CALL_CONTEXT_LENGTH
    + 4
    + MAX_BLOCK_NUMBER_LENGTH
    + (READ_REQUEST_LENGTH * MAX_NOTE_HASH_READ_REQUESTS_PER_CALL)
    + (READ_REQUEST_LENGTH * MAX_NULLIFIER_READ_REQUESTS_PER_CALL)
    + (KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH * MAX_KEY_VALIDATION_REQUESTS_PER_CALL)
    + (NOTE_HASH_LENGTH * MAX_NOTE_HASHES_PER_CALL)
    + (NULLIFIER_LENGTH * MAX_NULLIFIERS_PER_CALL)
    + (PRIVATE_CALL_REQUEST_LENGTH * MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL)
    + (COUNTED_PUBLIC_CALL_REQUEST_LENGTH * MAX_ENQUEUED_CALLS_PER_CALL)
    + PUBLIC_CALL_REQUEST_LENGTH
    + (L2_TO_L1_MESSAGE_LENGTH * MAX_L2_TO_L1_MSGS_PER_CALL)
    + 2
    + (PRIVATE_LOG_DATA_LENGTH * MAX_PRIVATE_LOGS_PER_CALL)
    + (LOG_HASH_LENGTH * MAX_CONTRACT_CLASS_LOGS_PER_CALL)
    + BLOCK_HEADER_LENGTH
    + TX_CONTEXT_LENGTH;
pub global PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH: u32 = CALL_CONTEXT_LENGTH
    + /*argsHash + returnsHash*/ 2
    + (TREE_LEAF_READ_REQUEST_LENGTH * MAX_NOTE_HASH_READ_REQUESTS_PER_CALL)
    + (READ_REQUEST_LENGTH * MAX_NULLIFIER_READ_REQUESTS_PER_CALL)
    + (READ_REQUEST_LENGTH * MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_CALL)
    + (TREE_LEAF_READ_REQUEST_LENGTH * MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_CALL)
    + (CONTRACT_STORAGE_UPDATE_REQUEST_LENGTH * MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL)
    + (CONTRACT_STORAGE_READ_LENGTH * MAX_PUBLIC_DATA_READS_PER_CALL)
    + (PUBLIC_INNER_CALL_REQUEST_LENGTH * MAX_ENQUEUED_CALLS_PER_CALL)
    + (NOTE_HASH_LENGTH * MAX_NOTE_HASHES_PER_CALL)
    + (NULLIFIER_LENGTH * MAX_NULLIFIERS_PER_CALL)
    + (L2_TO_L1_MESSAGE_LENGTH * MAX_L2_TO_L1_MSGS_PER_CALL)
    + 2
    + (LOG_HASH_LENGTH * MAX_UNENCRYPTED_LOGS_PER_CALL)
    + BLOCK_HEADER_LENGTH
    + GLOBAL_VARIABLES_LENGTH
    + AZTEC_ADDRESS_LENGTH
    + /* revert_code */ 1
    + 2 * GAS_LENGTH
    + /* transaction_fee */ 1;
pub global PRIVATE_CONTEXT_INPUTS_LENGTH: u32 =
    CALL_CONTEXT_LENGTH + BLOCK_HEADER_LENGTH + TX_CONTEXT_LENGTH + 1;
pub global FEE_RECIPIENT_LENGTH: u32 = 2;

pub global AGGREGATION_OBJECT_LENGTH: u32 = 16;
pub global IPA_CLAIM_LENGTH: u32 = 10;

pub global SCOPED_READ_REQUEST_LEN: u32 = READ_REQUEST_LENGTH + 1;
pub global PUBLIC_DATA_READ_LENGTH: u32 = 3;
pub global PRIVATE_VALIDATION_REQUESTS_LENGTH: u32 = ROLLUP_VALIDATION_REQUESTS_LENGTH
    + (SCOPED_READ_REQUEST_LEN * MAX_NOTE_HASH_READ_REQUESTS_PER_TX)
    + (SCOPED_READ_REQUEST_LEN * MAX_NULLIFIER_READ_REQUESTS_PER_TX)
    + (SCOPED_KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH * MAX_KEY_VALIDATION_REQUESTS_PER_TX)
    + 2;

pub global COMBINED_ACCUMULATED_DATA_LENGTH: u32 = MAX_NOTE_HASHES_PER_TX
    + MAX_NULLIFIERS_PER_TX
    + (MAX_L2_TO_L1_MSGS_PER_TX * SCOPED_L2_TO_L1_MESSAGE_LENGTH)
    + (PRIVATE_LOG_SIZE_IN_FIELDS * MAX_PRIVATE_LOGS_PER_TX)
    + (SCOPED_LOG_HASH_LENGTH * MAX_UNENCRYPTED_LOGS_PER_TX)
    + 1 /* unencrypted_log_preimages_length */
    + (SCOPED_LOG_HASH_LENGTH * MAX_CONTRACT_CLASS_LOGS_PER_TX)
    + 1 /* contract_class_log_preimages_length */
    + (MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX * PUBLIC_DATA_WRITE_LENGTH);
pub global TX_CONSTANT_DATA_LENGTH: u32 = BLOCK_HEADER_LENGTH
    + TX_CONTEXT_LENGTH
    + 1 /* vk_tree_root */
    + 1 /* protocol_contract_tree_root */;
pub global COMBINED_CONSTANT_DATA_LENGTH: u32 = TX_CONSTANT_DATA_LENGTH + GLOBAL_VARIABLES_LENGTH;

pub global PRIVATE_ACCUMULATED_DATA_LENGTH: u32 = (SCOPED_NOTE_HASH_LENGTH * MAX_NOTE_HASHES_PER_TX)
    + (SCOPED_NULLIFIER_LENGTH * MAX_NULLIFIERS_PER_TX)
    + (MAX_L2_TO_L1_MSGS_PER_TX * SCOPED_L2_TO_L1_MESSAGE_LENGTH)
    + (SCOPED_PRIVATE_LOG_DATA_LENGTH * MAX_PRIVATE_LOGS_PER_TX)
    + (SCOPED_LOG_HASH_LENGTH * MAX_CONTRACT_CLASS_LOGS_PER_TX)
    + (PRIVATE_CALL_REQUEST_LENGTH * MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX)
    + (COUNTED_PUBLIC_CALL_REQUEST_LENGTH * MAX_ENQUEUED_CALLS_PER_TX);
pub global PRIVATE_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH: u32 = TX_CONSTANT_DATA_LENGTH
    + 1 /* min_revertible_side_effect_counter */
    + PRIVATE_VALIDATION_REQUESTS_LENGTH
    + PRIVATE_ACCUMULATED_DATA_LENGTH
    + PUBLIC_CALL_REQUEST_LENGTH
    + AZTEC_ADDRESS_LENGTH;

pub global PRIVATE_TO_PUBLIC_ACCUMULATED_DATA_LENGTH: u32 = MAX_NOTE_HASHES_PER_TX
    + MAX_NULLIFIERS_PER_TX
    + (MAX_L2_TO_L1_MSGS_PER_TX * SCOPED_L2_TO_L1_MESSAGE_LENGTH)
    + (MAX_PRIVATE_LOGS_PER_TX * PRIVATE_LOG_SIZE_IN_FIELDS)
    + (MAX_CONTRACT_CLASS_LOGS_PER_TX * SCOPED_LOG_HASH_LENGTH)
    + (MAX_ENQUEUED_CALLS_PER_TX * PUBLIC_CALL_REQUEST_LENGTH);

pub global PRIVATE_TO_AVM_ACCUMULATED_DATA_LENGTH: u32 = MAX_NOTE_HASHES_PER_TX
    + MAX_NULLIFIERS_PER_TX
    + (MAX_L2_TO_L1_MSGS_PER_TX * SCOPED_L2_TO_L1_MESSAGE_LENGTH);
pub global NUM_PRIVATE_TO_AVM_ACCUMULATED_DATA_ARRAYS: u32 = 3;

pub global AVM_ACCUMULATED_DATA_LENGTH: u32 = MAX_NOTE_HASHES_PER_TX
    + MAX_NULLIFIERS_PER_TX
    + (MAX_L2_TO_L1_MSGS_PER_TX * SCOPED_L2_TO_L1_MESSAGE_LENGTH)
    + (MAX_UNENCRYPTED_LOGS_PER_TX * SCOPED_LOG_HASH_LENGTH)
    + (MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX * PUBLIC_DATA_WRITE_LENGTH);

pub global PRIVATE_TO_PUBLIC_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH: u32 = TX_CONSTANT_DATA_LENGTH
    + ROLLUP_VALIDATION_REQUESTS_LENGTH
    + PRIVATE_TO_PUBLIC_ACCUMULATED_DATA_LENGTH /* non_revertible_accumulated_data */
    + PRIVATE_TO_PUBLIC_ACCUMULATED_DATA_LENGTH /* revertible_accumulated_data */
    + PUBLIC_CALL_REQUEST_LENGTH /* public_teardown_call_request */
    + GAS_LENGTH /* gas_used */
    + AZTEC_ADDRESS_LENGTH /* fee_payer */;

pub global KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH: u32 = ROLLUP_VALIDATION_REQUESTS_LENGTH
    + COMBINED_ACCUMULATED_DATA_LENGTH
    + COMBINED_CONSTANT_DATA_LENGTH
    + PARTIAL_STATE_REFERENCE_LENGTH
    + 1 /* revert_code */
    + GAS_LENGTH /* gas_used */
    + AZTEC_ADDRESS_LENGTH;

pub global AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH: u32 = GLOBAL_VARIABLES_LENGTH
    + TREE_SNAPSHOTS_LENGTH /* start_tree_snapshots */
    + GAS_LENGTH /* start_gas_used */
    + GAS_SETTINGS_LENGTH
    + (MAX_ENQUEUED_CALLS_PER_TX * PUBLIC_CALL_REQUEST_LENGTH) /* public_setup_call_requests */
    + (MAX_ENQUEUED_CALLS_PER_TX * PUBLIC_CALL_REQUEST_LENGTH) /* public_app_logic_call_requests */
    + PUBLIC_CALL_REQUEST_LENGTH /* public_teardown_call_request */
    + NUM_PRIVATE_TO_AVM_ACCUMULATED_DATA_ARRAYS /* previous_non_revertible_accumulated_data_array_lengths */
    + NUM_PRIVATE_TO_AVM_ACCUMULATED_DATA_ARRAYS /* previous_revertible_accumulated_data_array_lengths */
    + PRIVATE_TO_AVM_ACCUMULATED_DATA_LENGTH /* previous_non_revertible_accumulated_data */
    + PRIVATE_TO_AVM_ACCUMULATED_DATA_LENGTH /* previous_revertible_accumulated_data */
    + TREE_SNAPSHOTS_LENGTH /* end_tree_snapshots */
    + GAS_LENGTH /* end_gas_used */
    + AVM_ACCUMULATED_DATA_LENGTH
    + 1 /* transaction_fee */
    + 1 /* reverted */;

pub global CONSTANT_ROLLUP_DATA_LENGTH: u32 = APPEND_ONLY_TREE_SNAPSHOT_LENGTH
    + 1 /* vk_tree_root */
    + 1 /* protocol_contract_tree_root */
    + GLOBAL_VARIABLES_LENGTH;

// + 5 for rollup_type, height_in_block_tree, txs_effects_hash, out_hash, accumulated_fees, accumulated_mana_used
pub global BASE_OR_MERGE_PUBLIC_INPUTS_LENGTH: u32 = CONSTANT_ROLLUP_DATA_LENGTH
    + PARTIAL_STATE_REFERENCE_LENGTH
    + PARTIAL_STATE_REFERENCE_LENGTH
    + 6;
pub global BLOCK_ROOT_OR_BLOCK_MERGE_PUBLIC_INPUTS_LENGTH: u32 = 2
    * APPEND_ONLY_TREE_SNAPSHOT_LENGTH
    + 1 /* previous_block_hash */
    + 1 /* end_block_hash */
    + 2 * GLOBAL_VARIABLES_LENGTH
    + 1 /* out_hash */
    + AZTEC_MAX_EPOCH_DURATION * FEE_RECIPIENT_LENGTH
    + 1 /* vk_tree_root */
    + 1 /* protocol_contract_tree_root */
    + 1 /* prover_id */;
pub global ROOT_ROLLUP_PUBLIC_INPUTS_LENGTH: u32 =
    2 * APPEND_ONLY_TREE_SNAPSHOT_LENGTH + 8 + AZTEC_MAX_EPOCH_DURATION * FEE_RECIPIENT_LENGTH;

pub global GET_NOTES_ORACLE_RETURN_LENGTH: u32 = 674;
pub global NOTE_HASHES_NUM_BYTES_PER_BASE_ROLLUP: u32 = 32 * MAX_NOTE_HASHES_PER_TX;
pub global NULLIFIERS_NUM_BYTES_PER_BASE_ROLLUP: u32 = 32 * MAX_NULLIFIERS_PER_TX;
pub global PUBLIC_DATA_WRITES_NUM_BYTES_PER_BASE_ROLLUP: u32 =
    64 * MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX; // 1 write is 64 bytes
pub global PRIVATE_LOGS_NUM_BYTES_PER_BASE_ROLLUP: u32 =
    32 * PRIVATE_LOG_SIZE_IN_FIELDS * MAX_PRIVATE_LOGS_PER_TX;
pub global CONTRACTS_NUM_BYTES_PER_BASE_ROLLUP: Field = 32;
pub global CONTRACT_DATA_NUM_BYTES_PER_BASE_ROLLUP: Field = 64;
pub global CONTRACT_DATA_NUM_BYTES_PER_BASE_ROLLUP_UNPADDED: Field = 52;
pub global L2_TO_L1_MSGS_NUM_BYTES_PER_BASE_ROLLUP: Field = 256;
pub global LOGS_HASHES_NUM_BYTES_PER_BASE_ROLLUP: Field = 64;
pub global NUM_MSGS_PER_BASE_PARITY: u32 = 4;
// pub global NUM_BASE_PARITY_PER_ROOT_PARITY: u32 = NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP / NUM_MSGS_PER_BASE_PARITY;
// FIX: Sadly, writing this as above causes a type error in type_conversion.ts.
pub global NUM_BASE_PARITY_PER_ROOT_PARITY: u32 = 4;

// Lengths of the different types of proofs in fields
pub global IPA_PROOF_LENGTH: u32 = 65;
pub global RECURSIVE_PROOF_LENGTH: u32 = 463 + IPA_CLAIM_LENGTH + IPA_PROOF_LENGTH;
pub global NESTED_RECURSIVE_PROOF_LENGTH: u32 = RECURSIVE_PROOF_LENGTH;
pub global TUBE_PROOF_LENGTH: u32 = RECURSIVE_PROOF_LENGTH; // in the future these can differ

pub global HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS: u32 = 128; // size of an Ultra verification key
pub global ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS: u32 =
    HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS + 1 + IPA_CLAIM_LENGTH; // size of an UltraRollup verification key

pub global CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS: u32 = 143; // size of a Mega verification key
// VK is composed of
// - circuit size encoded as a fr field element (32 bytes)
// - num of inputs encoded as a fr field element (32 bytes)
// - 21 affine elements (curve base field fq) encoded as fr elements takes (21 * 4 * 32 bytes)
// 21 above refers to the constant AvmFlavor::NUM_PRECOMPUTED_ENTITIES
pub global AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS: u32 = 2 + 21 * 4;

// `AVM_PROOF_LENGTH_IN_FIELDS` must be updated when AVM circuit changes.
// To determine latest value, hover `COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS`
// in barretenberg/cpp/src/barretenberg/vm/avm/generated/flavor.hpp
pub global AVM_PROOF_LENGTH_IN_FIELDS: u32 = 4155;
pub global AVM_PUBLIC_COLUMN_MAX_SIZE: u32 = 1024;
pub global AVM_PUBLIC_INPUTS_FLATTENED_SIZE: u32 =
    2 * AVM_PUBLIC_COLUMN_MAX_SIZE + PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH;
/**
 * Enumerate the hash_indices which are used for pedersen hashing.
 * We start from 1 to avoid the default generators. The generator indices are listed
 * based on the number of elements each index hashes. The following conditions must be met:
 *
 * +-----------+-------------------------------+----------------------+
 * | Hash size | Number of elements hashed (n) | Condition to use     |
 * |-----------+-------------------------------+----------------------|
 * | LOW       | n <= 8                         | 0 < hash_index <= 32  |
 * | MID       | 8 < n <= 16                    | 32 < hash_index <= 40 |
 * | HIGH      | 16 < n <= 48                   | 40 < hash_index <= 48 |
 * +-----------+-------------------------------+----------------------+
 */
// Indices with size <= 8
pub global GENERATOR_INDEX__NOTE_HASH: u32 = 1;
pub global GENERATOR_INDEX__NOTE_HASH_NONCE: u32 = 2;
pub global GENERATOR_INDEX__UNIQUE_NOTE_HASH: u32 = 3;
pub global GENERATOR_INDEX__SILOED_NOTE_HASH: u32 = 4;
pub global GENERATOR_INDEX__MESSAGE_NULLIFIER: u32 = 5;
pub global GENERATOR_INDEX__INITIALIZATION_NULLIFIER: u32 = 6;
pub global GENERATOR_INDEX__OUTER_NULLIFIER: u32 = 7;
pub global GENERATOR_INDEX__PUBLIC_DATA_READ: u32 = 8;
pub global GENERATOR_INDEX__PUBLIC_DATA_UPDATE_REQUEST: u32 = 9;
pub global GENERATOR_INDEX__FUNCTION_DATA: u32 = 10;
pub global GENERATOR_INDEX__FUNCTION_LEAF: u32 = 11;
pub global GENERATOR_INDEX__CONTRACT_DEPLOYMENT_DATA: u32 = 12;
pub global GENERATOR_INDEX__CONSTRUCTOR: u32 = 13;
pub global GENERATOR_INDEX__CONSTRUCTOR_ARGS: u32 = 14;
pub global GENERATOR_INDEX__CONTRACT_ADDRESS_V1: u32 = 15;
pub global GENERATOR_INDEX__CONTRACT_LEAF: u32 = 16;
pub global GENERATOR_INDEX__CALL_CONTEXT: u32 = 17;
pub global GENERATOR_INDEX__CALL_STACK_ITEM: u32 = 18;
pub global GENERATOR_INDEX__CALL_STACK_ITEM_2: u32 = 19;
pub global GENERATOR_INDEX__SECRET_HASH: u32 = 20;
pub global GENERATOR_INDEX__L2_TO_L1_MSG: u32 = 21;
pub global GENERATOR_INDEX__TX_CONTEXT: u32 = 22;
pub global GENERATOR_INDEX__PUBLIC_LEAF_INDEX: u32 = 23;
pub global GENERATOR_INDEX__PUBLIC_DATA_LEAF: u32 = 24;
pub global GENERATOR_INDEX__SIGNED_TX_REQUEST: u32 = 25;
pub global GENERATOR_INDEX__GLOBAL_VARIABLES: u32 = 26;
pub global GENERATOR_INDEX__PARTIAL_ADDRESS: u32 = 27;
pub global GENERATOR_INDEX__BLOCK_HASH: u32 = 28;
pub global GENERATOR_INDEX__SIDE_EFFECT: u32 = 29;
pub global GENERATOR_INDEX__FEE_PAYLOAD: u32 = 30;
pub global GENERATOR_INDEX__COMBINED_PAYLOAD: u32 = 31;
pub global GENERATOR_INDEX__TX_NULLIFIER: u32 = 32;
// Indices with size <= 16
pub global GENERATOR_INDEX__TX_REQUEST: u32 = 33;
pub global GENERATOR_INDEX__SIGNATURE_PAYLOAD: u32 = 34;
// Indices with size <= 44
pub global GENERATOR_INDEX__VK: u32 = 41;
pub global GENERATOR_INDEX__PRIVATE_CIRCUIT_PUBLIC_INPUTS: u32 = 42;
pub global GENERATOR_INDEX__PUBLIC_CIRCUIT_PUBLIC_INPUTS: u32 = 43;
// TODO: Function args generator index is being used to hash 64 items
pub global GENERATOR_INDEX__FUNCTION_ARGS: u32 = 44;
pub global GENERATOR_INDEX__AUTHWIT_INNER: u32 = 45;
pub global GENERATOR_INDEX__AUTHWIT_OUTER: u32 = 46;
pub global GENERATOR_INDEX__AUTHWIT_NULLIFIER: u32 = 47;
// Key related generators follow
pub global GENERATOR_INDEX__NSK_M: u32 = 48;
pub global GENERATOR_INDEX__IVSK_M: u32 = 49;
pub global GENERATOR_INDEX__OVSK_M: u32 = 50;
pub global GENERATOR_INDEX__TSK_M: u32 = 51;
pub global GENERATOR_INDEX__PUBLIC_KEYS_HASH: u32 = 52;
pub global GENERATOR_INDEX__NOTE_NULLIFIER: u32 = 53;
pub global GENERATOR_INDEX__NOTE_HIDING_POINT: u32 = 54;
pub global GENERATOR_INDEX__SYMMETRIC_KEY: u8 = 55;

// AVM memory tags
pub global MEM_TAG_FF: Field = 0;
pub global MEM_TAG_U1: Field = 1;
pub global MEM_TAG_U8: Field = 2;
pub global MEM_TAG_U16: Field = 3;
pub global MEM_TAG_U32: Field = 4;
pub global MEM_TAG_U64: Field = 5;
pub global MEM_TAG_U128: Field = 6;

// AVM CIRCUIT - PUBLIC KERNEL INPUTS COLUMN OFFSETS
// Keep the number of offsets aligned with KERNEL_INPUTS_LENGTH defined in constants.hpp
pub global SENDER_KERNEL_INPUTS_COL_OFFSET: u32 = 0;
pub global ADDRESS_KERNEL_INPUTS_COL_OFFSET: u32 = 1;
pub global IS_STATIC_CALL_KERNEL_INPUTS_COL_OFFSET: u32 = 3;
// pub global Variables
pub global CHAIN_ID_KERNEL_INPUTS_COL_OFFSET: u32 = 4;
pub global VERSION_KERNEL_INPUTS_COL_OFFSET: u32 = 5;
pub global BLOCK_NUMBER_KERNEL_INPUTS_COL_OFFSET: u32 = 6;
pub global TIMESTAMP_KERNEL_INPUTS_COL_OFFSET: u32 = 7;
// pub global Variables - fees
pub global FEE_PER_DA_GAS_KERNEL_INPUTS_COL_OFFSET: u32 = 8;
pub global FEE_PER_L2_GAS_KERNEL_INPUTS_COL_OFFSET: u32 = 9;
// Gas - start and end values
pub global DA_START_GAS_KERNEL_INPUTS_COL_OFFSET: Field = 10;
pub global L2_START_GAS_KERNEL_INPUTS_COL_OFFSET: Field = 11;
pub global DA_END_GAS_KERNEL_INPUTS_COL_OFFSET: Field = 12;
pub global L2_END_GAS_KERNEL_INPUTS_COL_OFFSET: Field = 13;
// Top-level members
pub global TRANSACTION_FEE_KERNEL_INPUTS_COL_OFFSET: u32 = 14;

// AVM CIRCUIT - PUBLIC KERNEL OUTPUTS COLUMN OFFSETS
// Side effects
pub global START_NOTE_HASH_EXISTS_WRITE_OFFSET: u32 = 0;
pub global START_NULLIFIER_EXISTS_OFFSET: u32 =
    START_NOTE_HASH_EXISTS_WRITE_OFFSET + MAX_NOTE_HASH_READ_REQUESTS_PER_CALL;
pub global START_NULLIFIER_NON_EXISTS_OFFSET: u32 =
    START_NULLIFIER_EXISTS_OFFSET + MAX_NULLIFIER_READ_REQUESTS_PER_CALL;
pub global START_L1_TO_L2_MSG_EXISTS_WRITE_OFFSET: u32 =
    START_NULLIFIER_NON_EXISTS_OFFSET + MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_CALL;
pub global START_SSTORE_WRITE_OFFSET: u32 =
    START_L1_TO_L2_MSG_EXISTS_WRITE_OFFSET + MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_CALL;
pub global START_SLOAD_WRITE_OFFSET: u32 =
    START_SSTORE_WRITE_OFFSET + MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL;
pub global START_EMIT_NOTE_HASH_WRITE_OFFSET: u32 =
    START_SLOAD_WRITE_OFFSET + MAX_PUBLIC_DATA_READS_PER_CALL;
pub global START_EMIT_NULLIFIER_WRITE_OFFSET: u32 =
    START_EMIT_NOTE_HASH_WRITE_OFFSET + MAX_NOTE_HASHES_PER_CALL;
pub global START_EMIT_L2_TO_L1_MSG_WRITE_OFFSET: u32 =
    START_EMIT_NULLIFIER_WRITE_OFFSET + MAX_NULLIFIERS_PER_CALL;
pub global START_EMIT_UNENCRYPTED_LOG_WRITE_OFFSET: u32 =
    START_EMIT_L2_TO_L1_MSG_WRITE_OFFSET + MAX_L2_TO_L1_MSGS_PER_CALL;

/**
 * GAS COSTS FOR AVM OPCODES
 * They are used in TS and C++
 */
// Base L2 GAS
// Note: magic numbers here are derived from each op's AVM circuit trace area
pub global AVM_ADD_BASE_L2_GAS: u32 = 32;
pub global AVM_SUB_BASE_L2_GAS: u32 = 32;
pub global AVM_MUL_BASE_L2_GAS: u32 = 33;
pub global AVM_DIV_BASE_L2_GAS: u32 = 43;
pub global AVM_FDIV_BASE_L2_GAS: u32 = 32;
pub global AVM_EQ_BASE_L2_GAS: u32 = 32;
pub global AVM_LT_BASE_L2_GAS: u32 = 64;
pub global AVM_LTE_BASE_L2_GAS: u32 = 64;
pub global AVM_AND_BASE_L2_GAS: u32 = 33;
pub global AVM_OR_BASE_L2_GAS: u32 = 33;
pub global AVM_XOR_BASE_L2_GAS: u32 = 33;
pub global AVM_NOT_BASE_L2_GAS: u32 = 27;
pub global AVM_SHL_BASE_L2_GAS: u32 = 32;
pub global AVM_SHR_BASE_L2_GAS: u32 = 32;
pub global AVM_CAST_BASE_L2_GAS: u32 = 30;
pub global AVM_GETENVVAR_BASE_L2_GAS: u16 = 20;
pub global AVM_CALLDATACOPY_BASE_L2_GAS: u32 = 29;
pub global AVM_RETURNDATASIZE_BASE_L2_GAS: u32 = 20;
pub global AVM_RETURNDATACOPY_BASE_L2_GAS: u32 = 29;
pub global AVM_JUMP_BASE_L2_GAS: u32 = 12;
pub global AVM_JUMPI_BASE_L2_GAS: u32 = 18;
pub global AVM_INTERNALCALL_BASE_L2_GAS: u32 = 18;
pub global AVM_INTERNALRETURN_BASE_L2_GAS: u32 = 18;
pub global AVM_SET_BASE_L2_GAS: u32 = 18;
pub global AVM_MOV_BASE_L2_GAS: u32 = 23;
pub global AVM_SLOAD_BASE_L2_GAS: u32 = 18 + L2_GAS_PER_PUBLIC_DATA_READ;
pub global AVM_SSTORE_BASE_L2_GAS: u32 = 18 + L2_GAS_PER_PUBLIC_DATA_UPDATE;
pub global AVM_NOTEHASHEXISTS_BASE_L2_GAS: u32 = 26 + L2_GAS_PER_NOTE_HASH_READ_REQUEST;
pub global AVM_EMITNOTEHASH_BASE_L2_GAS: u32 = 26 + L2_GAS_PER_NOTE_HASH;
pub global AVM_NULLIFIEREXISTS_BASE_L2_GAS: u32 = 26 + L2_GAS_PER_NULLIFIER_READ_REQUEST;
pub global AVM_EMITNULLIFIER_BASE_L2_GAS: u32 = 26 + L2_GAS_PER_NULLIFIER;
pub global AVM_L1TOL2MSGEXISTS_BASE_L2_GAS: u32 = 26 + L2_GAS_PER_L1_TO_L2_MSG_READ_REQUEST;
pub global AVM_GETCONTRACTINSTANCE_BASE_L2_GAS: u32 = 48 + L2_GAS_PER_NULLIFIER_READ_REQUEST; // does a nullifier check
pub global AVM_EMITUNENCRYPTEDLOG_BASE_L2_GAS: u32 = 18;
pub global AVM_SENDL2TOL1MSG_BASE_L2_GAS: u32 = 26 + L2_GAS_PER_L2_TO_L1_MSG;
// On CALL, AVM performs nullifier checks for contract address & contract class ID
pub global AVM_CALL_BASE_L2_GAS: u32 = 45 + (2 * L2_GAS_PER_NULLIFIER_READ_REQUEST);
pub global AVM_STATICCALL_BASE_L2_GAS: u32 = 45 + (2 * L2_GAS_PER_NULLIFIER_READ_REQUEST);
pub global AVM_RETURN_BASE_L2_GAS: u32 = 28;
pub global AVM_REVERT_BASE_L2_GAS: u32 = 28;
pub global AVM_DEBUGLOG_BASE_L2_GAS: u32 = 12;
pub global AVM_DEBUGLOG_DYN_L2_GAS: u32 = 3;
pub global AVM_POSEIDON2_BASE_L2_GAS: u32 = 78;
pub global AVM_SHA256COMPRESSION_BASE_L2_GAS: u32 = 261;
pub global AVM_KECCAKF1600_BASE_L2_GAS: u32 = 300;
pub global AVM_ECADD_BASE_L2_GAS: u32 = 62;
pub global AVM_MSM_BASE_L2_GAS: u32 = 1000;
pub global AVM_TORADIXBE_BASE_L2_GAS: u32 = 46;

// Dynamic L2 GAS
pub global AVM_CALLDATACOPY_DYN_L2_GAS: u32 = 6;
pub global AVM_RETURNDATACOPY_DYN_L2_GAS: u32 = 6;
// a single increment here corresponds to an entire additional field (hence x32 bytes per field)
pub global AVM_EMITUNENCRYPTEDLOG_DYN_L2_GAS: u32 = 18 + (DA_BYTES_PER_FIELD * L2_GAS_PER_LOG_BYTE);
pub global AVM_CALL_DYN_L2_GAS: u32 = 4;
pub global AVM_STATICCALL_DYN_L2_GAS: u32 = 4;
pub global AVM_RETURN_DYN_L2_GAS: u32 = 6;
pub global AVM_REVERT_DYN_L2_GAS: u32 = 6;
pub global AVM_MSM_DYN_L2_GAS: u32 = 100;
pub global AVM_TORADIXBE_DYN_L2_GAS: u32 = 20;

// Base DA Gas
pub global AVM_SSTORE_BASE_DA_GAS: u32 = DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE;
pub global AVM_EMITNOTEHASH_BASE_DA_GAS: u32 = DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE;
pub global AVM_EMITNULLIFIER_BASE_DA_GAS: u32 = DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE;
pub global AVM_SENDL2TOL1MSG_BASE_DA_GAS: u32 = DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE;

// Dynamic DA Gas
// a single increment here corresponds to an entire additional field (hence x32 bytes per field)
pub global AVM_EMITUNENCRYPTEDLOG_DYN_DA_GAS: u32 = DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE;

// Constants related to proof type of a recursive proof verification.
// Keep following constants in sync with the enum acir_format::PROOF_TYPE in recursion_constraint.hpp
pub global PROOF_TYPE_PLONK: u32 = 0;
pub global PROOF_TYPE_HONK: u32 = 1;
pub global PROOF_TYPE_OINK: u32 = 2;
pub global PROOF_TYPE_PG: u32 = 3;
pub global PROOF_TYPE_AVM: u32 = 4;
pub global PROOF_TYPE_ROLLUP_HONK: u32 = 5;
pub global PROOF_TYPE_ROOT_ROLLUP_HONK: u32 = 6;
