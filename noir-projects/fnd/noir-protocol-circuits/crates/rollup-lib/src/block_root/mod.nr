pub(crate) mod components;
pub mod block_root_no_txs_rollup;
pub mod block_root_rollup;
pub mod block_root_single_tx_rollup;
mod tests;

// Re-exports
pub use crate::abis::BlockRollupPublicInputs;
pub use block_root_no_txs_rollup::BlockRootNoTxsRollupPrivateInputs;
pub use block_root_rollup::BlockRootRollupPrivateInputs;
pub use block_root_single_tx_rollup::BlockRootSingleTxRollupPrivateInputs;
