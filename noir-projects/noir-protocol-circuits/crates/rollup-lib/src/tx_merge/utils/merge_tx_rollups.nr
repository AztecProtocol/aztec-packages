use crate::abis::TxRollupPublicInputs;
use ::types::hash::accumulate_sha256;

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
        // We use sha256 for EVM compatibility: some time after this circuit is executed, an L1 contract will consume
        // a message from this `out_hash` subtree (the subtree of L2->L1 messages) by doing a merkle
        // membership check in the Outbox.sol contract: sha256 is cheaper than poseidon2 on L1.
        accumulate_sha256(left_out_hash, right_out_hash)
    }
}

// Accumulates items that need to be accumulated to the next rollup circuit.
// Constructs the public inputs of this circuit, taking care to ascribe left and right
// subtree data to the correct start and end positions.
pub fn merge_tx_rollups(
    left: TxRollupPublicInputs,
    right: TxRollupPublicInputs,
) -> TxRollupPublicInputs {
    // Ensure num_txs >= 2:
    assert(left.num_txs != 0);
    assert(right.num_txs != 0);
    let num_txs = left.num_txs + right.num_txs;

    let out_hash = accumulate_out_hash(left.out_hash, right.out_hash);

    // Convincing the reader the below Field additions won't overflow:
    //
    // mana is the sum of all txs' l2_gas, each of which is a u32. So it's not possible to overflow because it
    // will be limited by the number of txs we can accumulate (num_txs, which is a u16).
    // 16 + 32 < 254.
    //
    // And fees is the sum of all txs' fee, each of which is computed as:
    // (da_gas as Field) * (fee_per_da_gas as Field) + (l2_gas as Field) * (fee_per_l2_gas as Field)
    // gas is u32 and fee_per_gas is u128, so each fee is at most 32 + 128 + 1 = 161 bits.
    // With num_txs being u16, the maximum fee per block is 16 + 161 = 177 bits, which won't overflow.
    // (Also bear in mind that in practice `num_txs` will be much smaller).

    let accumulated_fees = left.accumulated_fees + right.accumulated_fees;

    let accumulated_mana_used = left.accumulated_mana_used + right.accumulated_mana_used;

    TxRollupPublicInputs {
        num_txs,
        constants: left.constants, // Checked to equal the right constants by this circuit's Validator.
        start_tree_snapshots: left.start_tree_snapshots,
        end_tree_snapshots: right.end_tree_snapshots,
        start_sponge_blob: left.start_sponge_blob,
        end_sponge_blob: right.end_sponge_blob,
        out_hash,
        accumulated_fees,
        accumulated_mana_used,
    }
}
