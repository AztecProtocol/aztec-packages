use crate::abis::TxRollupPublicInputs;
use dep::types::hash::accumulate_sha256;

pub fn accumulate_out_hash(left_out_hash: Field, right_out_hash: Field) -> Field {
    if left_out_hash == 0 {
        right_out_hash
    } else if right_out_hash == 0 {
        left_out_hash
    } else {
        accumulate_sha256(left_out_hash, right_out_hash)
    }
}

pub fn merge_tx_rollups(
    left: TxRollupPublicInputs,
    right: TxRollupPublicInputs,
) -> TxRollupPublicInputs {
    let num_txs = left.num_txs + right.num_txs;

    let out_hash = accumulate_out_hash(left.out_hash, right.out_hash);

    let accumulated_fees = left.accumulated_fees + right.accumulated_fees;

    let accumulated_mana_used = left.accumulated_mana_used + right.accumulated_mana_used;

    TxRollupPublicInputs {
        num_txs,
        constants: left.constants,
        start_tree_snapshots: left.start_tree_snapshots,
        end_tree_snapshots: right.end_tree_snapshots,
        start_sponge_blob: left.start_sponge_blob,
        end_sponge_blob: right.end_sponge_blob,
        out_hash,
        accumulated_fees,
        accumulated_mana_used,
    }
}
