use rollup_lib::tx_base::{
    public_tx_base_rollup, PublicTxBaseRollupPrivateInputs, TxRollupPublicInputs,
};

unconstrained fn main(inputs: PublicTxBaseRollupPrivateInputs) -> pub TxRollupPublicInputs {
    public_tx_base_rollup::execute(inputs)
}
