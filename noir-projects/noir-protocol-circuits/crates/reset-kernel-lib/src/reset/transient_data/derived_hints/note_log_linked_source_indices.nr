use crate::reset::transient_data::transient_data_squashing_hint::TransientDataSquashingHint;
use dep::types::{
    abis::{
        note_hash::ScopedNoteHash,
        private_log::PrivateLogData,
        side_effect::{Ordered, scoped::Scoped},
    },
    utils::arrays::{ClaimedLengthArray, find_first_index},
};

/// Builds an array of source indices indicating the origin of each log's associated note hash.
///
/// For each log in the `logs` array:
/// - If the log is linked to a **kept** note hash (i.e., a note hash that wasn't squashed),
///   the corresponding index in the result array points to that note hash's index in `kept_note_hashes`.
/// - If the log is linked to a **squashed** note hash, the index points to the relevant entry
///   in `transient_data_squashing_hints` that identifies the squashed note hash.
///
/// For logs not linked to any note hash (i.e., `note_hash_counter == 0`), the source indices are irrelevant. This
/// function uses the default value `0` for them in the returned array.
///
/// @returns An array of indices, each representing where the log's linked note hash originated from.
pub unconstrained fn build_note_log_linked_source_indices<let LOGS_LEN: u32, let NOTE_HASHES_LEN: u32, let SQUASHING_HINTS_LEN: u32>(
    logs: ClaimedLengthArray<Scoped<PrivateLogData>, LOGS_LEN>,
    note_hashes: ClaimedLengthArray<ScopedNoteHash, NOTE_HASHES_LEN>,
    kept_note_hashes: ClaimedLengthArray<ScopedNoteHash, NOTE_HASHES_LEN>,
    transient_data_squashing_hints: [TransientDataSquashingHint; SQUASHING_HINTS_LEN],
) -> [u32; LOGS_LEN] {
    let mut linked_source_indices = [0; LOGS_LEN];
    for i in 0..logs.length {
        let log_note_hash_counter = logs.array[i].inner.note_hash_counter;
        // A nonzero counter implies the log is linked to a note hash.
        if log_note_hash_counter != 0 {
            // Now we determine whether that note hash is transient or will be kept.

            // First, check if the log is linked to a kept note hash.
            let mut is_kept = false;
            for kept_note_hash_index in 0..kept_note_hashes.length {
                if kept_note_hashes.array[kept_note_hash_index].counter() == log_note_hash_counter {
                    linked_source_indices[i] = kept_note_hash_index;
                    is_kept = true;
                }
            }

            // If `is_kept` is not set in the loop above, we didn't find a kept note hash for the log,
            // the log must be linked to a squashed note hash.
            if !is_kept {
                let squashed_note_hash_index = find_first_index(
                    note_hashes.array,
                    |note_hash| note_hash.counter() == log_note_hash_counter,
                );

                // Find the index of the `transient_data_index_hint` that points to this note hash.
                let transient_data_index_hint_index = find_first_index(
                    transient_data_squashing_hints,
                    |hint| hint.note_hash_index == squashed_note_hash_index,
                );

                linked_source_indices[i] = transient_data_index_hint_index;
            }
        }
    }

    linked_source_indices
}
