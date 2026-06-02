// Protocol constants ported from yarn-project/constants/src/constants.gen.ts.

// Tree heights
pub const ARCHIVE_HEIGHT: u32 = 30;
pub const NOTE_HASH_TREE_HEIGHT: u32 = 42;
pub const NULLIFIER_TREE_HEIGHT: u32 = 42;
pub const PUBLIC_DATA_TREE_HEIGHT: u32 = 40;
pub const L1_TO_L2_MSG_TREE_HEIGHT: u32 = 36;
pub const VK_TREE_HEIGHT: u32 = 7;

// Per-tx side effect limits
pub const MAX_NOTE_HASHES_PER_TX: u32 = 64;
pub const MAX_NULLIFIERS_PER_TX: u32 = 64;
pub const MAX_PRIVATE_LOGS_PER_TX: u32 = 64;
pub const MAX_L2_TO_L1_MSGS_PER_TX: u32 = 8;
pub const MAX_ENQUEUED_CALLS_PER_TX: u32 = 32;
pub const MAX_CONTRACT_CLASS_LOGS_PER_TX: u32 = 1;
pub const MAX_NOTE_HASH_READ_REQUESTS_PER_TX: u32 = 64;
pub const MAX_NULLIFIER_READ_REQUESTS_PER_TX: u32 = 64;
pub const MAX_KEY_VALIDATION_REQUESTS_PER_TX: u32 = 64;
pub const MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX: u32 = 16;

// Per-call side effect limits
pub const MAX_NOTE_HASHES_PER_CALL: u32 = 16;
pub const MAX_NULLIFIERS_PER_CALL: u32 = 16;
pub const MAX_PRIVATE_LOGS_PER_CALL: u32 = 16;
pub const MAX_L2_TO_L1_MSGS_PER_CALL: u32 = 8;
pub const MAX_ENQUEUED_CALLS_PER_CALL: u32 = 32;
pub const MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL: u32 = 8;
pub const MAX_NOTE_HASH_READ_REQUESTS_PER_CALL: u32 = 16;
pub const MAX_NULLIFIER_READ_REQUESTS_PER_CALL: u32 = 16;
pub const MAX_KEY_VALIDATION_REQUESTS_PER_CALL: u32 = 16;

// Gas metering
pub const DA_GAS_PER_BYTE: u32 = 1;
pub const DA_GAS_PER_FIELD: u32 = 32;
pub const TX_DA_GAS_OVERHEAD: u32 = 96;
pub const PUBLIC_TX_L2_GAS_OVERHEAD: u32 = 540_000;
pub const PRIVATE_TX_L2_GAS_OVERHEAD: u32 = 440_000;
pub const FIXED_AVM_STARTUP_L2_GAS: u32 = 20_000;
pub const L2_GAS_PER_NOTE_HASH: u32 = 9_200;
pub const L2_GAS_PER_NULLIFIER: u32 = 16_000;
pub const L2_GAS_PER_L2_TO_L1_MSG: u32 = 5_200;
pub const L2_GAS_PER_PRIVATE_LOG: u32 = 2_500;
pub const L2_GAS_PER_CONTRACT_CLASS_LOG: u32 = 73_000;

// Tx lifetime
pub const MAX_TX_LIFETIME: u64 = 86_400;

// Misc
pub const NULL_MSG_SENDER_CONTRACT_ADDRESS: u64 = 0;
