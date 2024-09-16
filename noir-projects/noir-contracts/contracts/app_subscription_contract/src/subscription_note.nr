use dep::aztec::{
    hash::poseidon2_hash_with_separator, note::utils::compute_note_hash_for_nullify,
    keys::getters::get_nsk_app, oracle::unsafe_rand::unsafe_rand,
    prelude::{PrivateContext, NoteHeader, NoteInterface},
    protocol_types::constants::GENERATOR_INDEX__NOTE_NULLIFIER
};

global SUBSCRIPTION_NOTE_LEN: Field = 4;
// SUBSCRIPTION_NOTE_BYTES_LEN * 32 + 32(storage_slot as bytes) + 32(note_type_id as bytes)
global SUBSCRIPTION_NOTE_BYTES_LEN: Field = SUBSCRIPTION_NOTE_LEN * 32 + 64;

#[note]
struct SubscriptionNote {
    // The nullifying public key hash is used with the nsk_app to ensure that the note can be privately spent.
    npk_m_hash: Field,
    expiry_block_number: Field,
    remaining_txs: Field,
    // Randomness of the note to hide its contents
    randomness: Field,
}

impl NoteInterface<SUBSCRIPTION_NOTE_LEN, SUBSCRIPTION_NOTE_BYTES_LEN> for SubscriptionNote {
    fn compute_nullifier(self, context: &mut PrivateContext, note_hash_for_nullify: Field) -> Field {
        let secret = context.request_nsk_app(self.npk_m_hash);
        poseidon2_hash_with_separator(
            [
            note_hash_for_nullify,
            secret
        ],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field
        )
    }

    fn compute_nullifier_without_context(self) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_nullify(self);
        let secret = get_nsk_app(self.npk_m_hash);
        poseidon2_hash_with_separator(
            [
            note_hash_for_nullify,
            secret
        ],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field
        )
    }
}

impl SubscriptionNote {
    pub fn new(npk_m_hash: Field, expiry_block_number: Field, remaining_txs: Field) -> Self {
        let randomness = unsafe {
            unsafe_rand()
        };
        Self { npk_m_hash, expiry_block_number, remaining_txs, randomness, header: NoteHeader::empty() }
    }
}
