use crate::reset::transient_data::transient_data_squashing_hint::TransientDataSquashingHint;

/// Constructs a boolean flag array indicating which note hashes are to be squashed.
/// For each active squashing hint, sets the flag at the corresponding `note_hash_index` to `true`.
pub unconstrained fn build_note_hash_squash_flags<let SQUASHING_HINTS_LEN: u32, let NOTE_HASHES_LEN: u32>(
    transient_data_squashing_hints: [TransientDataSquashingHint; SQUASHING_HINTS_LEN],
    num_active_squashing_hints: u32,
) -> [bool; NOTE_HASHES_LEN] {
    let mut hints = [false; NOTE_HASHES_LEN];
    for i in 0..num_active_squashing_hints {
        let note_hash_index = transient_data_squashing_hints[i].note_hash_index;
        hints[note_hash_index] = true;
    }
    hints
}

/// Constructs a boolean flag array indicating which nullifiers are to be squashed.
/// For each active squashing hint, sets the flag at the corresponding `nullifier_index` to `true`.
pub unconstrained fn build_nullifier_squash_flags<let SQUASHING_HINTS_LEN: u32, let NULLIFIERS_LEN: u32>(
    transient_data_squashing_hints: [TransientDataSquashingHint; SQUASHING_HINTS_LEN],
    num_active_squashing_hints: u32,
) -> [bool; NULLIFIERS_LEN] {
    let mut hints = [false; NULLIFIERS_LEN];
    for i in 0..num_active_squashing_hints {
        let nullifier_index = transient_data_squashing_hints[i].nullifier_index;
        hints[nullifier_index] = true;
    }
    hints
}
