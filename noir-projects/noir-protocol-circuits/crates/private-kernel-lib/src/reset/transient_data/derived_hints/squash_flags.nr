use crate::reset::transient_data::transient_data_squashing_hint::TransientDataSquashingHint;

/// Constructs a boolean flag array indicating which note hashes are to be squashed.
/// For each active squashing hint, sets the flag at the corresponding `note_hash_index` to `true`.
pub unconstrained fn build_note_hash_squash_flags<let SquashingHintsLen: u32, let NoteHashesLen: u32>(
    transient_data_squashing_hints: [TransientDataSquashingHint; SquashingHintsLen],
    num_active_squashing_hints: u32,
) -> [bool; NoteHashesLen] {
    let mut hints = [false; NoteHashesLen];
    for i in 0..num_active_squashing_hints {
        let note_hash_index = transient_data_squashing_hints[i].note_hash_index;
        hints[note_hash_index] = true;
    }
    hints
}

/// Constructs a boolean flag array indicating which nullifiers are to be squashed.
/// For each active squashing hint, sets the flag at the corresponding `nullifier_index` to `true`.
pub unconstrained fn build_nullifier_squash_flags<let SquashingHintsLen: u32, let NullifiersLen: u32>(
    transient_data_squashing_hints: [TransientDataSquashingHint; SquashingHintsLen],
    num_active_squashing_hints: u32,
) -> [bool; NullifiersLen] {
    let mut hints = [false; NullifiersLen];
    for i in 0..num_active_squashing_hints {
        let nullifier_index = transient_data_squashing_hints[i].nullifier_index;
        hints[nullifier_index] = true;
    }
    hints
}
