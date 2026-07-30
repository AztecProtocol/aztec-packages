use crate::{abis::BlockRollupPublicInputs, tx_merge::accumulate_out_hash};
use types::constants::DOM_SEP__BLOCK_HEADERS_HASH;
use types::hash::poseidon2_hash_with_separator;

pub fn accumulate_block_headers_hash(left_hash: Field, right_hash: Field) -> Field {
    poseidon2_hash_with_separator([left_hash, right_hash], DOM_SEP__BLOCK_HEADERS_HASH)
}

pub fn merge_block_rollups(
    left: BlockRollupPublicInputs,
    right: BlockRollupPublicInputs,
) -> BlockRollupPublicInputs {
    // We need a way to, given a checkpoint header and a set of block headers, verify that the block headers
    // are indeed part of that checkpoint. The `block_headers_hash` is a commitment to all block hashes: the
    // root of a small unbalanced merkle tree of all block hashes.
    let block_headers_hash =
        accumulate_block_headers_hash(left.block_headers_hash, right.block_headers_hash);

    // The message sponge threads across the checkpoint's blocks: the range spans left's start through right's end.
    // `validate_consecutive_block_rollups` asserts `right.start_msg_sponge == left.end_msg_sponge` for continuity.
    let start_msg_sponge = left.start_msg_sponge;
    let end_msg_sponge = right.end_msg_sponge;

    let out_hash = accumulate_out_hash(left.out_hash, right.out_hash);

    let accumulated_fees = left.accumulated_fees + right.accumulated_fees;

    let accumulated_mana_used = left.accumulated_mana_used + right.accumulated_mana_used;

    BlockRollupPublicInputs {
        constants: left.constants,
        previous_archive: left.previous_archive,
        new_archive: right.new_archive,
        start_state: left.start_state,
        end_state: right.end_state,
        start_sponge_blob: left.start_sponge_blob,
        end_sponge_blob: right.end_sponge_blob,
        timestamp: left.timestamp, // Both blocks have the same timestamp.
        block_headers_hash,
        start_msg_sponge,
        end_msg_sponge,
        out_hash,
        accumulated_fees,
        accumulated_mana_used,
    }
}
