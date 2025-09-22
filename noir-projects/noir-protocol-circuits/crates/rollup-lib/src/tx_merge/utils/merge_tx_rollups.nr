use crate::abis::TxRollupPublicInputs;
use dep::types::hash::accumulate_sha256;

pub fn merge_tx_rollups(
    left: TxRollupPublicInputs,
    right: TxRollupPublicInputs,
) -> TxRollupPublicInputs {
    let num_txs = left.num_txs + right.num_txs;

    let out_hash = accumulate_sha256(left.out_hash, right.out_hash);

    let accumulated_fees = left.accumulated_fees + right.accumulated_fees;

    let accumulated_mana_used = left.accumulated_mana_used + right.accumulated_mana_used;

    TxRollupPublicInputs {
        num_txs,
        constants: left.constants,
        start_partial_state: left.start_partial_state,
        end_partial_state: right.end_partial_state,
        start_sponge_blob: left.start_sponge_blob,
        end_sponge_blob: right.end_sponge_blob,
        out_hash,
        accumulated_fees,
        accumulated_mana_used,
    }
}
