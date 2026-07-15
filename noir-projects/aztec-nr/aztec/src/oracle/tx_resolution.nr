use crate::ephemeral::EphemeralArray;

use crate::messages::processing::ResolvedTx;

/// Resolves the on-chain context of each tx hash.
pub(crate) unconstrained fn get_resolved_txs(requests: EphemeralArray<Field>) -> EphemeralArray<Option<ResolvedTx>> {
    get_resolved_txs_oracle(requests)
}

#[oracle(aztec_utl_getResolvedTxs)]
unconstrained fn get_resolved_txs_oracle(requests: EphemeralArray<Field>) -> EphemeralArray<Option<ResolvedTx>> {}
