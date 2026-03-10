pub mod test_note;

use aztec::macros::aztec;

/// A minimal contract used to test the macro-generated `_compute_note_hash_and_nullifier` function.
#[aztec]
pub contract NoteHashAndNullifier {
    use crate::test_note::TestNote;
    use aztec::{
        macros::storage::storage,
        messages::{
            discovery::NoteHashAndNullifier as NoteHashAndNullifierResult,
            logs::note::MAX_NOTE_PACKED_LEN,
        },
        protocol::address::AztecAddress,
        state_vars::{Owned, PrivateImmutable},
    };

    #[storage]
    struct Storage<Context> {
        dummy: Owned<PrivateImmutable<TestNote, Context>, Context>,
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
