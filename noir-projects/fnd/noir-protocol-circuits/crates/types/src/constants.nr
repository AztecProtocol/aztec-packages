use crate::{address::AztecAddress, traits::FromField};

pub global MAX_FIELD_VALUE: Field =
    21888242871839275222246405745257275088548364400416034343698204186575808495616;
pub global MAX_ETH_ADDRESS_BIT_SIZE: u32 = 160; // 20 bytes
pub global MAX_ETH_ADDRESS_VALUE: Field = 0xffffffffffffffffffffffffffffffffffffffff;
pub global MAX_U64_VALUE: u64 = 0xffffffffffffffff;
pub global MAX_U32_VALUE: u32 = 0xffffffff;

// WARNING: do not change without consulting AVM which this constant affects
pub global MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS: u32 = 16_000;

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
// TREES RELATED CONSTANTS
pub global ARCHIVE_HEIGHT: u32 = 30; // 4-second blocks for 100 years.
pub global VK_TREE_HEIGHT: u32 = 7;
pub global FUNCTION_TREE_HEIGHT: u32 = 7; // The number of private functions in a contract is therefore 128.
pub global NOTE_HASH_TREE_HEIGHT: u32 = 42; // 64 notes/tx (static because of base rollup insertion), 15tps, for 100 years.
pub global PUBLIC_DATA_TREE_HEIGHT: u32 = 40; // Average of 16 updates/tx (guess), 15tps, 100 years.
pub global NULLIFIER_TREE_HEIGHT: u32 = NOTE_HASH_TREE_HEIGHT;
pub global L1_TO_L2_MSG_TREE_HEIGHT: u32 = 36; // 1024 messages per checkpoint, with 72 seconds per checkpoint, for 100 years.
pub global OUT_HASH_TREE_HEIGHT: u32 = 5; // 32 (MAX_CHECKPOINTS_PER_EPOCH) checkpoints per epoch, each has 1 out hash.
pub global ARTIFACT_FUNCTION_TREE_MAX_HEIGHT: u32 = FUNCTION_TREE_HEIGHT; // The number of unconstrained functions in a contract. Set to equal the number of private functions in a contract.

pub global NULLIFIER_TREE_ID: Field = 0;
pub global NOTE_HASH_TREE_ID: Field = 1;
pub global PUBLIC_DATA_TREE_ID: Field = 2;
pub global L1_TO_L2_MESSAGE_TREE_ID: Field = 3;
pub global ARCHIVE_TREE_ID: Field = 4;

pub global NOTE_HASH_TREE_LEAF_COUNT: u64 = 1 << (NOTE_HASH_TREE_HEIGHT as u64);
pub global L1_TO_L2_MSG_TREE_LEAF_COUNT: u64 = 1 << (L1_TO_L2_MSG_TREE_HEIGHT as u64);
pub global OUT_HASH_TREE_LEAF_COUNT: u32 = 1 << OUT_HASH_TREE_HEIGHT;

// SUB-TREES RELATED CONSTANTS
pub global NOTE_HASH_SUBTREE_HEIGHT: u32 = 6;
pub global NULLIFIER_SUBTREE_HEIGHT: u32 = 6;
pub global PUBLIC_DATA_SUBTREE_HEIGHT: u32 = 6;
pub global L1_TO_L2_MSG_SUBTREE_HEIGHT: u32 = 10;
pub global NOTE_HASH_SUBTREE_ROOT_SIBLING_PATH_LENGTH: u32 =
    NOTE_HASH_TREE_HEIGHT - NOTE_HASH_SUBTREE_HEIGHT;
pub global NULLIFIER_SUBTREE_ROOT_SIBLING_PATH_LENGTH: u32 =
    NULLIFIER_TREE_HEIGHT - NULLIFIER_SUBTREE_HEIGHT;
pub global L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH: u32 =
    L1_TO_L2_MSG_TREE_HEIGHT - L1_TO_L2_MSG_SUBTREE_HEIGHT;
// Cap on L1-to-L2 messages bundled into a single L2 block. Transitional value equal to the per-checkpoint cap: the
// constant is deliberately oversized so the first block's bundle can carry a whole checkpoint's padded messages during
// the transition, and drops to 256 at the flip.
pub global MAX_L1_TO_L2_MSGS_PER_BLOCK: u32 = 1024;
// Cap on L1-to-L2 messages consumed by a single checkpoint. Semantically today's NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP.
pub global MAX_L1_TO_L2_MSGS_PER_CHECKPOINT: u32 = 1024;
// Maximum number of subtrees a L2ToL1Msg unbalanced tree can have. Used when calculating the out hash of a tx.
pub global MAX_L2_TO_L1_MSG_SUBTREES_PER_TX: u32 = 3; // ceil(log2(MAX_L2_TO_L1_MSGS_PER_TX))

// "PER TRANSACTION" CONSTANTS
pub global MAX_NOTE_HASHES_PER_TX: u32 = 1 << NOTE_HASH_SUBTREE_HEIGHT;
pub global MAX_NULLIFIERS_PER_TX: u32 = 1 << NULLIFIER_SUBTREE_HEIGHT;
pub global MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX: u32 = 16;
pub global MAX_ENQUEUED_CALLS_PER_TX: u32 = 32;
pub global PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX: u32 = 1; // This is the fee_payer's fee juice balance.
pub global MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX: u32 =
    (1 as u8 << PUBLIC_DATA_SUBTREE_HEIGHT as u8) as u32;
pub global MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX: u32 =
    MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX - PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX;
pub global MAX_L2_TO_L1_MSGS_PER_TX: u32 = 8; // Leave at 8, because it results in sha256 hashing in the Tx Base Rollup
pub global MAX_PRIVATE_LOGS_PER_TX: u32 = MAX_NOTE_HASHES_PER_TX;
pub global MAX_CONTRACT_CLASS_LOGS_PER_TX: u32 = 1;
pub global MAX_NOTE_HASH_READ_REQUESTS_PER_TX: u32 = 64;
pub global MAX_NULLIFIER_READ_REQUESTS_PER_TX: u32 = 64;
// Key validation requests are not only for app-siloed _nullifier_ secret keys: app-siloed tagging shared secrets might require this mechanism,
// hence why it's higher than you might expect (roughly (but not quite) enough for a tagging shared secret per private log + 1 nsk).
pub global MAX_KEY_VALIDATION_REQUESTS_PER_TX: u32 = MAX_PRIVATE_LOGS_PER_TX;

// "PER CALL" CONSTANTS
pub global MAX_NOTE_HASHES_PER_CALL: u32 = 16;
pub global MAX_NULLIFIERS_PER_CALL: u32 = 16;
pub global MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL: u32 = 8;
pub global MAX_ENQUEUED_CALLS_PER_CALL: u32 = MAX_ENQUEUED_CALLS_PER_TX;
pub global MAX_L2_TO_L1_MSGS_PER_CALL: u32 = MAX_L2_TO_L1_MSGS_PER_TX;
pub global MAX_PRIVATE_LOGS_PER_CALL: u32 = MAX_NOTE_HASHES_PER_CALL;
pub global MAX_CONTRACT_CLASS_LOGS_PER_CALL: u32 = 1;
pub global MAX_NOTE_HASH_READ_REQUESTS_PER_CALL: u32 = 16;
pub global MAX_NULLIFIER_READ_REQUESTS_PER_CALL: u32 = 16;
pub global MAX_KEY_VALIDATION_REQUESTS_PER_CALL: u32 = MAX_PRIVATE_LOGS_PER_CALL;
// docs:end:constants

// ROLLUP CONTRACT CONSTANTS - constants used only in l1-contracts
pub global NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP: u32 = 1 << L1_TO_L2_MSG_SUBTREE_HEIGHT;

// VK TREE CONSTANTS
pub global PRIVATE_KERNEL_INIT_VK_INDEX: u32 = 0;
pub global PRIVATE_KERNEL_INNER_VK_INDEX: u32 = 1;
// VK indices 2 and 3 are intentionally unallocated.
pub global HIDING_KERNEL_TO_ROLLUP_VK_INDEX: u32 = 4;
pub global HIDING_KERNEL_TO_PUBLIC_VK_INDEX: u32 = 5;
pub global PUBLIC_CHONK_VERIFIER_VK_INDEX: u32 = 6;
pub global PRIVATE_TX_BASE_ROLLUP_VK_INDEX: u32 = 7;
pub global PUBLIC_TX_BASE_ROLLUP_VK_INDEX: u32 = 8;
pub global TX_MERGE_ROLLUP_VK_INDEX: u32 = 9;
pub global BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX: u32 = 10;
pub global BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX: u32 = 11;
pub global BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX: u32 = 12;
pub global BLOCK_ROOT_ROLLUP_VK_INDEX: u32 = 13;
pub global BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX: u32 = 14;
pub global BLOCK_MERGE_ROLLUP_VK_INDEX: u32 = 15;
pub global CHECKPOINT_ROOT_ROLLUP_VK_INDEX: u32 = 16;
pub global CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP_VK_INDEX: u32 = 17;
pub global CHECKPOINT_PADDING_ROLLUP_VK_INDEX: u32 = 18;
pub global CHECKPOINT_MERGE_ROLLUP_VK_INDEX: u32 = 19;
pub global ROOT_ROLLUP_VK_INDEX: u32 = 20;
// VK indices 21 and 22 are intentionally unallocated: they were the parity base / parity root, replaced by the
// InboxParity size ladder (appended at 74-76 below, since the reset range 23-64 is reserved).
// The three families below carve up the reset-family range (23-42). Each base is the VK index
// of its family's first variant; subsequent variants occupy successive indices. Bases must
// stay ascending; `validate_vk_in_vk_tree` depends on this ordering.
//   inner             : 23 + i   (mid-tx resets, no siloing)
//   finalTail         : 31 + i   (terminal reset+tail, rollup-bound)
//   finalTailToPublic : 37 + i   (terminal reset+tail-to-public, public-bound)
pub global PRIVATE_KERNEL_RESET_VK_INDEX: u32 = 23;
pub global PRIVATE_KERNEL_RESET_TAIL_VK_INDEX: u32 = 31;
pub global PRIVATE_KERNEL_RESET_TAIL_TO_PUBLIC_VK_INDEX: u32 = 37;
// Upper bound (exclusive) of the generated reset-family VK-tree range; used by VK-index normalisation
// to know when to stop family-base matching.
pub global PRIVATE_KERNEL_RESET_BLOCK_END: u32 = 43;
// Important: Do not define indexes between 23 and 42 except via the three reset families above.
// Indices 43-64 are intentionally unallocated; add new non-reset kernel indices at 65+.
pub global PRIVATE_KERNEL_INIT_2_VK_INDEX: u32 = 65;
pub global PRIVATE_KERNEL_INIT_3_VK_INDEX: u32 = 66;
pub global PRIVATE_KERNEL_INIT_4_VK_INDEX: u32 = 67;
pub global PRIVATE_KERNEL_INIT_5_VK_INDEX: u32 = 68;
pub global PRIVATE_KERNEL_INNER_2_VK_INDEX: u32 = 69;
pub global PRIVATE_KERNEL_INNER_3_VK_INDEX: u32 = 70;
pub global PRIVATE_KERNEL_INNER_4_VK_INDEX: u32 = 71;
pub global PRIVATE_KERNEL_INNER_5_VK_INDEX: u32 = 72;
// The block-root variants at 10-14 are full; the non-first message-only block root is appended after the
// multi-app kernel indices (65-72), since 43-64 are reserved for reset variants.
pub global BLOCK_ROOT_MSGS_ONLY_ROLLUP_VK_INDEX: u32 = 73;
// The InboxParity size ladder: one VK per size, checked as an allowed set by the checkpoint root. Appended here
// (rather than reusing the freed 21/22) so the three sizes stay contiguous and read in order.
pub global INBOX_PARITY_64_VK_INDEX: u32 = 74;
pub global INBOX_PARITY_256_VK_INDEX: u32 = 75;
pub global INBOX_PARITY_1024_VK_INDEX: u32 = 76;

// Maximum number of apps absorbed by a single private kernel iteration.
pub global MAX_APPS_PER_KERNEL: u32 = 5;

// SIDE EFFECT RELATED CONSTANTS
// Global indices allow us to uniquely index side effects in PrivateCircuitPublicInputs
pub global GLOBAL_INDEX_NOTE_HASH_READ_REQUEST_OFFSET: u32 = 0;
pub global GLOBAL_INDEX_NULLIFIER_READ_REQUEST_OFFSET: u32 =
    GLOBAL_INDEX_NOTE_HASH_READ_REQUEST_OFFSET + MAX_NOTE_HASH_READ_REQUESTS_PER_CALL;
pub global GLOBAL_INDEX_NOTE_HASH_OFFSET: u32 =
    GLOBAL_INDEX_NULLIFIER_READ_REQUEST_OFFSET + MAX_NULLIFIER_READ_REQUESTS_PER_CALL;
pub global GLOBAL_INDEX_NULLIFIER_OFFSET: u32 =
    GLOBAL_INDEX_NOTE_HASH_OFFSET + MAX_NOTE_HASHES_PER_CALL;
pub global GLOBAL_INDEX_PRIVATE_CALL_REQUEST_START_OFFSET: u32 =
    GLOBAL_INDEX_NULLIFIER_OFFSET + MAX_NULLIFIERS_PER_CALL;
pub global GLOBAL_INDEX_PRIVATE_CALL_REQUEST_END_OFFSET: u32 =
    GLOBAL_INDEX_PRIVATE_CALL_REQUEST_START_OFFSET + MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL;
pub global GLOBAL_INDEX_PUBLIC_CALL_REQUEST_OFFSET: u32 =
    GLOBAL_INDEX_PRIVATE_CALL_REQUEST_END_OFFSET + MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL;
pub global GLOBAL_INDEX_L2_TO_L1_MSG_OFFSET: u32 =
    GLOBAL_INDEX_PUBLIC_CALL_REQUEST_OFFSET + MAX_ENQUEUED_CALLS_PER_CALL;
pub global GLOBAL_INDEX_PRIVATE_LOG_OFFSET: u32 =
    GLOBAL_INDEX_L2_TO_L1_MSG_OFFSET + MAX_L2_TO_L1_MSGS_PER_CALL;
pub global GLOBAL_INDEX_CONTRACT_CLASS_LOG_HASH_OFFSET: u32 =
    GLOBAL_INDEX_PRIVATE_LOG_OFFSET + MAX_PRIVATE_LOGS_PER_CALL;
pub global GLOBAL_INDEX_CONTRACT_MIN_REVERTIBLE_SIDE_EFFECT_COUNTER_OFFSET: u32 =
    GLOBAL_INDEX_CONTRACT_CLASS_LOG_HASH_OFFSET + MAX_CONTRACT_CLASS_LOGS_PER_CALL;

pub global TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL: u32 = GLOBAL_INDEX_CONTRACT_MIN_REVERTIBLE_SIDE_EFFECT_COUNTER_OFFSET
    + 1 /* min_revertible_side_effect_counter */;

// MISC CONSTANTS
pub global INITIAL_CHECKPOINT_NUMBER: Field = 1;
pub global INITIAL_L2_BLOCK_NUM: Field = 1;
pub global FIELDS_PER_BLOB: u32 = 4096;
pub global BLOBS_PER_CHECKPOINT: u32 = 6;
pub global MAX_CHECKPOINTS_PER_EPOCH: u32 = 32;
pub global MAX_TX_LIFETIME: u64 = 86400; // 1 day. Arbitrarily chosen.
// The genesis values are taken from world_state.test.cpp > WorldStateTest.GetInitialTreeInfoForAllTrees
pub global GENESIS_BLOCK_HEADER_HASH: Field =
    0x0e7bf88e8833c27b0fca6be614ecc2c63def7bffa35b3ccfa1caff3e39e0c0d2;
pub global GENESIS_ARCHIVE_ROOT: Field =
    0x177a4955b31ecaafad999753938a44e526b54c5ba5d536688227f85f15cfbdf5;
pub global EMPTY_EPOCH_OUT_HASH: Field =
    0xc95e0ceb41951039e1592745ec2faea9866f6eaf01bf189a4463b4143af093;

// CONTRACT CLASS CONSTANTS
pub global MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS: u32 = 3000; // Arbitrary.
// Bytecode size for private functions is per function, not for the entire contract.
// Note that private functions bytecode includes a mix of acir and brillig.
pub global MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS: u32 = 3000; // Arbitrary.

// How many fields are on the serialized ClassPrivateFunctionBroadcasted event in addition to MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS.
pub global CLASS_REGISTRY_PRIVATE_FUNCTION_BROADCASTED_ADDITIONAL_FIELDS: u32 =/* magic value */ 1
    + 1 /* contract_class_id */
    + 1 /* artifact_metadata_hash */
    + 1 /* utility_functions_artifact_tree_root */
    + FUNCTION_TREE_HEIGHT /* private_function_tree_sibling_path */
    + 1 /* private_function_tree_leaf_index */
    + ARTIFACT_FUNCTION_TREE_MAX_HEIGHT /* artifact_function_tree_sibling_path */
    + 1 /* artifact_function_tree_leaf_index */
    + 1 /* function selector */
    + 1 /* function metadata_hash */
    + 1 /* function vk_hash */;

// We use these magic values to identify events emitted by the ContractClassRegistry and ContractInstanceRegistry.
// The values were generated and checked in `constants_tests.nr`.
pub global CONTRACT_CLASS_PUBLISHED_MAGIC_VALUE: Field =
    0x20f5895a4e837356c2d551743df6bf642756dcd93cd31cbd37c556c90bf7f244;
pub global CONTRACT_INSTANCE_PUBLISHED_MAGIC_VALUE: Field =
    0x174c6b3d0fd14728e4fc5e53f7b262ab943546a7e125e2ed5e9fde3cf0b3e22f;
pub global CONTRACT_INSTANCE_UPDATED_MAGIC_VALUE: Field =
    0x2dcffa53cd0e71da7b4a22677b3342bfc3b9043f5081bea58368ad008eaa6f37;

// CANONICAL CONTRACT ADDRESSES
// The maximum number of protocol contracts that can be supported.
// Chosen to be a multiple of 3 (-1 to account for the separator), to optimize the poseidon2 hash.
pub global MAX_PROTOCOL_CONTRACTS: u32 = 11;
// Address 0 is not a protocol contract.
pub global CONTRACT_CLASS_REGISTRY_CONTRACT_ADDRESS: AztecAddress = AztecAddress::from_field(1);
pub global CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS: AztecAddress = AztecAddress::from_field(2);
pub global FEE_JUICE_ADDRESS: AztecAddress = AztecAddress::from_field(3);

// `SIDE_EFFECT_MASKING_ADDRESS` is used by the protocol circuits to silo the padding side effects. It's not a protocol
// contract (hence its address is greater than `MAX_PROTOCOL_CONTRACTS`).
// Padding items must be siloed with a contract address which cannot be deployed nor impersonated by any user,
// because we don't want any malicious user to be able to push malicious state for actual contracts through this
// padding feature.
// It's not possible to create an actual contract whose address equals this value. If it were possible, it would mean
// that anyone can freely change the state of the contract by adding padding side effects to their transactions.
// The value was generated and checked in `constants_tests.nr`.
pub global SIDE_EFFECT_MASKING_ADDRESS: AztecAddress = AztecAddress::from_field(
    0x2b29b6b962034f217d620700c44845d2a3c7d208d7e23328286124f4c6eb11e3,
);

// NULL MSG_SENDER CONTRACT ADDRESS (not part of the protocol contracts tree).
pub global NULL_MSG_SENDER_CONTRACT_ADDRESS: AztecAddress = AztecAddress::from_field(
    21888242871839275222246405745257275088548364400416034343698204186575808495616,
); // This is `-1`.

// Randomly chosen slot for the bytecode capsule.
// The value was generated and checked in `constants_tests.nr`.
pub global CONTRACT_CLASS_REGISTRY_BYTECODE_CAPSULE_SLOT: Field =
    0x1f61038721b052d5389449bf44f73c817146aedfab1ef13d37f16ce928df1fb7;

// Slot of the balances map to be hashed with an AztecAddress (map key) to get an actual storage slot.
// TODO: document the fee_juice contract, documenting where all of the logic and constants live, because it's all over the place.
pub global FEE_JUICE_BALANCES_SLOT: u32 = 1;

// Slot of the updated_class_ids map to be hashed with an AztecAddress (map key) to get an actual storage slot.
// TODO: document the contract class registry contract, documenting where all of the logic and constants live, because it's all over the place.
pub global UPDATED_CLASS_IDS_SLOT: u32 = 1;

// CANONICAL DEFAULT KEYS
// This below are:
// "az_null_npk"
// "az_null_ivpk"
// "az_null_ovpk"
// "az_null_tpk"
// "az_null_mspk"
// "az_null_fbpk"
// as bytes, hashed to curve using grumpkin::g1::affine_element::hash_to_curve(<X>, 0);
// TODO: AFAIK grumpkin's hash to curve is not exposed in noir. We should probably derive these from
// a noir test within this file, so we should probably write a simple hash to curve function.
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
pub global DEFAULT_MSPK_M_X: Field =
    0x00d52691f35698f962ea20f2bd0ab906c82228a434593dd28f36a3807f3043b8;
pub global DEFAULT_MSPK_M_Y: Field =
    0x0e27412388283d55cffb96143b2b4493b5bf6895fdb5787dadd8b0105d7531c5;
pub global DEFAULT_FBPK_M_X: Field =
    0x1995b7952c9a39667e5333cb48435aade5e08ae1dcb066db87402e1dae09698a;
pub global DEFAULT_FBPK_M_Y: Field =
    0x1a07e89069fc04690e335ed68ca3914b9efd141014f24534276383c6361b1553;

// Precomputed `hash_public_key(Point { DEFAULT_*_X, DEFAULT_*_Y })` for each non-ivpk key.
// Used by `PublicKeys::default()` and the matching TS `PublicKeys.default()`. Verified by the
// `default_hashes_match_default_points` test in public_keys.nr.
pub global DEFAULT_NPK_M_HASH: Field =
    0x14fbaeaeddaa69be81d404c684e78e9f1a786d225faf8de2ce97c92f67d89a26;
pub global DEFAULT_OVPK_M_HASH: Field =
    0x0e60ed663a4da5636e2e25a1f1f0c5b27c011c8eaed22bbe61e2a0fd875dd24b;
pub global DEFAULT_TPK_M_HASH: Field =
    0x082c6d164b0ba073c9dd911100248c8ecd80b03f82f38531856a3c16dadcbef0;
pub global DEFAULT_MSPK_M_HASH: Field =
    0x14a5d4bde495b8c3a9ba4aed0d4870526e46fdff22d341a2f689ac5a50d10356;
pub global DEFAULT_FBPK_M_HASH: Field =
    0x0f124f07811eebfaaa6d31316a2cc5bf255fa118f720e8ff1f2fc0d4aa46d496;

// LENGTH OF STRUCTS SERIALIZED TO FIELDS
// TODO: figure out whether Noir is sophisticated enough to derive these for us, these days.
pub global AZTEC_ADDRESS_LENGTH: u32 = 1;
pub global GAS_FEES_LENGTH: u32 = 2;
pub global GAS_LENGTH: u32 = 2;
pub global GAS_SETTINGS_LENGTH: u32 = GAS_LENGTH /* gas_limits */
    + GAS_LENGTH /* teardown_gas_limits */
    + GAS_FEES_LENGTH /* max_fees_per_gas */
    + GAS_FEES_LENGTH /* max_priority_fees_per_gas */;
pub global CALL_CONTEXT_LENGTH: u32 = 4;
pub global CONTRACT_INSTANCE_LENGTH: u32 = 12;
pub global CONTRACT_STORAGE_READ_LENGTH: u32 = 3;
pub global CONTRACT_STORAGE_UPDATE_REQUEST_LENGTH: u32 = 3;
pub global ETH_ADDRESS_LENGTH: u32 = 1;
pub global FUNCTION_DATA_LENGTH: u32 = 2;
pub global GLOBAL_VARIABLES_LENGTH: u32 = 7 + GAS_FEES_LENGTH;
pub global APPEND_ONLY_TREE_SNAPSHOT_LENGTH: u32 = 2;
pub global SPONGE_BLOB_LENGTH: u32 = 10;
pub global L1_TO_L2_MESSAGE_SPONGE_LENGTH: u32 = 10;
pub global BLS12_FR_LIMBS: u32 = 3; // TODO(#14646): get this from bignum
pub global BLS12_FQ_LIMBS: u32 = 4; // TODO(#14646): get this from bignum
pub global BLS12_POINT_LENGTH: u32 = 2 * BLS12_FQ_LIMBS + 1; // TODO(#14646): reduce num fields needed here?
pub global BLS12_POINT_COMPRESSED_BYTES: u32 = 48; // TODO(#14646): get this from bignum
pub global BLOB_ACCUMULATOR_LENGTH: u32 = 3 /* v_acc, z_acc, and gamma_acc */
    + 2 * BLS12_FR_LIMBS /* y_acc and gamma^i */
    + BLS12_POINT_LENGTH /* c_acc */;
pub global FINAL_BLOB_BATCHING_CHALLENGES_LENGTH: u32 = 1 /* z */
    + BLS12_FR_LIMBS /* gamma */;
pub global FINAL_BLOB_ACCUMULATOR_LENGTH: u32 = 1 /* blob_commitments_hash */
    + 1 /* z */
    + BLS12_FR_LIMBS /* y */
    + 2 /* c */;
pub global L2_TO_L1_MESSAGE_LENGTH: u32 = 1 /* recipient */ + 1 /* content */;
pub global COUNTED_L2_TO_L1_MESSAGE_LENGTH: u32 = L2_TO_L1_MESSAGE_LENGTH + 1;
pub global SCOPED_L2_TO_L1_MESSAGE_LENGTH: u32 = L2_TO_L1_MESSAGE_LENGTH + 1;
pub global KEY_VALIDATION_REQUEST_LENGTH: u32 = 2;
pub global KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH: u32 = KEY_VALIDATION_REQUEST_LENGTH + 1;
pub global SCOPED_KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH: u32 =
    KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH + 1;
pub global PARTIAL_STATE_REFERENCE_LENGTH: u32 = 6;
pub global PRIVATE_LOG_SIZE_IN_FIELDS: u32 = 16;
pub global PRIVATE_LOG_LENGTH: u32 = PRIVATE_LOG_SIZE_IN_FIELDS + 1 /* length */;
pub global PRIVATE_LOG_DATA_LENGTH: u32 = PRIVATE_LOG_LENGTH
    + 1 /* note_hash_counter */
    + 1 /* counter */;
/// A private log's ciphertext is all fields except the first one, which is called 'tag'. We call this 'ciphertext'
/// because, unlike public logs, it is expected that private logs are encrypted (though this is not
/// mandatory).
pub global PRIVATE_LOG_CIPHERTEXT_LEN: u32 = PRIVATE_LOG_SIZE_IN_FIELDS - 1; // -1 for the tag
// Below are constants for the entire PublicLogs struct.
pub global FLAT_PUBLIC_LOGS_HEADER_LENGTH: u32 = 1 /* length */;
pub global FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH: u32 = 4096;
pub global PUBLIC_LOGS_LENGTH: u32 =
    FLAT_PUBLIC_LOGS_HEADER_LENGTH + FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH;
// Below are constants for individual public log in PublicLogs' payload.
pub global PUBLIC_LOG_HEADER_LENGTH: u32 = 2; /* length and contract_address */
pub global MAX_PUBLIC_LOG_SIZE_IN_FIELDS: u32 =
    FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH - PUBLIC_LOG_HEADER_LENGTH;

// TODO: write a test to ensure `CLASS_REGISTRY_PRIVATE_FUNCTION_BROADCASTED_ADDITIONAL_FIELDS` is the maximum
// of the various function metadata that can be broadcasted (i.e. the largest of public/private/utility)
pub global CONTRACT_CLASS_LOG_SIZE_IN_FIELDS: u32 = MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS
    + CLASS_REGISTRY_PRIVATE_FUNCTION_BROADCASTED_ADDITIONAL_FIELDS;
pub global CONTRACT_CLASS_LOG_LENGTH: u32 = CONTRACT_CLASS_LOG_SIZE_IN_FIELDS
    + 1 /* length */
    + 1 /* contract_address */;
pub global LOG_HASH_LENGTH: u32 = 1 /* value */ + 1 /* length */;
pub global COUNTED_LOG_HASH_LENGTH: u32 = LOG_HASH_LENGTH + 1 /* counter */;
pub global SCOPED_LOG_HASH_LENGTH: u32 = LOG_HASH_LENGTH + 1 /* contract_address */;
pub global NOTE_HASH_LENGTH: u32 = 2;
pub global NULLIFIER_LENGTH: u32 = 3;
pub global PUBLIC_DATA_WRITE_LENGTH: u32 = 2;
pub global PUBLIC_CALL_STACK_ITEM_COMPRESSED_LENGTH: u32 =
    AZTEC_ADDRESS_LENGTH + CALL_CONTEXT_LENGTH + 3 + 2 * GAS_LENGTH;
pub global PRIVATE_CALL_REQUEST_LENGTH: u32 = CALL_CONTEXT_LENGTH + 4;
pub global PUBLIC_CALL_REQUEST_LENGTH: u32 = AZTEC_ADDRESS_LENGTH /* msg_sender */
    + AZTEC_ADDRESS_LENGTH /* contract_address */
    + 1 /* is_static_call */
    + 1 /* calldata_hash */;
pub global COUNTED_PUBLIC_CALL_REQUEST_LENGTH: u32 = PUBLIC_CALL_REQUEST_LENGTH + 1;
pub global STATE_REFERENCE_LENGTH: u32 =
    APPEND_ONLY_TREE_SNAPSHOT_LENGTH + PARTIAL_STATE_REFERENCE_LENGTH;
pub global TREE_SNAPSHOTS_LENGTH: u32 = APPEND_ONLY_TREE_SNAPSHOT_LENGTH * 4;
pub global TX_CONTEXT_LENGTH: u32 = 2 + GAS_SETTINGS_LENGTH;
pub global TX_REQUEST_LENGTH: u32 =
    1 /* origin */ + 1 /* args_hash */ + TX_CONTEXT_LENGTH + FUNCTION_DATA_LENGTH + 1 /* salt */;
pub global TOTAL_FEES_LENGTH: u32 = 1;
pub global TOTAL_MANA_USED_LENGTH: u32 = 1;
pub global BLOCK_HEADER_LENGTH: u32 = APPEND_ONLY_TREE_SNAPSHOT_LENGTH
    + STATE_REFERENCE_LENGTH
    + 1 /* blob_sponge_hash */
    + GLOBAL_VARIABLES_LENGTH
    + TOTAL_FEES_LENGTH
    + TOTAL_MANA_USED_LENGTH;
pub global CHECKPOINT_HEADER_LENGTH: u32 = 1 /* last_archive_root */
    + 1 /* block_headers_hash */
    + 1 /* blobs_hash */
    + 1 /* in_hash */
    + 1 /* inbox_rolling_hash */
    + 1 /* out_hash */
    + 1 /* slot_number */
    + 1 /* timestamp */
    + 1 /* coinbase */
    + 1 /* fee_recipient */
    + GAS_FEES_LENGTH
    + TOTAL_MANA_USED_LENGTH
    + 1 /* accumulated_fees */;
pub global CHECKPOINT_HEADER_SIZE_IN_BYTES: u32 = (CHECKPOINT_HEADER_LENGTH - 4) * 32
    + 8 /* timestamp */
    + 20 /* coinbase */
    + 16 /* gas_fees.fee_per_da_gas */
    + 16 /* gas_fees.fee_per_l2_gas */;

pub global SCOPED_READ_REQUEST_LEN: u32 = 3;
pub global PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH: u32 = CALL_CONTEXT_LENGTH
    + 1 /* args_hash */
    + 1 /* returns_hash */
    + 1 /* min_revertible_side_effect_counter */
    + 1 /* is_fee_payer */
    + 1 /* expiration_timestamp */
    // The `(... + 1)` is because these arrays include a `length` field.
    + (SCOPED_READ_REQUEST_LEN * MAX_NOTE_HASH_READ_REQUESTS_PER_CALL + 1)
    + (SCOPED_READ_REQUEST_LEN * MAX_NULLIFIER_READ_REQUESTS_PER_CALL + 1)
    + (KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH * MAX_KEY_VALIDATION_REQUESTS_PER_CALL + 1)
    + (NOTE_HASH_LENGTH * MAX_NOTE_HASHES_PER_CALL + 1)
    + (NULLIFIER_LENGTH * MAX_NULLIFIERS_PER_CALL + 1)
    + (PRIVATE_CALL_REQUEST_LENGTH * MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL + 1)
    + (COUNTED_PUBLIC_CALL_REQUEST_LENGTH * MAX_ENQUEUED_CALLS_PER_CALL + 1)
    + PUBLIC_CALL_REQUEST_LENGTH
    + (COUNTED_L2_TO_L1_MESSAGE_LENGTH * MAX_L2_TO_L1_MSGS_PER_CALL + 1)
    + 1 /* start_side_effect_counter */
    + 1 /* end_side_effect_counter */
    + 1 /* expected_non_revertible_side_effect_counter */
    + 1 /* expected_revertible_side_effect_counter */
    + (PRIVATE_LOG_DATA_LENGTH * MAX_PRIVATE_LOGS_PER_CALL + 1)
    + (COUNTED_LOG_HASH_LENGTH * MAX_CONTRACT_CLASS_LOGS_PER_CALL + 1)
    + BLOCK_HEADER_LENGTH
    + TX_CONTEXT_LENGTH
    + 1 /* tx_request_salt */;
pub global PRIVATE_CONTEXT_INPUTS_LENGTH: u32 = CALL_CONTEXT_LENGTH
    + BLOCK_HEADER_LENGTH
    + TX_CONTEXT_LENGTH
    + 1 /* start_side_effect_counter */
    + 1 /* tx_request_salt */;
pub global FEE_RECIPIENT_LENGTH: u32 = 2;

// TODO: Leila's considering moving this into a noir file within bb
// The hiding kernel IO public inputs consist of pairing_inputs and table_commitments.
// They are independent of the circuit's custom public inputs.
pub global HIDING_KERNEL_IO_PUBLIC_INPUTS_SIZE: u32 = 28;
pub global PAIRING_POINTS_SIZE: u32 = 8;
pub global IPA_CLAIM_SIZE: u32 = 6;

pub global PRIVATE_TO_ROLLUP_ACCUMULATED_DATA_LENGTH: u32 = MAX_NOTE_HASHES_PER_TX
    + MAX_NULLIFIERS_PER_TX
    + (MAX_L2_TO_L1_MSGS_PER_TX * SCOPED_L2_TO_L1_MESSAGE_LENGTH)
    + (PRIVATE_LOG_LENGTH * MAX_PRIVATE_LOGS_PER_TX)
    + (SCOPED_LOG_HASH_LENGTH * MAX_CONTRACT_CLASS_LOGS_PER_TX);

pub global TX_CONSTANT_DATA_LENGTH: u32 = BLOCK_HEADER_LENGTH
    + TX_CONTEXT_LENGTH
    + 1 /* vk_tree_root */
    + 1 /* protocol_contracts_hash */;

pub global PRIVATE_TO_PUBLIC_ACCUMULATED_DATA_LENGTH: u32 = MAX_NOTE_HASHES_PER_TX
    + MAX_NULLIFIERS_PER_TX
    + (MAX_L2_TO_L1_MSGS_PER_TX * SCOPED_L2_TO_L1_MESSAGE_LENGTH)
    + (MAX_PRIVATE_LOGS_PER_TX * PRIVATE_LOG_LENGTH)
    + (MAX_CONTRACT_CLASS_LOGS_PER_TX * SCOPED_LOG_HASH_LENGTH)
    + (MAX_ENQUEUED_CALLS_PER_TX * PUBLIC_CALL_REQUEST_LENGTH);

pub global PRIVATE_TO_AVM_ACCUMULATED_DATA_LENGTH: u32 = MAX_NOTE_HASHES_PER_TX
    + MAX_NULLIFIERS_PER_TX
    + (MAX_L2_TO_L1_MSGS_PER_TX * SCOPED_L2_TO_L1_MESSAGE_LENGTH);
pub global NUM_PRIVATE_TO_AVM_ACCUMULATED_DATA_ARRAYS: u32 = 3;
pub global NUM_AVM_ACCUMULATED_DATA_ARRAYS: u32 = 4; // note_hashes, nullifiers, l2_to_l1_msgs, public_data_writes
pub global NUM_PUBLIC_CALL_REQUEST_ARRAYS: u32 = 3; // really 2 arrays and a single teardown req

pub global AVM_ACCUMULATED_DATA_LENGTH: u32 = MAX_NOTE_HASHES_PER_TX
    + MAX_NULLIFIERS_PER_TX
    + (MAX_L2_TO_L1_MSGS_PER_TX * SCOPED_L2_TO_L1_MESSAGE_LENGTH)
    + PUBLIC_LOGS_LENGTH
    + (MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX * PUBLIC_DATA_WRITE_LENGTH);

pub global PRIVATE_TO_PUBLIC_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH: u32 = TX_CONSTANT_DATA_LENGTH
    + PRIVATE_TO_PUBLIC_ACCUMULATED_DATA_LENGTH /* non_revertible_accumulated_data */
    + PRIVATE_TO_PUBLIC_ACCUMULATED_DATA_LENGTH /* revertible_accumulated_data */
    + PUBLIC_CALL_REQUEST_LENGTH /* public_teardown_call_request */
    + GAS_LENGTH /* gas_used */
    + AZTEC_ADDRESS_LENGTH /* fee_payer */
    + 1 /* expiration_timestamp */;

pub global PRIVATE_TO_ROLLUP_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH: u32 = TX_CONSTANT_DATA_LENGTH
    + PRIVATE_TO_ROLLUP_ACCUMULATED_DATA_LENGTH
    + GAS_LENGTH /* gas_used */
    + AZTEC_ADDRESS_LENGTH /* fee_payer */
    + 1 /* expiration_timestamp */;

pub global AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH: u32 = GLOBAL_VARIABLES_LENGTH
    + MAX_PROTOCOL_CONTRACTS /* protocol_contracts */
    + TREE_SNAPSHOTS_LENGTH /* start_tree_snapshots */
    + GAS_LENGTH /* start_gas_used */
    + GAS_SETTINGS_LENGTH
    + GAS_FEES_LENGTH /* effective_gas_fees */
    + 1 /* fee_payer */
    + 1 /* prover_id */
    + NUM_PUBLIC_CALL_REQUEST_ARRAYS /* public_call_request_array_lengths */
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
    + NUM_AVM_ACCUMULATED_DATA_ARRAYS /* accumulated_data_array_lengths */
    + 1 /* reverted */;

pub global BLOCK_CONSTANT_DATA_LENGTH: u32 = APPEND_ONLY_TREE_SNAPSHOT_LENGTH /* last_archive */
    + APPEND_ONLY_TREE_SNAPSHOT_LENGTH /* new_l1_to_l2_message_tree */
    + 1 /* vk_tree_root */
    + 1 /* protocol_contracts_hash */
    + 1 /* prover_id */
    + GLOBAL_VARIABLES_LENGTH;
pub global CHECKPOINT_CONSTANT_DATA_LENGTH: u32 = 1 /* chain_id */
    + 1 /* version */
    + 1 /* vk_tree_root */
    + 1 /* protocol_contracts_hash */
    + 1 /* prover_id */
    + 1 /* slot_number */
    + ETH_ADDRESS_LENGTH /* coinbase */
    + AZTEC_ADDRESS_LENGTH /* fee_recipient */
    + GAS_FEES_LENGTH /* gas_fees */;
pub global EPOCH_CONSTANT_DATA_LENGTH: u32 = 1 /* chain_id */
    + 1 /* version */
    + 1 /* vk_tree_root */
    + 1 /* protocol_contracts_hash */
    + 1 /* prover_id */;

pub global TX_ROLLUP_PUBLIC_INPUTS_LENGTH: u32 = BLOCK_CONSTANT_DATA_LENGTH
    + PARTIAL_STATE_REFERENCE_LENGTH /* start_state_reference */
    + PARTIAL_STATE_REFERENCE_LENGTH /* end_state_reference */
    + SPONGE_BLOB_LENGTH /* start_sponge_blob */
    + SPONGE_BLOB_LENGTH /* end_sponge_blob */
    + 1 /* num_txs */
    + 1 /* out_hash */
    + 1 /* accumulated_fees */
    + 1 /* accumulated_mana_used */;
pub global BLOCK_ROLLUP_PUBLIC_INPUTS_LENGTH: u32 = CHECKPOINT_CONSTANT_DATA_LENGTH
    + 2 * APPEND_ONLY_TREE_SNAPSHOT_LENGTH /* previous_archive and new_archive */
    + 2 * STATE_REFERENCE_LENGTH /* start_state and end_state */
    + 2 * SPONGE_BLOB_LENGTH /* start_sponge_blob and end_sponge_blob */
    + 1 /* timestamp */
    + 1 /* block_headers_hash */
    + 1 /* is_first_block */
    + 2 * L1_TO_L2_MESSAGE_SPONGE_LENGTH /* start_msg_sponge and end_msg_sponge */
    + 1 /* out_hash */
    + 1 /* accumulated_fees */
    + 1 /* accumulated_mana_used */;
pub global CHECKPOINT_ROLLUP_PUBLIC_INPUTS_LENGTH: u32 = EPOCH_CONSTANT_DATA_LENGTH
    + 2 * APPEND_ONLY_TREE_SNAPSHOT_LENGTH /* previous_archive and new_archive */
    + 2 * APPEND_ONLY_TREE_SNAPSHOT_LENGTH /* start_out_hash and end_out_hash */
    + 1 /* start_inbox_rolling_hash */
    + 1 /* end_inbox_rolling_hash */
    + MAX_CHECKPOINTS_PER_EPOCH /* checkpoint_header_hashes */
    + MAX_CHECKPOINTS_PER_EPOCH * FEE_RECIPIENT_LENGTH /* fees */
    + 2 * BLOB_ACCUMULATOR_LENGTH /* start and end blob accumulators */
    + FINAL_BLOB_BATCHING_CHALLENGES_LENGTH;
pub global ROOT_ROLLUP_PUBLIC_INPUTS_LENGTH: u32 = 1 /* previous_archive_root */
    + 1 /* end_archive_root */
    + 1 /* out_hash */
    + 1 /* previous_inbox_rolling_hash */
    + 1 /* end_inbox_rolling_hash */
    + 1 /* chain_id */
    + 1 /* version */
    + 1 /* vk_tree_root */
    + 1 /* protocol_contracts_hash */
    + 1 /* prover_id */
    + MAX_CHECKPOINTS_PER_EPOCH /* checkpoint_header_hashes */
    + MAX_CHECKPOINTS_PER_EPOCH * FEE_RECIPIENT_LENGTH /* fees */
    + FINAL_BLOB_ACCUMULATOR_LENGTH /* blob_public_inputs */;

// The InboxParity size ladder: one variable-size parity proof is produced per checkpoint, and the prover picks the
// smallest size >= the checkpoint's real message count. The largest rung equals the per-checkpoint message cap.
pub global INBOX_PARITY_SIZE_SMALL: u32 = 64;
pub global INBOX_PARITY_SIZE_MEDIUM: u32 = 256;
pub global INBOX_PARITY_SIZE_LARGE: u32 = 1024;

// Fan-in of the sha256 `in_hash` frontier tree (NUM_BASE_PARITY_PER_ROOT_PARITY * NUM_MSGS_PER_BASE_PARITY ==
// NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP). The circuits no longer build this tree, but the constants are still consumed
// by the generated Solidity `Constants` and the L1 `Parity.t.sol` test that checks the frontier-root construction.
pub global NUM_MSGS_PER_BASE_PARITY: u32 = 256;
pub global NUM_BASE_PARITY_PER_ROOT_PARITY: u32 = 4;

// Lengths of the different types of proofs in fields
pub global RECURSIVE_PROOF_LENGTH: u32 = 410;
pub global NESTED_RECURSIVE_PROOF_LENGTH: u32 = RECURSIVE_PROOF_LENGTH;
pub global IPA_PROOF_LENGTH: u32 = 64;
pub global ULTRA_KECCAK_PROOF_LENGTH: u32 = 331; // See UltraKeccakFlavor for formula; based on root rollup log_n = 24
pub global RECURSIVE_ROLLUP_HONK_PROOF_LENGTH: u32 =
    RECURSIVE_PROOF_LENGTH + IPA_CLAIM_SIZE + IPA_PROOF_LENGTH;
pub global NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH: u32 = RECURSIVE_ROLLUP_HONK_PROOF_LENGTH;
// Chonk sub-proof lengths; pinned to bb via static_asserts in mock_verifier_inputs.test.cpp.
pub global CHONK_HIDING_OINK_LENGTH: u32 = 48;
pub global CHONK_MERGE_PROOF_SIZE: u32 = 41;
pub global CHONK_ECCVM_PROOF_LENGTH: u32 = 556;
pub global CHONK_TRIPLE_IPA_PROOF_LENGTH: u32 = 70;
pub global CHONK_JOINT_PROOF_LENGTH: u32 = 478;
pub global CHONK_PROOF_LENGTH: u32 = CHONK_HIDING_OINK_LENGTH
    + HIDING_KERNEL_IO_PUBLIC_INPUTS_SIZE
    + CHONK_MERGE_PROOF_SIZE
    + CHONK_ECCVM_PROOF_LENGTH
    + CHONK_TRIPLE_IPA_PROOF_LENGTH
    + CHONK_JOINT_PROOF_LENGTH;

pub global ULTRA_VK_LENGTH_IN_FIELDS: u32 = 115; // size of an Ultra verification key
pub global MEGA_APP_VK_LENGTH_IN_FIELDS: u32 = 151; // size of a MegaApp verification key
pub global MEGA_KERNEL_VK_LENGTH_IN_FIELDS: u32 = 151; // size of a MegaKernel verification key
pub global MEGA_ZK_VK_LENGTH_IN_FIELDS: u32 = 119; // size of a MegaZK verification key
// CHONK: "Client Honk" - An UltraHonk variant with incremental folding and delayed non-native arithmetic.
pub global CHONK_VK_LENGTH_IN_FIELDS: u32 = MEGA_ZK_VK_LENGTH_IN_FIELDS; // size of a chonk verification key
// VK is composed of
// - circuit size encoded as a fr field element (32 bytes)
// - num of inputs encoded as a fr field element (32 bytes)
// - 21 affine elements (curve base field fq) encoded as fr elements takes (21 * 4 * 32 bytes)
// 21 above refers to the constant AvmFlavor::NUM_PRECOMPUTED_ENTITIES
pub global AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS: u32 = 2 + 21 * 4;

// Setting limits for MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS
// This value is determined by the length of the AVM trace and the max public bytecode size in bytes
// (MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS * 32 = 96,000), i.e. 2^21 / 96,000 = 21
pub global MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS: u32 = 21;

// ---------------------------------------------------------------
// DOMAIN SEPARATORS
// See ./constants_tests.nr for how the values are generated.
// ---------------------------------------------------------------

/// Domain separator for note hashes.
///
/// This is not technically a protocol constant as note hashes are computed by each contract.
pub global DOM_SEP__NOTE_HASH: u32 = 116501019;

/// Domain separator for siloed note hashes.
///
/// Used by [`crate::hash::compute_siloed_note_hash`].
pub global DOM_SEP__SILOED_NOTE_HASH: u32 = 3361878420;

/// Domain separator for unique note hashes.
///
/// Used by [`crate::hash::compute_unique_note_hash`].
pub global DOM_SEP__UNIQUE_NOTE_HASH: u32 = 226850429;

/// Domain separator for nonces.
///
/// Used by [`crate::hash::compute_note_hash_nonce`].
pub global DOM_SEP__NOTE_HASH_NONCE: u32 = 1721808740;

/// Domain separator for note nullifiers.
///
/// This is not technically a protocol constant as note nullifiers are computed by each contract.
pub global DOM_SEP__NOTE_NULLIFIER: u32 = 50789342;

/// Domain separator for siloed nullifiers.
///
/// Used by [`crate::hash::compute_siloed_nullifier`].
pub global DOM_SEP__SILOED_NULLIFIER: u32 = 57496191;

/// Domain separator for L1 to L2 message nullifiers.
///
/// This is not technically a protocol constant as message nullifiers are computed by each contract.
pub global DOM_SEP__MESSAGE_NULLIFIER: u32 = 3754509616;

/// Domain separator for event log tags. Used by [`crate::hash::compute_log_tag`].
pub global DOM_SEP__EVENT_LOG_TAG: u32 = 926040838;
/// Domain separator for unconstrained message delivery log tags. Used by [`crate::hash::compute_log_tag`].
pub global DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG: u32 = 1485357192;
/// Domain separator for constrained message delivery log tags. Used by [`crate::hash::compute_log_tag`].
pub global DOM_SEP__CONSTRAINED_MSG_LOG_TAG: u32 = 3715244738;
/// Domain separator for the sender-only secret folded into constrained-delivery nullifiers.
pub global DOM_SEP__CONSTRAINED_MSG_SENDER_SECRET: u32 = 1182889476;
/// Domain separator for non-interactive handshake log tags emitted by the handshake registry contract. Used by
/// [`crate::hash::compute_log_tag`].
pub global DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG: u32 = 4046403018;
/// Domain separator for the message a recipient signs to authorize an interactive handshake, hashed via
/// [`crate::hash::poseidon2_hash_with_separator`] and verified in-circuit by the handshake registry contract.
pub global DOM_SEP__INTERACTIVE_HANDSHAKE_SIGNATURE: u32 = 3098455647;
/// Domain separator for the scalar that protects a handshake's shared secret from recipient forgery.
pub global DOM_SEP__HANDSHAKE_FORGERY_PROTECTION: u32 = 2291983127;
/// Domain separator for private log tags.
///
/// Used by [`crate::hash::compute_siloed_private_log_first_field`].
pub global DOM_SEP__PRIVATE_LOG_FIRST_FIELD: u32 = 2769976252;

pub global DOM_SEP__PUBLIC_LEAF_SLOT: u32 = 1247650290;
pub global DOM_SEP__PUBLIC_STORAGE_MAP_SLOT: u32 = 4015149901;

/// Domain separator for internal merkle-node hashing in append-only trees.
/// Indexed trees use per-tree merkle separators instead (see below).
pub global DOM_SEP__MERKLE_HASH: u32 = 2982624097;

// Per-tree internal merkle-node separators for indexed trees. Each tree's sibling paths verify
// against a tree-unique root, so a sibling path from tree A cannot be transported to tree B even
// if the underlying leaf values collide.
pub global DOM_SEP__NULLIFIER_MERKLE: u32 = 1157584160;
pub global DOM_SEP__PUBLIC_DATA_MERKLE: u32 = 3756303423;
// AVM-internal indexed trees:
pub global DOM_SEP__WRITTEN_SLOTS_MERKLE: u32 = 2292766212;
pub global DOM_SEP__RETRIEVED_BYTECODES_MERKLE: u32 = 2789215184;

// ---------------------------------------------------------------
// Contract Address

// Class Id
pub global DOM_SEP__PRIVATE_FUNCTION_LEAF: u32 = 1389398688;
pub global DOM_SEP__PUBLIC_BYTECODE: u32 = 260313585;
pub global DOM_SEP__CONTRACT_CLASS_ID: u32 = 3923495515;

// Salted Initialization Hash
pub global DOM_SEP__SALTED_INITIALIZATION_HASH: u32 = 2763052992;
pub global DOM_SEP__INITIALIZER: u32 = 385396519;

// Keys
pub global DOM_SEP__NHK_M: u32 = 242137788;
pub global DOM_SEP__IVSK_M: u32 = 2747825907;
pub global DOM_SEP__OVSK_M: u32 = 4272201051;
pub global DOM_SEP__TSK_M: u32 = 1546190975;
pub global DOM_SEP__MSSK_M: u32 = 617962565;
pub global DOM_SEP__FBSK_M: u32 = 787738027;
pub global DOM_SEP__PUBLIC_KEYS_HASH: u32 = 777457226;
pub global DOM_SEP__SINGLE_PUBLIC_KEY_HASH: u32 = 3452068255;

// Address
pub global DOM_SEP__PARTIAL_ADDRESS: u32 = 2103633018;

pub global DOM_SEP__CONTRACT_ADDRESS_V2: u32 = 4099338721;

// ---------------------------------------------------------------

pub global DOM_SEP__BLOCK_HEADER_HASH: u32 = 4195546849;

pub global DOM_SEP__TX_REQUEST: u32 = 3763737512;
pub global DOM_SEP__PUBLIC_TX_HASH: u32 = 1630108851;
pub global DOM_SEP__PRIVATE_TX_HASH: u32 = 1971680439;

// Hashing the calldata of public functions:
pub global DOM_SEP__PUBLIC_CALLDATA: u32 = 2760353947;
// Hashing the args to private functions:
pub global DOM_SEP__FUNCTION_ARGS: u32 = 3576554347;

pub global DOM_SEP__PROTOCOL_CONTRACTS: u32 = 3904434327;
// Part of the protocol, because some protocol contracts emit events.
pub global DOM_SEP__EVENT_COMMITMENT: u32 = 2517418573;

// ---------------------------------------------------------------
// Not protocol, but possibly protocol in future.

// The following might (in future) be justifiable as protocol constants, as they might get used by the protocol's "Protocol Contracts", e.g. if the protocol enables FeeJuice to be shielded in future.
// It will depend on the chosen functionality of FeeJuice:
// - It might not support partial notes.
// - It might not support encrypted messages.
// - It might not support authwits (instead using the fee_payer field as evidence of authorization).
// If FeeJuice doesn't end up supporting those things, then these constants should be moved into aztec.nr.

pub global DOM_SEP__AUTHWIT_INNER: u32 = 221354163;
pub global DOM_SEP__AUTHWIT_OUTER: u32 = 3283595782;

pub global DOM_SEP__APP_SILOED_ECDH_SHARED_SECRET: u32 = 1707851664;

pub global DOM_SEP__PARTIAL_NOTE_VALIDITY_COMMITMENT: u32 = 623934423;

// ---------------------------------------------------------------
// TODO(F-397): move these to aztec-nr, along with note hash, note nullifier, message nullifier and single use claim
// nullifier.

pub global DOM_SEP__PUBLIC_INITIALIZATION_NULLIFIER: u32 = 3342006647;
pub global DOM_SEP__PRIVATE_INITIALIZATION_NULLIFIER: u32 = 3990889078;

/// Domain separator for L1 to L2 message secret hashes.
pub global DOM_SEP__SECRET_HASH: u32 = 4199652938;

/// Domain separator for account contract payloads.
///
/// Used to check for authorization to execute a payload.
///
/// This is not technically a protocol constant as payload authorization is an account contract feature.
pub global DOM_SEP__SIGNATURE_PAYLOAD: u32 = 463525807;

// ---------------------------------------------------------------

pub global DOM_SEP__BLOCK_HEADERS_HASH: u32 = 515582467;

// Blob-related domain separators:
pub global DOM_SEP__BLOB_HASHED_Y_LIMBS: u32 = 2949331415;
pub global DOM_SEP__BLOB_CHALLENGE_Z: u32 = 60345710;
pub global DOM_SEP__BLOB_Z_ACC: u32 = 1003392952;
pub global DOM_SEP__BLOB_GAMMA_ACC: u32 = 855632775;
pub global DOM_SEP__BLOB_GAMMA_FINAL: u32 = 1755883835;

// ---------------------------------------------------------------

// TODO: Move this to bb's constant noir lib when created.
// AVM memory tags
pub global MEM_TAG_FF: Field = 0;
pub global MEM_TAG_U1: Field = 1;
pub global MEM_TAG_U8: Field = 2;
pub global MEM_TAG_U16: Field = 3;
pub global MEM_TAG_U32: Field = 4;
pub global MEM_TAG_U64: Field = 5;
pub global MEM_TAG_U128: Field = 6;

// AVM memory related constants
pub global AVM_HIGHEST_MEM_ADDRESS: u32 = MAX_U32_VALUE;
pub global AVM_MEMORY_NUM_BITS: u8 = 32;
pub global AVM_MEMORY_SIZE: u64 = 0x100000000;

// AVM bitwise operation IDs
// Note: these are all powers of 2 to allow for binary decomposition.
pub global AVM_BITWISE_AND_OP_ID: u8 = 1;
pub global AVM_BITWISE_OR_OP_ID: u8 = 2 * AVM_BITWISE_AND_OP_ID;
pub global AVM_BITWISE_XOR_OP_ID: u8 = 2 * AVM_BITWISE_OR_OP_ID;

// AVM Keccakf1600 specific constants
pub global AVM_KECCAKF1600_NUM_ROUNDS: u8 = 24;
pub global AVM_KECCAKF1600_STATE_SIZE: u8 = 25;

// Transaction Phase Values
pub global AVM_TX_PHASE_VALUE_START: u8 = 0;
pub global AVM_TX_PHASE_VALUE_SETUP: u8 = 3;
pub global AVM_TX_PHASE_VALUE_LAST: u8 = 11;

// Subtrace IDs.
// Execution, ALU, BITWISE and then we follow the order given by ExecutionOpCode enum.
// Note: these are all powers of 2 to allow for binary decomposition.
pub global AVM_SUBTRACE_ID_EXECUTION: u32 = 1;
pub global AVM_SUBTRACE_ID_ALU: u32 = 2 * AVM_SUBTRACE_ID_EXECUTION;
pub global AVM_SUBTRACE_ID_BITWISE: u32 = 2 * AVM_SUBTRACE_ID_ALU;
pub global AVM_SUBTRACE_ID_CAST: u32 = 2 * AVM_SUBTRACE_ID_BITWISE;
pub global AVM_SUBTRACE_ID_CALLDATA_COPY: u32 = 2 * AVM_SUBTRACE_ID_CAST;
pub global AVM_SUBTRACE_ID_RETURNDATA_COPY: u32 = 2 * AVM_SUBTRACE_ID_CALLDATA_COPY;
pub global AVM_SUBTRACE_ID_SET: u32 = 2 * AVM_SUBTRACE_ID_RETURNDATA_COPY;
pub global AVM_SUBTRACE_ID_GETCONTRACTINSTANCE: u32 = 2 * AVM_SUBTRACE_ID_SET;
pub global AVM_SUBTRACE_ID_EMITPUBLICLOG: u32 = 2 * AVM_SUBTRACE_ID_GETCONTRACTINSTANCE;
pub global AVM_SUBTRACE_ID_POSEIDON2_PERM: u32 = 2 * AVM_SUBTRACE_ID_EMITPUBLICLOG;
pub global AVM_SUBTRACE_ID_SHA256_COMPRESSION: u32 = 2 * AVM_SUBTRACE_ID_POSEIDON2_PERM;
pub global AVM_SUBTRACE_ID_KECCAKF1600: u32 = 2 * AVM_SUBTRACE_ID_SHA256_COMPRESSION;
pub global AVM_SUBTRACE_ID_ECC: u32 = 2 * AVM_SUBTRACE_ID_KECCAKF1600;
pub global AVM_SUBTRACE_ID_TO_RADIX: u32 = 2 * AVM_SUBTRACE_ID_ECC;

// Dynamic Gas Opcode IDs
// Note: these are all powers of 2 to allow for binary decomposition.
pub global AVM_DYN_GAS_ID_CALLDATACOPY: u32 = 1;
pub global AVM_DYN_GAS_ID_RETURNDATACOPY: u32 = 2 * AVM_DYN_GAS_ID_CALLDATACOPY;
pub global AVM_DYN_GAS_ID_TORADIX: u32 = 2 * AVM_DYN_GAS_ID_RETURNDATACOPY;
pub global AVM_DYN_GAS_ID_EMITPUBLICLOG: u32 = 2 * AVM_DYN_GAS_ID_TORADIX;
pub global AVM_DYN_GAS_ID_SSTORE: u32 = 2 * AVM_DYN_GAS_ID_EMITPUBLICLOG;

// Execution Opcode IDs
// Note: these are all powers of 2 to allow for binary decomposition.
pub global AVM_EXEC_OP_ID_GETENVVAR: u32 = 1;
pub global AVM_EXEC_OP_ID_MOV: u32 = 2 * AVM_EXEC_OP_ID_GETENVVAR;
pub global AVM_EXEC_OP_ID_JUMP: u32 = 2 * AVM_EXEC_OP_ID_MOV;
pub global AVM_EXEC_OP_ID_JUMPI: u32 = 2 * AVM_EXEC_OP_ID_JUMP;
pub global AVM_EXEC_OP_ID_CALL: u32 = 2 * AVM_EXEC_OP_ID_JUMPI;
pub global AVM_EXEC_OP_ID_STATICCALL: u32 = 2 * AVM_EXEC_OP_ID_CALL;
pub global AVM_EXEC_OP_ID_INTERNALCALL: u32 = 2 * AVM_EXEC_OP_ID_STATICCALL;
pub global AVM_EXEC_OP_ID_INTERNALRETURN: u32 = 2 * AVM_EXEC_OP_ID_INTERNALCALL;
pub global AVM_EXEC_OP_ID_RETURN: u32 = 2 * AVM_EXEC_OP_ID_INTERNALRETURN;
pub global AVM_EXEC_OP_ID_REVERT: u32 = 2 * AVM_EXEC_OP_ID_RETURN;
pub global AVM_EXEC_OP_ID_SUCCESSCOPY: u32 = 2 * AVM_EXEC_OP_ID_REVERT;
pub global AVM_EXEC_OP_ID_RETURNDATASIZE: u32 = 2 * AVM_EXEC_OP_ID_SUCCESSCOPY;
pub global AVM_EXEC_OP_ID_DEBUGLOG: u32 = 2 * AVM_EXEC_OP_ID_RETURNDATASIZE;
pub global AVM_EXEC_OP_ID_SLOAD: u32 = 2 * AVM_EXEC_OP_ID_DEBUGLOG;
pub global AVM_EXEC_OP_ID_SSTORE: u32 = 2 * AVM_EXEC_OP_ID_SLOAD;
pub global AVM_EXEC_OP_ID_NOTEHASH_EXISTS: u32 = 2 * AVM_EXEC_OP_ID_SSTORE;
pub global AVM_EXEC_OP_ID_EMIT_NOTEHASH: u32 = 2 * AVM_EXEC_OP_ID_NOTEHASH_EXISTS;
pub global AVM_EXEC_OP_ID_L1_TO_L2_MESSAGE_EXISTS: u32 = 2 * AVM_EXEC_OP_ID_EMIT_NOTEHASH;
pub global AVM_EXEC_OP_ID_NULLIFIER_EXISTS: u32 = 2 * AVM_EXEC_OP_ID_L1_TO_L2_MESSAGE_EXISTS;
pub global AVM_EXEC_OP_ID_EMIT_NULLIFIER: u32 = 2 * AVM_EXEC_OP_ID_NULLIFIER_EXISTS;
pub global AVM_EXEC_OP_ID_SENDL2TOL1MSG: u32 = 2 * AVM_EXEC_OP_ID_EMIT_NULLIFIER;

// Execution Opcode IDs for the ALU subtrace
// Note: these are all powers of 2 to allow for binary decomposition.
pub global AVM_EXEC_OP_ID_ALU_ADD: u32 = 1;
pub global AVM_EXEC_OP_ID_ALU_SUB: u32 = 2 * AVM_EXEC_OP_ID_ALU_ADD;
pub global AVM_EXEC_OP_ID_ALU_MUL: u32 = 2 * AVM_EXEC_OP_ID_ALU_SUB;
pub global AVM_EXEC_OP_ID_ALU_DIV: u32 = 2 * AVM_EXEC_OP_ID_ALU_MUL;
pub global AVM_EXEC_OP_ID_ALU_FDIV: u32 = 2 * AVM_EXEC_OP_ID_ALU_DIV;
pub global AVM_EXEC_OP_ID_ALU_EQ: u32 = 2 * AVM_EXEC_OP_ID_ALU_FDIV;
pub global AVM_EXEC_OP_ID_ALU_LT: u32 = 2 * AVM_EXEC_OP_ID_ALU_EQ;
pub global AVM_EXEC_OP_ID_ALU_LTE: u32 = 2 * AVM_EXEC_OP_ID_ALU_LT;
pub global AVM_EXEC_OP_ID_ALU_NOT: u32 = 2 * AVM_EXEC_OP_ID_ALU_LTE;
pub global AVM_EXEC_OP_ID_ALU_SHL: u32 = 2 * AVM_EXEC_OP_ID_ALU_NOT;
pub global AVM_EXEC_OP_ID_ALU_SHR: u32 = 2 * AVM_EXEC_OP_ID_ALU_SHL;
pub global AVM_EXEC_OP_ID_ALU_TRUNCATE: u32 = 2 * AVM_EXEC_OP_ID_ALU_SHR;

// AvmCircuitPublicInputs - row indices
// Global Variables
// start alias
pub global AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_ROW_IDX: u32 = 0;
// members
pub global AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_CHAIN_ID_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_ROW_IDX;
pub global AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_VERSION_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_CHAIN_ID_ROW_IDX + 1;
pub global AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_BLOCK_NUMBER_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_VERSION_ROW_IDX + 1;
pub global AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_SLOT_NUMBER_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_BLOCK_NUMBER_ROW_IDX + 1;
pub global AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_TIMESTAMP_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_SLOT_NUMBER_ROW_IDX + 1;
pub global AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_COINBASE_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_TIMESTAMP_ROW_IDX + 1;
pub global AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_FEE_RECIPIENT_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_COINBASE_ROW_IDX + 1;
pub global AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_FEE_RECIPIENT_ROW_IDX + 1;
// Note: gas fees ^, despite being 2 entries, is split across 2 columns. So wee only bump by 1 (below) to progress.
// Start Protocol Contracts
pub global AVM_PUBLIC_INPUTS_PROTOCOL_CONTRACTS_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX + 1;

// Start Tree Snapshots
// start alias
pub global AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_PROTOCOL_CONTRACTS_ROW_IDX + MAX_PROTOCOL_CONTRACTS;
// Note: each tree snapshot ^, despite being 2 entries (root, index), is split across 2 columns. So we only bump by 1 (below) to progress.
// members
pub global AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_ROW_IDX;
pub global AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX + 1;
pub global AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX + 1;
pub global AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX + 1;

// Start Gas Used
pub global AVM_PUBLIC_INPUTS_START_GAS_USED_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX + 1;
// Note: gas used ^, despite being 2 entries, is split across 2 columns. So we only bump by 1 (below) to progress.

// Gas Settings
pub global AVM_PUBLIC_INPUTS_GAS_SETTINGS_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_START_GAS_USED_ROW_IDX + 1;
pub global AVM_PUBLIC_INPUTS_GAS_SETTINGS_GAS_LIMITS_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_GAS_SETTINGS_ROW_IDX;
pub global AVM_PUBLIC_INPUTS_GAS_SETTINGS_TEARDOWN_GAS_LIMITS_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_GAS_SETTINGS_GAS_LIMITS_ROW_IDX + 1;
pub global AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_FEES_PER_GAS_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_GAS_SETTINGS_TEARDOWN_GAS_LIMITS_ROW_IDX + 1;
pub global AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_PRIORITY_FEES_PER_GAS_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_FEES_PER_GAS_ROW_IDX + 1;
// Note: each of these gas settings ^, despite being 2 entries each, are split across 2 columns. So we only bump by 1 for each.

// Effective Gas Fees
pub global AVM_PUBLIC_INPUTS_EFFECTIVE_GAS_FEES_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_PRIORITY_FEES_PER_GAS_ROW_IDX + 1;

// Fee Payer
pub global AVM_PUBLIC_INPUTS_FEE_PAYER_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_EFFECTIVE_GAS_FEES_ROW_IDX + 1;

// Prover ID
pub global AVM_PUBLIC_INPUTS_PROVER_ID_ROW_IDX: u32 = AVM_PUBLIC_INPUTS_FEE_PAYER_ROW_IDX + 1;

// Public Call Request Array Lengths
pub global AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_PROVER_ID_ROW_IDX + 1;
pub global AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_SETUP_CALLS_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_ROW_IDX;
pub global AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_APP_LOGIC_CALLS_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_SETUP_CALLS_ROW_IDX + 1;
pub global AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_TEARDOWN_CALL_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_APP_LOGIC_CALLS_ROW_IDX + 1;

// Public Setup Call Requests
// Note: PublicCallRequests are a few entries, but are split across multiple columns so that they consume 1 row each.
// So we only bump by 1 (below) to progress.
pub global AVM_PUBLIC_INPUTS_PUBLIC_SETUP_CALL_REQUESTS_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_TEARDOWN_CALL_ROW_IDX + 1;
// Public App Logic Call Requests
pub global AVM_PUBLIC_INPUTS_PUBLIC_APP_LOGIC_CALL_REQUESTS_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_PUBLIC_SETUP_CALL_REQUESTS_ROW_IDX + MAX_ENQUEUED_CALLS_PER_TX;
// Public Teardown Call Request (just 1)
pub global AVM_PUBLIC_INPUTS_PUBLIC_TEARDOWN_CALL_REQUEST_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_PUBLIC_APP_LOGIC_CALL_REQUESTS_ROW_IDX + MAX_ENQUEUED_CALLS_PER_TX;

// Previous Non-Revertible Accumulated Data Array Lengths
pub global AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_PUBLIC_TEARDOWN_CALL_REQUEST_ROW_IDX + 1;
pub global AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX;
pub global AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX: u32 = AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX
    + 1;
pub global AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX + 1;

// Previous Revertible Accumulated Data Array Lengths
pub global AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX: u32 = AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX
    + 1;
pub global AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX;
pub global AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX + 1;
pub global AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX + 1;

// Previous Non-Revertible Accumulated Data
// start alias
pub global AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX + 1;
// members
pub global AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ROW_IDX;
pub global AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX: u32 = AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX
    + MAX_NOTE_HASHES_PER_TX;
pub global AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX: u32 = AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX
    + MAX_NULLIFIERS_PER_TX;

// Previous Revertible Accumulated Data
// start alias
pub global AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ROW_IDX: u32 = AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX
    + MAX_L2_TO_L1_MSGS_PER_TX;
// members
pub global AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ROW_IDX;
pub global AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX: u32 = AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX
    + MAX_NOTE_HASHES_PER_TX;
pub global AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX: u32 = AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX
    + MAX_NULLIFIERS_PER_TX;

// End Tree Snapshots
// start alias
pub global AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_ROW_IDX: u32 = AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX
    + MAX_L2_TO_L1_MSGS_PER_TX;
// Note: each tree snapshot ^, despite being 2 entries (root, index), is split across 2 columns. So we only bump by 1 (below) to progress.
// members
pub global AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_ROW_IDX;
pub global AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX + 1;
pub global AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX + 1;
pub global AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX + 1;

// End Gas Used
pub global AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX + 1;

// AVM Accumulated Data Array Lengths
pub global AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX + 1;
pub global AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX;
pub global AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX + 1;
pub global AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX + 1;
pub global AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_PUBLIC_DATA_WRITES_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX + 1;

// AVM Accumulated Data
pub global AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_PUBLIC_DATA_WRITES_ROW_IDX + 1;
pub global AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ROW_IDX;
pub global AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX + MAX_NOTE_HASHES_PER_TX;
pub global AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX + MAX_NULLIFIERS_PER_TX;
pub global AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_LOGS_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + MAX_L2_TO_L1_MSGS_PER_TX;
pub global AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_DATA_WRITES_ROW_IDX: u32 =
    AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_LOGS_ROW_IDX + PUBLIC_LOGS_LENGTH;

// End transaction fee
pub global AVM_PUBLIC_INPUTS_TRANSACTION_FEE_ROW_IDX: u32 = AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_DATA_WRITES_ROW_IDX
    + MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX;

// End reverted
pub global AVM_PUBLIC_INPUTS_REVERTED_ROW_IDX: u32 = AVM_PUBLIC_INPUTS_TRANSACTION_FEE_ROW_IDX + 1;

// AVM's max public input column size (aka total number of rows). This is the length of column 0,
// which is the longest column, and also the extent of the public_inputs `sel` selector.
pub global AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH: u32 = AVM_PUBLIC_INPUTS_REVERTED_ROW_IDX + 1;
pub global AVM_NUM_PUBLIC_INPUT_COLUMNS: u32 = 4;

// Per-column lengths: the exact number of rows used by each public input column, equal to
// (last row index that writes the column) + 1. Column 0 spans the full table; columns 1-3 are
// shorter, so the recursive verifier avoids hashing / MLE-evaluating their trailing zeros.
// IMPORTANT: revisit these if the column layout (see public_inputs.pil / to_columns) changes
// which column holds its last written cell.
pub global AVM_PUBLIC_INPUTS_COLUMN_0_LENGTH: u32 = AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH; // last: reverted
pub global AVM_PUBLIC_INPUTS_COLUMN_1_LENGTH: u32 = AVM_PUBLIC_INPUTS_TRANSACTION_FEE_ROW_IDX; // last: public_data_writes value
pub global AVM_PUBLIC_INPUTS_COLUMN_2_LENGTH: u32 =
    AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_LOGS_ROW_IDX; // last: accumulated l2_to_l1 contract_address
pub global AVM_PUBLIC_INPUTS_COLUMN_3_LENGTH: u32 =
    AVM_PUBLIC_INPUTS_PUBLIC_TEARDOWN_CALL_REQUEST_ROW_IDX + 1; // last: teardown calldata_hash

// Combined size of the AVM's public input columns concatenated together
pub global AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH: u32 = AVM_PUBLIC_INPUTS_COLUMN_0_LENGTH
    + AVM_PUBLIC_INPUTS_COLUMN_1_LENGTH
    + AVM_PUBLIC_INPUTS_COLUMN_2_LENGTH
    + AVM_PUBLIC_INPUTS_COLUMN_3_LENGTH;

// AVM_V2_PROOF_LENGTH_IN_FIELDS must be updated when AVM circuit changes.
// Run barretenberg/cpp/scripts/bump_avm_proof_length.sh, to regenerate the constants
pub global AVM_V2_PROOF_LENGTH_IN_FIELDS: u32 = 14532;

// GAS DEFAULTS
pub global DA_BYTES_PER_FIELD: u32 = 32;
pub global DA_GAS_PER_BYTE: u32 = 1; // Arbitrary.
pub global DA_GAS_PER_FIELD: u32 = DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE;
// A tx always emits 3 fields: tx_start_marker, tx_hash, and tx_fee.
pub global TX_DA_GAS_OVERHEAD: u32 = 3 * DA_GAS_PER_FIELD;
pub global MAX_TX_BLOB_DATA_SIZE_IN_FIELDS: u32 = 1 // tx start marker
    + 1 // tx hash
    + 1 // transaction fee
    + MAX_NOTE_HASHES_PER_TX
    + MAX_NULLIFIERS_PER_TX
    + MAX_L2_TO_L1_MSGS_PER_TX
    + MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX * 2 // (*2 for leaf slot and value)
    + MAX_PRIVATE_LOGS_PER_TX * (PRIVATE_LOG_SIZE_IN_FIELDS + 1) // (+1 for log length)
    + FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH
    + MAX_CONTRACT_CLASS_LOGS_PER_TX * (CONTRACT_CLASS_LOG_SIZE_IN_FIELDS + 1); // (+1 for contract address)
// Computed taking into account simulation time metrics.
pub global PUBLIC_TX_L2_GAS_OVERHEAD: u32 = 540000;
pub global PRIVATE_TX_L2_GAS_OVERHEAD: u32 = 440000;
// base cost for a single public call
pub global FIXED_AVM_STARTUP_L2_GAS: u32 = 20_000;

// The maximum amount of l2 gas that the AVM can process safely.
pub global AVM_MAX_PROCESSABLE_L2_GAS: u32 = 6_000_000; // Arbitrary.
// The following limit assumes that a private only tx will always be cheaper than a tx with a full public component.
pub global MAX_PROCESSABLE_L2_GAS: u32 = PUBLIC_TX_L2_GAS_OVERHEAD + AVM_MAX_PROCESSABLE_L2_GAS;

pub global MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT: u32 =
    BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB * DA_GAS_PER_FIELD;

// Some tree insertions incur an additional cost associated with
// the new database entry to be stored by all network participants.
pub global L2_GAS_DISTRIBUTED_STORAGE_PREMIUM: u32 = 1024;

// AVM - misc constants
pub global AVM_PC_SIZE_IN_BITS: u32 = 32;
pub global AVM_MAX_OPERANDS: u32 = 5;
pub global AVM_MAX_REGISTERS: u32 = 4;

/**
 * GAS COSTS FOR AVM OPCODES
 * They are used in TS and C++
 */

// Addressing gas
pub global AVM_ADDRESSING_BASE_RESOLUTION_L2_GAS: u32 = 3; // One mem access
pub global AVM_ADDRESSING_INDIRECT_L2_GAS: u32 = 3; // One mem access
pub global AVM_ADDRESSING_RELATIVE_L2_GAS: u32 = 3; // One range check

// Base L2 GAS
// Based on simulation time metrics
pub global L2_GAS_PER_NOTE_HASH: u32 = 9200; // Bounded by long term storage requirements.
pub global L2_GAS_PER_NULLIFIER: u32 = 16000;
pub global L2_GAS_PER_L2_TO_L1_MSG: u32 = 5200;
pub global L2_GAS_PER_PRIVATE_LOG: u32 = 2500;
pub global L2_GAS_PER_CONTRACT_CLASS_LOG: u32 = 73000;
// Note: magic numbers here are derived from each op's AVM circuit trace area
// https://docs.google.com/spreadsheets/d/1FPyLfJFPOfZTmZC-T6b_4yB5dSrOAofz3dufte23_TA/edit?usp=sharing
// Some have a "SLOW_SIM_MUL" multiplier because they are slower to simulate and their trace-area-derived gas cost
// is not sufficient to cover the simulation effort.
pub global AVM_ADD_BASE_L2_GAS: u32 = 12;
pub global AVM_SUB_BASE_L2_GAS: u32 = 12;
pub global AVM_MUL_BASE_L2_GAS: u32 = 27;
pub global AVM_DIV_BASE_L2_GAS: u32 = 27;
pub global AVM_FDIV_BASE_L2_GAS: u32 = 9 * 25; // SLOW_SIM_MUL = 25
pub global AVM_EQ_BASE_L2_GAS: u32 = 12;
pub global AVM_LT_BASE_L2_GAS: u32 = 42;
pub global AVM_LTE_BASE_L2_GAS: u32 = 42;
pub global AVM_AND_BASE_L2_GAS: u32 = 12;
pub global AVM_OR_BASE_L2_GAS: u32 = 12;
pub global AVM_XOR_BASE_L2_GAS: u32 = 12;
pub global AVM_NOT_BASE_L2_GAS: u32 = 12;
pub global AVM_SHL_BASE_L2_GAS: u32 = 18;
pub global AVM_SHR_BASE_L2_GAS: u32 = 18;
pub global AVM_CAST_BASE_L2_GAS: u32 = 27;
pub global AVM_GETENVVAR_BASE_L2_GAS: u16 = 12;
pub global AVM_CALLDATACOPY_BASE_L2_GAS: u32 = 18;
pub global AVM_SUCCESSCOPY_BASE_L2_GAS: u32 = 12;
pub global AVM_RETURNDATASIZE_BASE_L2_GAS: u32 = 12;
pub global AVM_RETURNDATACOPY_BASE_L2_GAS: u32 = 18;
pub global AVM_JUMP_BASE_L2_GAS: u32 = 9;
pub global AVM_JUMPI_BASE_L2_GAS: u32 = 9;
pub global AVM_INTERNALCALL_BASE_L2_GAS: u32 = 9;
pub global AVM_INTERNALRETURN_BASE_L2_GAS: u32 = 9;
pub global AVM_SET_BASE_L2_GAS: u32 = 27;
pub global AVM_MOV_BASE_L2_GAS: u32 = 12;
pub global AVM_SLOAD_BASE_L2_GAS: u32 = 129 * 10; // SLOW_SIM_MUL = 10
pub global AVM_SSTORE_BASE_L2_GAS: u32 = (633 + L2_GAS_DISTRIBUTED_STORAGE_PREMIUM) * 20; // SLOW_SIM_MUL = 20
pub global AVM_NOTEHASHEXISTS_BASE_L2_GAS: u32 = 126 * 4; // SLOW_SIM_MUL = 3 (+1 for slow proving)
pub global AVM_EMITNOTEHASH_BASE_L2_GAS: u32 = (261 + L2_GAS_DISTRIBUTED_STORAGE_PREMIUM) * 15; // SLOW_SIM_MUL = 15
pub global AVM_NULLIFIEREXISTS_BASE_L2_GAS: u32 = 129 * 7; // SLOW_SIM_MUL = 6 (+1 for slow proving)
pub global AVM_EMITNULLIFIER_BASE_L2_GAS: u32 = (516 + L2_GAS_DISTRIBUTED_STORAGE_PREMIUM) * 20; // SLOW_SIM_MUL = 20
pub global AVM_L1TOL2MSGEXISTS_BASE_L2_GAS: u32 = 108 * 5; // SLOW_SIM_MUL = 4 (+1 for slow proving)
pub global AVM_GETCONTRACTINSTANCE_BASE_L2_GAS: u32 = 1527 * 4; // SLOW_SIM_MUL = 4
pub global AVM_EMITPUBLICLOG_BASE_L2_GAS: u32 = 15;
pub global AVM_SENDL2TOL1MSG_BASE_L2_GAS: u32 = 39 + L2_GAS_PER_L2_TO_L1_MSG;
// See PR https://github.com/AztecProtocol/aztec-packages/pull/15495 on why we need this buffer.
pub global AVM_CALL_BASE_L2_GAS: u32 = 3312 * 3; // SLOW_SIM_MUL = 3
pub global AVM_STATICCALL_BASE_L2_GAS: u32 = 3312 * 3; // SLOW_SIM_MUL = 3
pub global AVM_RETURN_BASE_L2_GAS: u32 = 9;
pub global AVM_REVERT_BASE_L2_GAS: u32 = 9;
pub global AVM_DEBUGLOG_BASE_L2_GAS: u32 = 9;
pub global AVM_POSEIDON2_BASE_L2_GAS: u32 = 24 * 15; // SLOW_SIM_MUL = 15
pub global AVM_SHA256COMPRESSION_BASE_L2_GAS: u32 = 12288;
pub global AVM_KECCAKF1600_BASE_L2_GAS: u32 = 58176;
pub global AVM_ECADD_BASE_L2_GAS: u32 = 18 * 10; // SLOW_SIM_MUL = 10
pub global AVM_TORADIXBE_BASE_L2_GAS: u32 = 24;

// Dynamic L2 GAS
pub global AVM_CALLDATACOPY_DYN_L2_GAS: u32 = 6;
pub global AVM_RETURNDATACOPY_DYN_L2_GAS: u32 = 6;
pub global AVM_TORADIXBE_DYN_L2_GAS: u32 = 3;
pub global AVM_EMITPUBLICLOG_DYN_L2_GAS: u32 = 3;

// Base DA Gas
pub global AVM_EMITNOTEHASH_BASE_DA_GAS: u32 = DA_GAS_PER_FIELD;
pub global AVM_EMITNULLIFIER_BASE_DA_GAS: u32 = DA_GAS_PER_FIELD;
pub global AVM_SENDL2TOL1MSG_BASE_DA_GAS: u32 = DA_GAS_PER_FIELD;
pub global AVM_EMITPUBLICLOG_BASE_DA_GAS: u32 = 2 * DA_GAS_PER_FIELD; // length and address

// Dynamic DA Gas
// a single increment here corresponds to an entire additional field (hence x32 bytes per field)
pub global AVM_EMITPUBLICLOG_DYN_DA_GAS: u32 = DA_GAS_PER_FIELD;
// Gets multiplied by 1 if actually publishing, 0 if not. 2 because of it being (slot, value) pair
pub global AVM_SSTORE_DYN_DA_GAS: u32 = 2 * DA_GAS_PER_FIELD;

// BLOB PREFIXES
// Used when decoding blobs of tightly packed effects
// See ./constants_tests.nr for how the values are generated.
pub global TX_START_PREFIX: Field = 0x9c707518;
pub global BLOCK_END_PREFIX: Field = 0xeb8dcdbf;
pub global CHECKPOINT_END_PREFIX: Field = 0x8c637443;

// Constants related to proof type of a recursive proof verification.
// Keep following constants in sync with the enum acir_format::PROOF_TYPE in recursion_constraint.hpp
// TODO: Move to BB noir constants lib
pub global PROOF_TYPE_HONK: u32 = 0;
pub global PROOF_TYPE_OINK: u32 = 1;
pub global PROOF_TYPE_HN: u32 = 2;
pub global PROOF_TYPE_AVM: u32 = 3;
pub global PROOF_TYPE_ROLLUP_HONK: u32 = 4;
pub global PROOF_TYPE_ROOT_ROLLUP_HONK: u32 = 5;
// worktodo comment here where 6 is
pub global PROOF_TYPE_HN_FINAL: u32 = 7;
pub global PROOF_TYPE_CHONK: u32 = 8;

// TODO: Make it 1_u128 << 64 as Field without breaking TS constants generator
pub global TWO_POW_64: Field = 18446744073709551616;
// AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_HEIGHT = CEIL(LOG2(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX + 1))
// +1 due to the tree prefill
// TODO: Move inside BB noir constants lib
pub global AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_HEIGHT: u32 = 6;
pub global AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_INITIAL_ROOT: Field =
    0x13954b76f8ab76c38ab687731f802fc90e5d55e0592fa6f56d0a73024b3f8356;
pub global AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_INITIAL_SIZE: u32 = 1;
// AVM_RETRIEVED_BYTECODES_TREE_HEIGHT = CEIL(LOG2(MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS + 1))
// +1 due to the tree prefill
pub global AVM_RETRIEVED_BYTECODES_TREE_HEIGHT: u32 = 5;
pub global AVM_RETRIEVED_BYTECODES_TREE_INITIAL_ROOT: Field =
    0x0ff65ad321f05745d4c80e2e18e94241093d2e49017ff8cc151df4f207a43c12;
pub global AVM_RETRIEVED_BYTECODES_TREE_INITIAL_SIZE: u32 = 1;

// Note that by casting timestamp to u32 we make this explode in year 2106. We do not care.
pub global TIMESTAMP_OF_CHANGE_BIT_SIZE: u32 = 32;

// The default update delay used when a contract does not explicitly specify one.
// Note: This value should match MAX_TX_LIFETIME, because if no custom update delay is set during tx
// execution, the `expiration_timestamp` for the contract updates will be computed using this value. And it should not
// differ from the maximum allowed duration.
pub global DEFAULT_UPDATE_DELAY: u64 = MAX_TX_LIFETIME;
// 10 minutes
pub global MINIMUM_UPDATE_DELAY: u64 = 600;

// Updates hold contract class id, which fit in 1 field.
pub global UPDATES_VALUE_SIZE: u32 = 1;
pub global UPDATES_DELAYED_PUBLIC_MUTABLE_VALUES_LEN: u32 = 2 * UPDATES_VALUE_SIZE + 1;

// These bit sizes are used in PIL. If need change, consult with the AVM team.
pub global UPDATES_DELAYED_PUBLIC_MUTABLE_SDC_DELAY_BIT_SIZE: u32 = 32;
pub global UPDATES_DELAYED_PUBLIC_MUTABLE_SDC_IS_SOME_BIT_SIZE: u32 = 8;
pub global UPDATES_DELAYED_PUBLIC_MUTABLE_SDC_OPTION_DELAY_BIT_SIZE: u32 = UPDATES_DELAYED_PUBLIC_MUTABLE_SDC_DELAY_BIT_SIZE
    + UPDATES_DELAYED_PUBLIC_MUTABLE_SDC_IS_SOME_BIT_SIZE;
pub global UPDATES_DELAYED_PUBLIC_MUTABLE_METADATA_BIT_SIZE: u32 =
    UPDATES_DELAYED_PUBLIC_MUTABLE_SDC_OPTION_DELAY_BIT_SIZE * 2 + TIMESTAMP_OF_CHANGE_BIT_SIZE * 2;

pub global GRUMPKIN_ONE_X: Field = 1;
pub global GRUMPKIN_ONE_Y: Field = 17631683881184975370165255887551781615748388533673675138860;

mod test {
    use crate::constants::{
        AVM_RETRIEVED_BYTECODES_TREE_HEIGHT, AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_HEIGHT,
        EMPTY_EPOCH_OUT_HASH, GLOBAL_INDEX_CONTRACT_CLASS_LOG_HASH_OFFSET,
        GLOBAL_INDEX_L2_TO_L1_MSG_OFFSET, GLOBAL_INDEX_NOTE_HASH_OFFSET,
        GLOBAL_INDEX_NOTE_HASH_READ_REQUEST_OFFSET, GLOBAL_INDEX_NULLIFIER_OFFSET,
        GLOBAL_INDEX_NULLIFIER_READ_REQUEST_OFFSET, GLOBAL_INDEX_PRIVATE_CALL_REQUEST_END_OFFSET,
        GLOBAL_INDEX_PRIVATE_CALL_REQUEST_START_OFFSET, GLOBAL_INDEX_PRIVATE_LOG_OFFSET,
        GLOBAL_INDEX_PUBLIC_CALL_REQUEST_OFFSET, MAX_CHECKPOINTS_PER_EPOCH,
        MAX_CONTRACT_CLASS_LOGS_PER_CALL, MAX_ENQUEUED_CALLS_PER_CALL, MAX_ETH_ADDRESS_BIT_SIZE,
        MAX_L2_TO_L1_MSGS_PER_CALL, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, MAX_NOTE_HASHES_PER_CALL,
        MAX_NULLIFIER_READ_REQUESTS_PER_CALL, MAX_NULLIFIERS_PER_CALL,
        MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL, MAX_PRIVATE_LOGS_PER_CALL, MAX_PROTOCOL_CONTRACTS,
        MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
        OUT_HASH_TREE_HEIGHT, OUT_HASH_TREE_LEAF_COUNT, SIDE_EFFECT_MASKING_ADDRESS,
    };
    use crate::merkle_tree::root::compute_empty_sha_tree_root;
    use crate::traits::ToField;
    use super::{
        GLOBAL_INDEX_CONTRACT_MIN_REVERTIBLE_SIDE_EFFECT_COUNTER_OFFSET, INBOX_PARITY_SIZE_LARGE,
        MAX_ETH_ADDRESS_VALUE, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
        TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL,
    };

    #[test]
    fn test_grumpkin_point() {
        assert_eq(
            super::GRUMPKIN_ONE_X,
            std::embedded_curve_ops::EmbeddedCurvePoint::generator().x,
        );
        assert_eq(
            super::GRUMPKIN_ONE_Y,
            std::embedded_curve_ops::EmbeddedCurvePoint::generator().y,
        );
    }

    #[test]
    fn test_avm_written_public_data_slots_tree_height() {
        assert_eq(
            1 << AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_HEIGHT,
            MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX + 1,
        );
    }

    #[test]
    fn test_avm_retrieved_bytecodes_tree_height() {
        assert(
            1 << AVM_RETRIEVED_BYTECODES_TREE_HEIGHT
                >= MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS + 1,
        );
        assert(
            1 << (AVM_RETRIEVED_BYTECODES_TREE_HEIGHT - 1)
                < MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS + 1,
        );
    }

    #[test]
    fn test_side_effect_masking_address() {
        assert(
            (MAX_PROTOCOL_CONTRACTS as Field).lt(SIDE_EFFECT_MASKING_ADDRESS.to_field()),
            "Side effect masking address cannot overlap with protocol contract addresses",
        );
    }

    #[test]
    fn parity_covers_all_l1_to_l2_msgs() {
        // The largest InboxParity rung must be able to hold a full checkpoint's worth of messages.
        assert_eq(INBOX_PARITY_SIZE_LARGE, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
    }

    #[test]
    fn validate_global_indexes() {
        let sequence = [
            (GLOBAL_INDEX_NOTE_HASH_READ_REQUEST_OFFSET, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL),
            (GLOBAL_INDEX_NULLIFIER_READ_REQUEST_OFFSET, MAX_NULLIFIER_READ_REQUESTS_PER_CALL),
            (GLOBAL_INDEX_NOTE_HASH_OFFSET, MAX_NOTE_HASHES_PER_CALL),
            (GLOBAL_INDEX_NULLIFIER_OFFSET, MAX_NULLIFIERS_PER_CALL),
            (
                GLOBAL_INDEX_PRIVATE_CALL_REQUEST_START_OFFSET,
                MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL,
            ),
            (GLOBAL_INDEX_PRIVATE_CALL_REQUEST_END_OFFSET, MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL),
            (GLOBAL_INDEX_PUBLIC_CALL_REQUEST_OFFSET, MAX_ENQUEUED_CALLS_PER_CALL),
            (GLOBAL_INDEX_L2_TO_L1_MSG_OFFSET, MAX_L2_TO_L1_MSGS_PER_CALL),
            (GLOBAL_INDEX_PRIVATE_LOG_OFFSET, MAX_PRIVATE_LOGS_PER_CALL),
            (GLOBAL_INDEX_CONTRACT_CLASS_LOG_HASH_OFFSET, MAX_CONTRACT_CLASS_LOGS_PER_CALL),
            (GLOBAL_INDEX_CONTRACT_MIN_REVERTIBLE_SIDE_EFFECT_COUNTER_OFFSET, 1),
        ];

        let mut last_offset = 0;
        for i in 0..sequence.len() {
            let (offset, count) = sequence[i];
            assert_eq(offset, last_offset);
            last_offset += count;
        }
        assert_eq(last_offset, TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL);
    }

    #[test]
    fn validate_out_hash_tree_height() {
        assert_eq(OUT_HASH_TREE_LEAF_COUNT, 1 << OUT_HASH_TREE_HEIGHT);
        assert(OUT_HASH_TREE_LEAF_COUNT >= MAX_CHECKPOINTS_PER_EPOCH);
        assert(
            MAX_CHECKPOINTS_PER_EPOCH * 2 > OUT_HASH_TREE_LEAF_COUNT,
            "We can get away with making the out hash tree smaller",
        );
    }

    #[test]
    fn validate_empty_epoch_out_hash() {
        let empty_root = compute_empty_sha_tree_root::<OUT_HASH_TREE_HEIGHT>();
        assert_eq(empty_root, EMPTY_EPOCH_OUT_HASH);
    }

    #[test]
    fn validate_max_eth_address_value() {
        MAX_ETH_ADDRESS_VALUE.assert_max_bit_size::<MAX_ETH_ADDRESS_BIT_SIZE>();
    }

    #[test(should_fail_with = "call to assert_max_bit_size")]
    fn validate_max_eth_address_value_negative() {
        (MAX_ETH_ADDRESS_VALUE + 1).assert_max_bit_size::<MAX_ETH_ADDRESS_BIT_SIZE>();
    }

}
