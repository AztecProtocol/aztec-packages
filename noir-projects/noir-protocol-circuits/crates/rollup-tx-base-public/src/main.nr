use dep::rollup_lib::tx_base::{PublicTxBaseRollupPrivateInputs, TxRollupPublicInputs};

fn main(inputs: PublicTxBaseRollupPrivateInputs) -> pub TxRollupPublicInputs {
    inputs.execute()
}
