use dep::rollup_lib::tx_base::{PublicTxBaseRollupPrivateInputs, TxRollupPublicInputs};

unconstrained fn main(inputs: PublicTxBaseRollupPrivateInputs) -> pub TxRollupPublicInputs {
    inputs.execute()
}
