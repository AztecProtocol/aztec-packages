use dep::aztec::prelude::{AztecAddress, PrivateContext, NoteHeader, NoteInterface};
use dep::aztec::{
    protocol_types::constants::GENERATOR_INDEX__NOTE_NULLIFIER, note::utils::compute_note_hash_for_consumption,
    hash::poseidon2_hash,
    oracle::{nullifier_key::get_nsk_app_with_npk_m_h, get_public_key::get_public_key_with_npk_m_h}
};

global SUBSCRIPTION_NOTE_LEN: Field = 3;

// Stores a public key composed of two fields
// TODO: Do we need to include a nonce, in case we want to read/nullify/recreate with the same pubkey value?
#[aztec(note)]
struct SubscriptionNote {
    // The nullifying public key hash of the person who owns the note. 
    // This is used with the app_nullifier_secret_key to ensure that the note can be privately spent.
    owner_npk_m_h: Field,
    expiry_block_number: Field,
    remaining_txs: Field,
}

impl NoteInterface<SUBSCRIPTION_NOTE_LEN> for SubscriptionNote {
    fn compute_nullifier(self, context: &mut PrivateContext) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_consumption(self);
        let secret = context.request_nsk_app_with_npk_m_h(self.owner_npk_m_h);
        poseidon2_hash([
            note_hash_for_nullify,
            secret,
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        ])
    }

    fn compute_nullifier_without_context(self) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_consumption(self);
        let secret = get_nsk_app_with_npk_m_h(self.owner_npk_m_h);
        poseidon2_hash([
            note_hash_for_nullify,
            secret,
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        ])
    }

    // Broadcasts the note as an encrypted log on L1.
    fn broadcast(self, context: &mut PrivateContext, slot: Field) {
        let encryption_pub_key = get_public_key_with_npk_m_h(self.owner_npk_m_h);
        context.emit_encrypted_log(
            (*context).this_address(),
            slot,
            Self::get_note_type_id(),
            encryption_pub_key,
            self.serialize_content(),
        );
    }
}

impl SubscriptionNote {
    pub fn new(owner_npk_m_h: Field, expiry_block_number: Field, remaining_txs: Field) -> Self {
        SubscriptionNote { owner_npk_m_h, expiry_block_number, remaining_txs, header: NoteHeader::empty() }
    }
}
