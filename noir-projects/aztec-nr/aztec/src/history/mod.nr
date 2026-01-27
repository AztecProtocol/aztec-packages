//! Proofs of Aztec history.
//!
//! ## Data Availability
//!
//! Functions in these modules assert statements about the past state of the Aztec network. While this is possible in
//! theory, actual network nodes might not have the information required to produce proofs at relatively old blocks.
//!
//! In particular, many nodes prune old state and do not keep records of the different state trees (note hashes,
//! nullifiers, public storage, etc.) at blocks older than a couple hours, which are required in order to produce the
//! sibling paths these functions need.
//!
//! An archive node is therefore required when using any of these functions on non-recent blocks.

pub mod deployment;
pub mod note;
pub mod nullifier;
pub mod storage;
mod test;
