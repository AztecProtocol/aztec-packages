use dep::rollup_lib::tx_base::{
    private_tx_base_rollup, PrivateTxBaseRollupPrivateInputs, TxRollupPublicInputs,
};

unconstrained fn main(inputs: PrivateTxBaseRollupPrivateInputs) -> pub TxRollupPublicInputs {
    private_tx_base_rollup::execute(inputs)
}
