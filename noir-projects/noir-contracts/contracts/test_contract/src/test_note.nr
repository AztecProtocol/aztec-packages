use dep::aztec::{
    context::PrivateContext,
    macros::notes::note,
    note::{note_header::NoteHeader, note_interface::NullifiableNote},
    protocol_types::{address::AztecAddress, traits::{Deserialize, Serialize}},
};

// A note which stores a field and is expected to be passed around using the `addNote` function.
// WARNING: This Note is not private as it does not contain randomness and hence it can be easy to perform
// serialized_note attack on it. This note has been developed purely for testing purposes so that it can easily be
// manually added to PXE. Do not use for real applications.
#[note]
#[derive(Serialize, Deserialize)]
pub struct TestNote {
    value: Field,
}

impl NullifiableNote for TestNote {

    fn compute_nullifier(
        _self: Self,
        _context: &mut PrivateContext,
        _note_hash_for_nullify: Field,
    ) -> Field {
        // This note is expected to be shared between users and fstructor this reason can't be nullified using a secret.
        0
    }

    unconstrained fn compute_nullifier_without_context(_self: Self) -> Field {
        // This note is expected to be shared between users and for this reason can't be nullified using a secret.
        0
    }
}

impl TestNote {
    pub fn new(value: Field) -> Self {
        TestNote { value, header: NoteHeader::empty() }
    }
}

impl Eq for TestNote {
    fn eq(self, other: Self) -> bool {
        self.value == other.value
    }
}
