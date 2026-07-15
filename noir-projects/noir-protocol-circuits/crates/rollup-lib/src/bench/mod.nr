//! Benchmark-only circuit bodies for the parity-topology comparison (FI-06 / A-1376).
//!
//! These are NOT production circuits: they are never registered in the vk tree, never wired into the orchestrator, and
//! never get TS bindings. Each is derived from the closest production circuit with exactly one change isolated, so
//! `bb gates` can measure five alternative topologies for the inbox rolling-hash predicate. The thin bench crates under
//! `crates/bench-*` are the entrypoints that call into these functions.
pub mod parity_public_inputs;
pub mod parity_chain;
pub mod parity_base_empty;
pub mod parity_root;
pub mod parity_link;
pub mod block_root;
pub mod checkpoint_root;
