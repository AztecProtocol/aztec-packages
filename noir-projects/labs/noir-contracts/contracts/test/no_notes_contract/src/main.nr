mod test;

use aztec::macros::aztec;

/// A minimal contract that declares no note types, used to test the macro-generated no-notes
/// `_compute_note_hash`, `_compute_note_nullifier` and (deprecated) `_compute_note_hash_and_nullifier` functions.
#[aztec]
pub contract NoNotes {
    use aztec::{
        messages::{discovery::NoteHashAndNullifier as NoteHashAndNullifierResult, logs::note::MAX_NOTE_PACKED_LEN},
        protocol::address::AztecAddress,
    };

    #[contract_library_method]
    pub unconstrained fn test_compute_note_hash(
        packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
        owner: AztecAddress,
        storage_slot: Field,
        note_type_id: Field,
        contract_address: AztecAddress,
        randomness: Field,
    ) -> Option<Field> {
        _compute_note_hash(
            packed_note,
            owner,
            storage_slot,
            note_type_id,
            contract_address,
            randomness,
        )
    }

    #[contract_library_method]
    pub unconstrained fn test_compute_note_nullifier(
        unique_note_hash: Field,
        packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
        owner: AztecAddress,
        storage_slot: Field,
        note_type_id: Field,
        contract_address: AztecAddress,
        randomness: Field,
    ) -> Option<Field> {
        _compute_note_nullifier(
            unique_note_hash,
            packed_note,
            owner,
            storage_slot,
            note_type_id,
            contract_address,
            randomness,
        )
    }

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
