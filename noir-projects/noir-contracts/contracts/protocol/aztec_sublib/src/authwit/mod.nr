//! Authentication witness module for protocol contracts.

pub mod auth;

pub use auth::{
    assert_current_call_valid_authwit, assert_inner_hash_valid_authwit,
    compute_authwit_message_hash, compute_authwit_nullifier, compute_inner_authwit_hash,
    IS_VALID_SELECTOR,
};
