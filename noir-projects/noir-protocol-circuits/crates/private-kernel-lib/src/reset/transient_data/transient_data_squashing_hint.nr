/// Delineates the indices of a note hash and nullifier pair that can be squashed.
pub struct TransientDataSquashingHint {
    pub note_hash_index: u32,
    pub nullifier_index: u32,
}

impl TransientDataSquashingHint {
    pub fn skip(NOTE_HASHES_LEN: u32, NULLIFIERS_LEN: u32) -> Self {
        // Use the array lengths as sentinel values.
        // A `note_hash_index` equal to `NOTE_HASHES_LEN` is treated as inactive or "no-op". If such value is used in an
        // active hint, it will fail to fetch the note hash with an out-of-bounds error.
        // Similarly, a `nullifier_index` equal to `NULLIFIERS_LEN` is treated as inactive or "no-op".
        TransientDataSquashingHint {
            note_hash_index: NOTE_HASHES_LEN,
            nullifier_index: NULLIFIERS_LEN,
        }
    }
}
