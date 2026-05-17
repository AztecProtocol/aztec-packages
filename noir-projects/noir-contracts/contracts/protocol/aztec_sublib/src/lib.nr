//! Minimal protocol lib for audit contracts.
//!
//! This crate extracts only the necessary functionality from `aztec.nr` for the 4 protocol contracts
//! going to audit (fee_juice, auth_registry, contract_class_registry, contract_instance_registry).
//! This removes the dependency on the unstable `aztec` crate.

pub mod context;
pub mod hash;
pub mod messaging;
pub mod oracle;
pub mod state_vars;
pub mod authwit;
pub mod nullifier;
pub mod utils;
pub mod history;
pub mod macros;
pub mod standard_addresses;

// Re-export protocol_types as `protocol` for compatibility with existing aztec imports
pub use protocol_types as protocol;
