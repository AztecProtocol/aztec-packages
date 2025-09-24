use dep::rollup_lib::tx_base::{PrivateTxBaseRollupPrivateInputs, TxRollupPublicInputs};

unconstrained fn main(inputs: PrivateTxBaseRollupPrivateInputs) -> pub TxRollupPublicInputs {
    inputs.execute()
}
