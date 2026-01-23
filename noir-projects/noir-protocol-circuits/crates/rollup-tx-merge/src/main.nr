use dep::rollup_lib::tx_merge::{tx_merge_rollup, TxMergeRollupPrivateInputs, TxRollupPublicInputs};

fn main(inputs: TxMergeRollupPrivateInputs) -> pub TxRollupPublicInputs {
    tx_merge_rollup::execute(inputs)
}
