use aztec::{
    keys::getters::{get_nsk_app, get_public_keys},
    macros::notes::note,
    note::{note_metadata::SettledNoteMetadata, utils::compute_note_hash_for_nullify},
    prelude::{NullifiableNote, PrivateContext, RetrievedNote},
    protocol_types::{
        address::AztecAddress, constants::GENERATOR_INDEX__NOTE_NULLIFIER,
        hash::poseidon2_hash_with_separator,
    },
};

// TODO(#12008): Remove the need for the manual import of `Packable` trait here. This is a bug in macros.
use aztec::protocol_types::traits::Packable;

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

    unconstrained fn compute_nullifier_without_context(
        self,
        storage_slot: Field,
        contract_address: AztecAddress,
        note_nonce: Field,
    ) -> Field {
        let retrieved_note = RetrievedNote {
            note: self,
            contract_address,
            metadata: SettledNoteMetadata::new(note_nonce).into(),
        };
        let note_hash_for_nullify = compute_note_hash_for_nullify(retrieved_note, storage_slot);
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
        PublicKeyNote { x, y, owner }
    }
}
