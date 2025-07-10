use crate::reset::transient_data::TransientDataIndexHint;

pub unconstrained fn get_is_squashed_note_hash_hints<let NUM_INDEX_HINTS: u32, let NUM_NOTE_HASHES: u32>(
    transient_data_index_hints: [TransientDataIndexHint; NUM_INDEX_HINTS],
) -> [bool; NUM_NOTE_HASHES] {
    let mut hints = [false; NUM_NOTE_HASHES];
    for i in 0..transient_data_index_hints.len() {
        let note_hash_index = transient_data_index_hints[i].note_hash_index;
        // TODO: consider using Option::none
        if note_hash_index != NUM_NOTE_HASHES {
            hints[note_hash_index] = true;
        }
    }
    hints
}

pub unconstrained fn get_is_squashed_nullifier_hints<let NUM_INDEX_HINTS: u32, let NUM_NULLIFIERS: u32>(
    transient_data_index_hints: [TransientDataIndexHint; NUM_INDEX_HINTS],
    NUM_NOTE_HASHES: u32,
) -> [bool; NUM_NULLIFIERS] {
    let mut hints = [false; NUM_NULLIFIERS];
    for i in 0..transient_data_index_hints.len() {
        let nullifier_index = transient_data_index_hints[i].nullifier_index;
        let note_hash_index = transient_data_index_hints[i].note_hash_index;
        if note_hash_index != NUM_NOTE_HASHES {
            hints[nullifier_index] = true;
        }
    }
    hints
}
