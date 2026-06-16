// Gas and fees
export const TX_ERROR_INSUFFICIENT_FEE_PER_GAS = 'Insufficient fee per gas';
export const TX_ERROR_INSUFFICIENT_FEE_PAYER_BALANCE = 'Insufficient fee payer balance';
export const TX_ERROR_INSUFFICIENT_GAS_LIMIT = 'Gas limit is below the minimum fixed cost';
export const TX_ERROR_GAS_LIMIT_TOO_HIGH =
  'Gas limit is higher than the maximum amount of gas this network allows per tx';

// Phases
export const TX_ERROR_SETUP_FUNCTION_NOT_ALLOWED = 'Setup function not on allow list';
export const TX_ERROR_SETUP_FUNCTION_UNKNOWN_CONTRACT = 'Setup function targets unknown contract';
export const TX_ERROR_SETUP_ONLY_SELF_WRONG_SENDER = 'Setup only_self function called with incorrect msg_sender';
export const TX_ERROR_SETUP_NULL_MSG_SENDER = 'Setup function called with null msg sender';
export const TX_ERROR_SETUP_WRONG_CALLDATA_LENGTH = 'Setup function called with wrong calldata length';

// Nullifiers
export const TX_ERROR_DUPLICATE_NULLIFIER_IN_TX = 'Duplicate nullifier in tx';
export const TX_ERROR_EXISTING_NULLIFIER = 'Existing nullifier';

// Metadata
export const TX_ERROR_INVALID_EXPIRATION_TIMESTAMP = 'Invalid expiration timestamp';
export const TX_ERROR_INCORRECT_L1_CHAIN_ID = 'Incorrect L1 chain id';
export const TX_ERROR_INCORRECT_ROLLUP_VERSION = 'Incorrect rollup version';
export const TX_ERROR_INCORRECT_VK_TREE_ROOT = 'Incorrect verification keys tree root';
export const TX_ERROR_INCORRECT_PROTOCOL_CONTRACTS_HASH = 'Incorrect protocol contracts hash';

// Proof
export const TX_ERROR_INVALID_PROOF = 'Invalid proof';

//Data
export const TX_ERROR_INCORRECT_CALLDATA = 'Incorrect calldata for public call';
export const TX_ERROR_CALLDATA_COUNT_MISMATCH = 'Wrong number of calldata for public calls';
export const TX_ERROR_CALLDATA_COUNT_TOO_LARGE = 'Total calldata too large for enqueued public calls';
export const TX_ERROR_CONTRACT_CLASS_LOG_COUNT = 'Mismatched number of contract class logs';
export const TX_ERROR_CONTRACT_CLASS_LOG_LENGTH = 'Incorrect contract class logs length';
export const TX_ERROR_CONTRACT_CLASS_LOGS = 'Mismatched contract class logs';
export const TX_ERROR_CONTRACT_CLASS_LOG_SORTING = 'Incorrectly sorted contract class logs';
export const TX_ERROR_INCORRECT_HASH = 'Incorrect tx hash';

// Size
export const TX_ERROR_SIZE_ABOVE_LIMIT = 'Transaction size above size limit';

// Block header
export const TX_ERROR_BLOCK_HEADER = 'Block header not found';

// Contract instance
export const TX_ERROR_INCORRECT_CONTRACT_ADDRESS = 'Incorrect contract instance deployment address';
export const TX_ERROR_MALFORMED_CONTRACT_INSTANCE_LOG = 'Failed to parse contract instance deployment log';

// Contract class
export const TX_ERROR_INCORRECT_CONTRACT_CLASS_ID = 'Incorrect contract class id';
export const TX_ERROR_MALFORMED_CONTRACT_CLASS_LOG = 'Failed to parse contract class registration log';

// General
export const TX_ERROR_DURING_VALIDATION = 'Unexpected error during validation';
