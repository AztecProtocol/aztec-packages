use dep::aztec::{
    note::{
        note_header::NoteHeader,
        note_interface::NoteInterface,
        utils::compute_note_hash_for_read_or_nullify,
    },
    oracle::{
        rand::rand,
        get_secret_key::get_secret_key,
        get_public_key::get_public_key,
    },
    log::emit_encrypted_log,
    hash::pedersen_hash,
    context::PrivateContext,
};

global FIELD_NOTE_LEN: Field = 3;

// Stores a field
struct FieldNote {
    value: Field,
    owner: Field,
    randomness: Field,
    header: NoteHeader,
}

impl FieldNote {
    pub fn new(value: Field, owner: Field) -> Self {
        let randomness = rand();
        FieldNote {
            value,
            owner,
            randomness,
            header: NoteHeader::empty(),
        }
    }

    pub fn serialize(self) -> [Field; FIELD_NOTE_LEN]{
        [self.address, self.owner, self.randomness]
    }

    pub fn deserialize(preimage: [Field; FIELD_NOTE_LEN]) -> Self {
        FieldNote {
            address: preimage[0],
            owner: preimage[1],
            randomness: preimage[2],
            header: NoteHeader::empty(),
        }
    }

    pub fn compute_note_hash(self) -> Field {
        // TODO(#1205) Should use a non-zero generator index.
        pedersen_hash(self.serialize(), 0)
    }

    pub fn compute_nullifier(self) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_read_or_nullify(FieldNoteMethods, self);
        let secret = get_secret_key(self.owner);
        // TODO(#1205) Should use a non-zero generator index.
        pedersen_hash([
            note_hash_for_nullify,
            secret.low,
            secret.high,
        ], 0)
    }

    pub fn set_header(&mut self, header: NoteHeader) {
        self.header = header;
    }

    // Broadcasts the note as an encrypted log on L1.
    pub fn broadcast(self, context: &mut PrivateContext, slot: Field) {
        let encryption_pub_key = get_public_key(self.owner);
        emit_encrypted_log(
            context,
            (*context).this_address(),
            slot,
            encryption_pub_key,
            self.serialize(),
        );
    }
}

fn deserialize(preimage: [Field; FIELD_NOTE_LEN]) -> FieldNote {
    FieldNote::deserialize(preimage)
}

fn serialize(note: FieldNote) -> [Field; FIELD_NOTE_LEN]{
    note.serialize()
}

fn compute_note_hash(note: FieldNote) -> Field {
    note.compute_note_hash()
}

fn compute_nullifier(note: FieldNote) -> Field {
    note.compute_nullifier()
}

fn get_header(note: FieldNote) -> NoteHeader {
    note.header
}

fn set_header(note: &mut FieldNote, header: NoteHeader) {
    note.set_header(header);
}

// Broadcasts the note as an encrypted log on L1.
fn broadcast(context: &mut PrivateContext, slot: Field, note: FieldNote) {
    note.broadcast(context, slot);
}

global FieldNoteMethods = NoteInterface {
    deserialize,
    serialize,
    compute_note_hash,
    compute_nullifier,
    get_header,
    set_header,
    broadcast,
};
