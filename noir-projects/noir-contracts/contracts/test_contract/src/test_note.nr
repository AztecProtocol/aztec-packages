use dep::aztec::{
    context::PrivateContext,
    macros::notes::note,
    note::{note_header::NoteHeader, note_interface::NullifiableNote},
    protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize}},
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

// Note: We are not deriving Eq here because generally we don't want to include the header in the comparison.
// This is bad note design and a tech debt. Ideally derive it once the note design is fixed.
impl Eq for TestNote {
    fn eq(self, other: Self) -> bool {
        self.value == other.value
    }
}

// Note: We are not deriving Packable here because that would pack the whole struct including the note header
// (so the resulting field array size would be 5).
// This is bad note design and a tech debt. Ideally derive it once the note design is fixed.
impl Packable<1> for TestNote {
    fn pack(self) -> [Field; 1] {
        [self.value]
    }

    fn unpack(fields: [Field; 1]) -> Self {
        TestNote { value: fields[0], header: NoteHeader::empty() }
    }
}
