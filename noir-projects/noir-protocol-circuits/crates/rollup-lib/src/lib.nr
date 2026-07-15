pub(crate) mod abis;
pub(crate) mod tests;

pub mod inbox_rolling_hash;
pub mod tx_base;
pub mod tx_merge;
pub mod block_root;
pub mod block_merge;
pub mod parity;
pub mod checkpoint_root;
pub mod checkpoint_merge;
pub mod root;

// Benchmark-only circuit bodies (FI-06 / A-1376). Not production circuits; see `bench/mod.nr`.
pub mod bench;
