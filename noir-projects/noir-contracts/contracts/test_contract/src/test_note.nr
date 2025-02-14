use dep::aztec::{
    context::PrivateContext,
    macros::notes::note_custom_interface,
    note::note_interface::{NoteInterface, NullifiableNote},
    protocol_types::{
        address::AztecAddress,
        constants::GENERATOR_INDEX__NOTE_HASH,
        hash::poseidon2_hash_with_separator,
        traits::{Deserialize, Serialize},
        utils::arrays::array_concat,
    },
};

// TODO(#12008): Remove the need for the manual import of `Packable` trait here. This is a bug in macros.
use aztec::protocol_types::traits::Packable;

/// A note which stores a field and is expected to be passed around using the `addNote` function.
///
/// WARNING: This Note is not private as it does not contain randomness, making it vulnerable to
/// note hash preimage attacks. This note was developed purely for testing purposes so it could be
/// easily added to PXE manually. Do not use for real applications.
///
/// Note: We are using `#[note_custom_interface]` here even though we don't need a custom implementation,
/// just to test that the macro works (it's not used anywhere else so far).
#[note_custom_interface]
#[derive(Eq, Deserialize, Serialize)]
pub struct TestNote {
    value: Field,
}

impl NoteInterface for TestNote {
    fn get_note_type_id() -> Field {
        // randomly chosen note type id --> has to fit within 7 bits
        76
    }

    fn compute_note_hash(self, storage_slot: Field) -> Field {
        let inputs = array_concat(self.pack(), [storage_slot]);
        poseidon2_hash_with_separator(inputs, GENERATOR_INDEX__NOTE_HASH)
    }
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

    unconstrained fn compute_nullifier_without_context(
        _self: Self,
        _storage_slot: Field,
        _contract_address: AztecAddress,
        _note_nonce: Field,
    ) -> Field {
        // This note is expected to be shared between users and for this reason can't be nullified using a secret.
        0
    }
}

impl TestNote {
    pub fn new(value: Field) -> Self {
        TestNote { value }
    }
}
