//! Oracle modules for protocol contracts.

pub mod avm;
pub mod execution_cache;
pub mod capsules;
pub mod storage;
pub mod execution;
pub mod get_l1_to_l2_membership_witness;
pub mod nullifiers;
pub mod public_call;
pub mod tx_phase;
pub mod call_private_function;
pub mod logs;

// logging oracle is used by both noir-protocol-circuits and this crate and for this reason we just re-export it
// here from protocol_types.
pub use protocol_types::logging;

pub mod version;
