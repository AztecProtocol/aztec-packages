/* eslint-disable */
// GENERATED FILE - DO NOT EDIT, RUN yarn remake-constants
export const ARGS_LENGTH = 16;
export const RETURN_VALUES_LENGTH = 4;
export const READ_REQUESTS_LENGTH = 4;
export const MAX_NEW_COMMITMENTS_PER_CALL = 4;
export const MAX_NEW_NULLIFIERS_PER_CALL = 4;
export const MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL = 4;
export const MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL = 4;
export const MAX_NEW_L2_TO_L1_MSGS_PER_CALL = 2;
export const MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL = 4;
export const MAX_PUBLIC_DATA_READS_PER_CALL = 4;
export const MAX_NEW_COMMITMENTS_PER_TX = 16;
export const MAX_NEW_NULLIFIERS_PER_TX = 16;
export const MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX = 8;
export const MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX = 8;
export const MAX_NEW_L2_TO_L1_MSGS_PER_TX = 2;
export const MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX = 4;
export const MAX_PUBLIC_DATA_READS_PER_TX = 4;
export const MAX_NEW_CONTRACTS_PER_TX = 1;
export const MAX_OPTIONALLY_REVEALED_DATA_LENGTH_PER_TX = 4;
export const NUM_ENCRYPTED_LOGS_HASHES_PER_TX = 1;
export const NUM_UNENCRYPTED_LOGS_HASHES_PER_TX = 1;
export const NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP = 16;
export const KERNELS_PER_ROLLUP = 2;
export const VK_TREE_HEIGHT = 3;
export const FUNCTION_TREE_HEIGHT = 4;
export const CONTRACT_TREE_HEIGHT = 16;
export const PRIVATE_DATA_TREE_HEIGHT = 32;
export const PUBLIC_DATA_TREE_HEIGHT = 254;
export const NULLIFIER_TREE_HEIGHT = 16;
export const L1_TO_L2_MSG_TREE_HEIGHT = 16;
export const PRIVATE_DATA_TREE_ROOTS_TREE_HEIGHT = 16;
export const CONTRACT_TREE_ROOTS_TREE_HEIGHT = 16;
export const L1_TO_L2_MSG_TREE_ROOTS_TREE_HEIGHT = 16;
export const ROLLUP_VK_TREE_HEIGHT = 8;
export const CONTRACT_SUBTREE_HEIGHT = 1;
export const CONTRACT_SUBTREE_SIBLING_PATH_LENGTH = 15;
export const PRIVATE_DATA_SUBTREE_HEIGHT = 5;
export const PRIVATE_DATA_SUBTREE_SIBLING_PATH_LENGTH = 27;
export const NULLIFIER_SUBTREE_HEIGHT = 5;
export const NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH = 11;
export const L1_TO_L2_MSG_SUBTREE_HEIGHT = 4;
export const L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH = 12;
export const FUNCTION_SELECTOR_NUM_BYTES = 4;
export const MAPPING_SLOT_PEDERSEN_SEPARATOR = 4;
export const NUM_FIELDS_PER_SHA256 = 2;

/**
 * Enumerate the hash_indices which are used for pedersen hashing.
 * We start from 1 to avoid the default generators. The generator indices are listed
 * based on the number of elements each index hashes. The following conditions must be met:
 *
 * +-----------+-------------------------------+----------------------+
 * | Hash size | Number of elements hashed (n) | Condition to use     |
 * |-----------+-------------------------------+----------------------|
 * | LOW       | n ≤ 8                         | 0 < hash_index ≤ 32  |
 * | MID       | 8 < n ≤ 16                    | 32 < hash_index ≤ 40 |
 * | HIGH      | 16 < n ≤ 44                   | 40 < hash_index ≤ 44 |
 * +-----------+-------------------------------+----------------------+
 *
 */
export enum GeneratorIndex {
  /**
   * Indices with size ≤ 8
   */
  COMMITMENT = 1, // Size = 7 (unused)
  COMMITMENT_PLACEHOLDER, // Size = 1 (unused), for omitting some elements of commitment when partially comm
  OUTER_COMMITMENT, // Size = 2
  NULLIFIER_HASHED_PRIVATE_KEY, // Size = 1 (unused)
  NULLIFIER, // Size = 4 (unused)
  INITIALISATION_NULLIFIER, // Size = 2 (unused)
  OUTER_NULLIFIER, // Size = 2
  PUBLIC_DATA_READ, // Size = 2
  PUBLIC_DATA_UPDATE_REQUEST, // Size = 3
  FUNCTION_DATA, // Size = 3
  FUNCTION_LEAF, // Size = 4
  CONTRACT_DEPLOYMENT_DATA, // Size = 4
  CONSTRUCTOR, // Size = 3
  CONSTRUCTOR_ARGS, // Size = 8
  CONTRACT_ADDRESS, // Size = 4
  CONTRACT_LEAF, // Size = 3
  CALL_CONTEXT, // Size = 6
  CALL_STACK_ITEM, // Size = 3
  CALL_STACK_ITEM_2, // Size = ? (unused), // TODO see function where it's used for explanation
  L1_TO_L2_MESSAGE_SECRET, // Size = 1 (wrongly used)
  L2_TO_L1_MSG, // Size = 2 (unused)
  TX_CONTEXT, // Size = 4
  PUBLIC_LEAF_INDEX, // Size = 2 (unused)
  PUBLIC_DATA_LEAF, // Size = ? (unused) // TODO what's the expected size? Assuming ≤ 8
  SIGNED_TX_REQUEST, // Size = 7
  GLOBAL_VARIABLES, // Size = 4
  PARTIAL_CONTRACT_ADDRESS, // Size = 7
  /**
   * Indices with size ≤ 16
   */
  TX_REQUEST = 33, // Size = 14
  /**
   * Indices with size ≤ 44
   */
  VK = 41, // Size = 35
  PRIVATE_CIRCUIT_PUBLIC_INPUTS, // Size = 39
  PUBLIC_CIRCUIT_PUBLIC_INPUTS, // Size = 32 (unused)
  FUNCTION_ARGS, // Size ≤ 40
}

export enum StorageSlotGeneratorIndex {
  BASE_SLOT,
  MAPPING_SLOT,
  MAPPING_SLOT_PLACEHOLDER,
}

// Enumerate the hash_sub_indices which are used for committing to private state note preimages.
// Start from 1.
export enum PrivateStateNoteGeneratorIndex {
  VALUE = 1,
  OWNER,
  CREATOR,
  SALT,
  NONCE,
  MEMO,
  IS_DUMMY,
}

export enum PrivateStateType {
  PARTITIONED = 1,
  WHOLE,
}
