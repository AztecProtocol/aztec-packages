pub mod test_note;
mod test;

use aztec::macros::aztec;

/// A minimal contract used to test the macro-generated `_compute_note_hash`, `_compute_note_nullifier` and
/// (deprecated) `_compute_note_hash_and_nullifier` functions.
#[aztec]
pub contract NoteHashAndNullifier {
    use aztec::{
        messages::{discovery::NoteHashAndNullifier as NoteHashAndNullifierResult, logs::note::MAX_NOTE_PACKED_LEN},
        protocol::address::AztecAddress,
    };

    #[contract_library_method]
    pub unconstrained fn test_compute_note_hash_and_nullifier(
        packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
        owner: AztecAddress,
        storage_slot: Field,
        note_type_id: Field,
        contract_address: AztecAddress,
        randomness: Field,
        note_nonce: Field,
    ) -> Option<NoteHashAndNullifierResult> {
        _compute_note_hash_and_nullifier(
            packed_note,
            owner,
            storage_slot,
            note_type_id,
            contract_address,
            randomness,
            note_nonce,
        )
    }
}
