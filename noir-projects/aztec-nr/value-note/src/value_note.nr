use dep::aztec::{
    protocol_types::{
    address::AztecAddress, traits::{Deserialize, Serialize},
    constants::GENERATOR_INDEX__NOTE_NULLIFIER
},
    note::{note_header::NoteHeader, note_interface::NoteInterface, utils::compute_note_hash_for_consumption},
    oracle::{unsafe_rand::unsafe_rand, nullifier_key::get_app_nullifier_secret_key, get_public_key::get_public_key},
    log::emit_encrypted_log, hash::poseidon2_hash, context::PrivateContext
};

global VALUE_NOTE_LEN: Field = 3; // 3 plus a header.

// docs:start:value-note-def
#[aztec(note)]
struct ValueNote {
    value: Field,
    // the nullifying public key of the person who owns the note. The owner (recipient) to ensure that the note 
    // can be privately spent. When nullifier secret and encryption private key is same 
    // we can simply use the owner for this one.
    owner_nullifying_public_key_hash: Field,
    randomness: Field,
}
// docs:end:value-note-def

impl NoteInterface<VALUE_NOTE_LEN> for ValueNote {
    // docs:start:nullifier

    fn compute_nullifier(self, context: &mut PrivateContext) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_consumption(self);
        let secret = context.request_app_nullifier_secret_key(self.owner_nullifying_public_key_hash);
        poseidon2_hash([
            note_hash_for_nullify,
            secret,
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        ])
    }

    // docs:end:nullifier

    fn compute_nullifier_without_context(self) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_consumption(self);
        let secret = get_app_nullifier_secret_key(self.owner_nullifying_public_key_hash);
        poseidon2_hash([
            note_hash_for_nullify,
            secret,
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        ])
    }

    // Broadcasts the note as an encrypted log on L1.
    fn broadcast(self, context: &mut PrivateContext, slot: Field) {
        // TODO (ek): Disabled this until we fix the emit log types
        // let encryption_pub_key = get_public_key(self.owner_nullifying_public_key_hash);
        // emit_encrypted_log(
        //     context,
        //     (*context).this_address(),
        //     slot,
        //     Self::get_note_type_id(),
        //     encryption_pub_key,
        //     self.serialize_content(),
        // );
    }
}

impl ValueNote {
    pub fn new(value: Field, owner_nullifying_public_key_hash: Field) -> Self {
        let randomness = unsafe_rand();
        let header = NoteHeader::empty();
        ValueNote { value, randomness, owner_nullifying_public_key_hash, header }
    }
}

impl Serialize<7> for ValueNote {
    fn serialize(self) -> [Field; 7] {
        let header = self.header.serialize();

        [self.value, self.owner_nullifying_public_key_hash, self.randomness, header[0], header[1], header[2], header[3]]
    }
}
