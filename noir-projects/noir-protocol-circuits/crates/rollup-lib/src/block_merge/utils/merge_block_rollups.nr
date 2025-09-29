use crate::abis::BlockRollupPublicInputs;
use dep::types::hash::accumulate_sha256;

pub fn merge_block_rollups(
    left: BlockRollupPublicInputs,
    right: BlockRollupPublicInputs,
) -> BlockRollupPublicInputs {
    // `in_hash` originates from the first block root and must propagate through all merge steps via the left rollup
    // only. It's checked in `validate_consecutive_block_rollups` to make sure only the left rollup carries it.
    let in_hash = left.in_hash;

    // TODO(#15974): Ignore zero hashes when accumulating.
    let out_hash = accumulate_sha256(left.out_hash, right.out_hash);

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
        start_timestamp: left.start_timestamp,
        end_timestamp: right.end_timestamp,
        in_hash,
        out_hash,
        accumulated_fees,
        accumulated_mana_used,
    }
}
