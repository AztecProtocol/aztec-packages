use crate::reset::transient_data::transient_data_squashing_hint::TransientDataSquashingHint;
use dep::types::{
    abis::{
        note_hash::ScopedNoteHash,
        private_log::PrivateLogData,
        side_effect::{Ordered, scoped::Scoped},
    },
    utils::arrays::{ClaimedLengthArray, find_first_index},
};

pub struct NoteLogLinkedSourceIndices {
    pub transient_data_squashing_hint_index: u32,
    pub kept_note_hash_index: u32,
}

/// Builds an array of source descriptors for each log's associated note hash.
///
/// - If a log is linked to a **kept** note hash (i.e., one that wasn't squashed), the `kept_note_hash_index` field in
///   the corresponding entry is set to the index of that note hash in the `kept_note_hashes` array.
/// - If a log is linked to a **squashed** note hash, the `transient_data_squashing_hint_index` field is set to the
///   index of the hint that points to the squashed pair containing the note hash.
/// - If a log is not linked to any note hash (`note_hash_counter == 0`), the corresponding entry is filled with default
///   values (`0` for both indices).
///
/// The default index `0` is used when a log is not linked to a kept or squashed note hash. These values are not
/// meaningful, but they ensure that downstream validation logic does not trigger out-of-bounds errors when attempting
/// to match the log against a possible kept note hash or squashing hint.
///
/// @returns An array of `NoteLogLinkedSourceIndices` where each entry corresponds to a log in `logs` and describes the
/// origin of its possible linked note hash (may be in `kept_note_hashes` or in `transient_data_squashing_hints`).
pub unconstrained fn build_note_log_linked_source_indices<let LogsLen: u32, let NoteHashesLen: u32, let SquashingHintsLen: u32>(
    logs: ClaimedLengthArray<Scoped<PrivateLogData>, LogsLen>,
    note_hashes: ClaimedLengthArray<ScopedNoteHash, NoteHashesLen>,
    kept_note_hashes: ClaimedLengthArray<ScopedNoteHash, NoteHashesLen>,
    transient_data_squashing_hints: [TransientDataSquashingHint; SquashingHintsLen],
) -> [NoteLogLinkedSourceIndices; LogsLen] {
    let mut linked_source_indices = [
        NoteLogLinkedSourceIndices {
            transient_data_squashing_hint_index: 0,
            kept_note_hash_index: 0,
        }; LogsLen
    ];

    for i in 0..logs.length {
        let log_note_hash_counter = logs.array[i].inner.note_hash_counter;
        // A nonzero counter implies the log is linked to a note hash.
        if log_note_hash_counter != 0 {
            // Now we determine whether that note hash is transient or will be kept.

            // First, check if the log is linked to a kept note hash.
            let mut is_kept = false;
            for kept_note_hash_index in 0..kept_note_hashes.length {
                if kept_note_hashes.array[kept_note_hash_index].counter() == log_note_hash_counter {
                    linked_source_indices[i].kept_note_hash_index = kept_note_hash_index;
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

                // Find the index of the `transient_data_squashing_hint` that points to this note hash.
                let transient_data_squashing_hint_index = find_first_index(
                    transient_data_squashing_hints,
                    |hint| hint.note_hash_index == squashed_note_hash_index,
                );

                linked_source_indices[i].transient_data_squashing_hint_index =
                    transient_data_squashing_hint_index;
            }
        }
    }

    linked_source_indices
}
