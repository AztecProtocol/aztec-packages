use dep::aztec::{
    keys::getters::{get_nsk_app, get_public_keys},
    macros::notes::note,
    note::utils::compute_note_hash_for_nullify,
    protocol_types::{
        address::AztecAddress, constants::GENERATOR_INDEX__NOTE_NULLIFIER,
        hash::poseidon2_hash_with_separator,
    },
};
use dep::aztec::prelude::{NoteHeader, NullifiableNote, PrivateContext};

// Stores a public key composed of two fields
// TODO: Do we need to include a nonce, in case we want to read/nullify/recreate with the same pubkey value?
#[note]
pub struct PublicKeyNote {
    x: Field,
    y: Field,
    owner: AztecAddress,
}

impl NullifiableNote for PublicKeyNote {
    fn compute_nullifier(
        self,
        context: &mut PrivateContext,
        note_hash_for_nullify: Field,
    ) -> Field {
        let owner_npk_m_hash: Field = get_public_keys(self.owner).npk_m.hash();
        let secret = context.request_nsk_app(owner_npk_m_hash);
        poseidon2_hash_with_separator(
            [note_hash_for_nullify, secret],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        )
    }

    unconstrained fn compute_nullifier_without_context(self) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_nullify(self);
        let owner_npk_m_hash: Field = get_public_keys(self.owner).npk_m.hash();
        let secret = get_nsk_app(owner_npk_m_hash);
        poseidon2_hash_with_separator(
            [note_hash_for_nullify, secret],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        )
    }
}

impl PublicKeyNote {
    pub fn new(x: Field, y: Field, owner: AztecAddress) -> Self {
        PublicKeyNote { x, y, owner, header: NoteHeader::empty() }
    }
}
