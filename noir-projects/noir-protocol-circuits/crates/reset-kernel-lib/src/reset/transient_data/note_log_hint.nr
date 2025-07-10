use crate::reset::transient_data::TransientDataIndexHint;
use dep::types::{
    abis::{
        note_hash::ScopedNoteHash,
        private_log::PrivateLogData,
        side_effect::{Ordered, scoped::Scoped},
    },
    traits::Empty,
    utils::arrays::{ClaimedLengthArray, find_index_hint},
};

pub struct NoteLogHint {
    pub transient_data_index_hint_index: u32,
    pub kept_note_hash_index: u32,
}

impl Empty for NoteLogHint {
    fn empty() -> Self {
        NoteLogHint { transient_data_index_hint_index: 0, kept_note_hash_index: 0 }
    }
}

impl Eq for NoteLogHint {
    fn eq(self, other: Self) -> bool {
        (self.transient_data_index_hint_index == other.transient_data_index_hint_index)
            & (self.kept_note_hash_index == other.kept_note_hash_index)
    }
}

impl NoteLogHint {
    pub fn as_squashed(transient_data_index_hint_index: u32) -> Self {
        let mut hint = NoteLogHint::empty();
        hint.transient_data_index_hint_index = transient_data_index_hint_index;
        hint
    }

    pub fn as_kept(kept_note_hash_index: u32) -> Self {
        let mut hint = NoteLogHint::empty();
        hint.kept_note_hash_index = kept_note_hash_index;
        hint
    }
}

pub unconstrained fn get_note_log_hints<let NUM_LOGS: u32, let NUM_NOTE_HASHES: u32, let NUM_INDEX_HINTS: u32>(
    logs: ClaimedLengthArray<Scoped<PrivateLogData>, NUM_LOGS>,
    note_hashes: ClaimedLengthArray<ScopedNoteHash, NUM_NOTE_HASHES>,
    kept_note_hashes: ClaimedLengthArray<ScopedNoteHash, NUM_NOTE_HASHES>,
    transient_data_index_hints: [TransientDataIndexHint; NUM_INDEX_HINTS],
) -> [NoteLogHint; NUM_LOGS] {
    let mut hints = [NoteLogHint::empty(); NUM_LOGS];
    for i in 0..logs.length {
        let log_note_hash_counter = logs.array[i].inner.note_hash_counter;
        if log_note_hash_counter != 0 {
            // A nonzero counter implies the log is linked to a note_hash.
            // Now we determine whether that note_hash is transient or will be kept.

            // First, check if the log is linked to a kept note_hash.
            let mut is_kept = false;
            for kept_note_hash_index in 0..kept_note_hashes.length {
                if kept_note_hashes.array[kept_note_hash_index].counter() == log_note_hash_counter {
                    hints[i] = NoteLogHint::as_kept(kept_note_hash_index);
                    is_kept = true;
                }
            }

            // If `is_kept` is not set in the loop above, we didn't find a kept note_hash for the log,
            // the log must be linked to a squashed note_hash.
            if !is_kept {
                let squashed_note_hash_index = find_index_hint(
                    note_hashes.array,
                    |note_hash| note_hash.counter() == log_note_hash_counter,
                )
                    .unwrap();

                // Find the index of the transient_data_index_hint that points to this note_hash.
                let transient_data_index_hint_index = find_index_hint(
                    transient_data_index_hints,
                    |hint| hint.note_hash_index == squashed_note_hash_index,
                )
                    .unwrap();

                hints[i] = NoteLogHint::as_squashed(transient_data_index_hint_index);
            }
        }
    }

    hints
}
