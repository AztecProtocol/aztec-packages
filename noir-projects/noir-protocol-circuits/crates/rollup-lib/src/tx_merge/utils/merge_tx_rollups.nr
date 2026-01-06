use crate::abis::TxRollupPublicInputs;
use dep::types::hash::accumulate_sha256;

// The `out_hash` is the root of a (potentially wonky, greedy) subtree of L2->L1 messages that the
// various functions of txs of this block have emitted.
pub fn accumulate_out_hash(left_out_hash: Field, right_out_hash: Field) -> Field {
    // An out_hash will only be 0 if no L2->L1 msgs were emitted by the functions of the txs of the
    // left/right subtree.
    if left_out_hash == 0 {
        right_out_hash
    } else if right_out_hash == 0 {
        left_out_hash
    } else {
        // TODO: should probably have a domain separator, to be safe
        // We use sha256 for EVM compatibility: some time in the future, an L1 contract will consume
        // a message from this `out_hash` subtree (the subtree of L2->L1 messages) by doing a merkle
        // membership check in the Outbox.sol contract: sha256 is cheaper than poseidon2 on L1.
        accumulate_sha256(left_out_hash, right_out_hash)
    }
}

pub fn merge_tx_rollups(
    left: TxRollupPublicInputs,
    right: TxRollupPublicInputs,
) -> TxRollupPublicInputs {
    let num_txs = left.num_txs + right.num_txs; // Q: should we assert that this is >= 2?

    let out_hash = accumulate_out_hash(left.out_hash, right.out_hash);

    // TODO: check that we cap these fees and mana, to prevent overflow.
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
