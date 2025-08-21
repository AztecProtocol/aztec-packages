use dep::rollup_lib::tx_merge::{TxMergeRollupPrivateInputs, TxRollupPublicInputs};

fn main(inputs: TxMergeRollupPrivateInputs) -> pub TxRollupPublicInputs {
    inputs.execute()
}
