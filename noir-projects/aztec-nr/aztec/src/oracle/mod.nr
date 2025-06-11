// docs:start:oracles-module
/// Oracles module
// docs:end:oracles-module

pub mod aes128_decrypt;
pub mod block_header;
pub mod call_private_function;
pub mod simulate_utility_function;
pub mod capsules;
pub mod enqueue_public_function_call;
pub mod execution;
pub mod execution_cache;
pub mod get_contract_instance;
pub mod get_l1_to_l2_membership_witness;
pub mod get_nullifier_membership_witness;
pub mod get_public_data_witness;
pub mod get_membership_witness;
pub mod keys;
pub mod key_validation_request;
pub mod logs;
pub mod message_processing;
pub mod notes;
pub mod offchain_message;
pub mod random;
pub mod shared_secret;
pub mod storage;

// debug_log oracle is used by both noir-protocol-circuits and this crate and for this reason we just re-export it
// here from protocol circuits.
pub use dep::protocol_types::debug_log;
