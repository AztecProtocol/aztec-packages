use dep::aztec::{
    protocol_types::{address::AztecAddress, traits::Empty, constants::GENERATOR_INDEX__NOTE_NULLIFIER},
    note::{note_header::NoteHeader, note_interface::NoteInterface, utils::compute_note_hash_for_consumption},
    oracle::{
    unsafe_rand::unsafe_rand, nullifier_key::get_nsk_app_with_npk_m_h,
    get_public_key::get_public_key_with_npk_m_h
},
    context::PrivateContext, hash::poseidon2_hash
};

global ADDRESS_NOTE_LEN: Field = 3;

// docs:start:address_note_def
// Stores an address
#[aztec(note)]
struct AddressNote {
    address: AztecAddress,
    // The nullifying public key hash of the person who owns the note. 
    // This is used with the app_nullifier_secret_key to ensure that the note can be privately spent.
    owner_npk_m_h: Field,
    randomness: Field,
}

impl NoteInterface<ADDRESS_NOTE_LEN> for AddressNote {
    fn compute_nullifier(self, context: &mut PrivateContext) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_consumption(self);
        let secret = context.request_nsk_app(self.owner_npk_m_h);
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
        // docs:start:encrypted
        context.emit_encrypted_log(
            (*context).this_address(),
            slot,
            Self::get_note_type_id(),
            encryption_pub_key,
            self.serialize_content(),
        );
        // docs:end:encrypted
    }
}

impl AddressNote {
    pub fn new(address: AztecAddress, owner_npk_m_h: Field) -> Self {
        let randomness = unsafe_rand();
        AddressNote { address, owner_npk_m_h, randomness, header: NoteHeader::empty() }
    }
    // docs:end:address_note_def
}
