use dep::aztec::note::{
    note_header::NoteHeader,
    note_interface::NoteInterface,
    utils::compute_note_hash_for_read_or_nullify,
};
use dep::aztec::oracle::{
    get_secret_key::get_secret_key,
    get_public_key::get_public_key,
};

global CARD_LEN: Field = 3;

// docs:start:state_vars-NoteCard
struct Card {
    points: u8,
    secret: Field,
    owner: Field,
    header: NoteHeader,
}
// docs:end:state_vars-NoteCard

impl Card {
    fn new(points: u8, secret: Field, owner: Field) -> Self {
        Card {
            points,
            secret,
            owner,
            header: NoteHeader::empty(),
        }
    }

    fn serialise(self) -> [Field; CARD_LEN] {
        [self.points as Field, self.secret, self.owner]
    }

    fn deserialise(preimage: [Field; CARD_LEN]) -> Self {
        Card {
            points: preimage[0] as u8,
            secret: preimage[1],
            owner: preimage[2],
            header: NoteHeader::empty(),
        }
    }

    fn compute_note_hash(self) -> Field {
        dep::std::hash::pedersen([
            self.points as Field, 
            self.secret,
            self.owner,
        ])[0]
    }

    fn compute_nullifier(self) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_read_or_nullify(CardMethods, self);
        let owner_nullifying_public_key = get_public_key(self.owner);
        // TODO: get_secret_key should just accept an address
        // TODO!
        let secret = get_secret_key(owner_nullifying_public_key);
        dep::std::hash::pedersen([
            note_hash_for_nullify,
            secret,
        ])[0]
    }

    fn set_header(&mut self, header: NoteHeader) {
        self.header = header;
    }
}

fn deserialise(preimage: [Field; CARD_LEN]) -> Card {
    Card::deserialise(preimage)
}

fn serialise(note: Card) -> [Field; CARD_LEN] {
    note.serialise()
}

fn compute_note_hash(note: Card) -> Field {
    note.compute_note_hash()
}

fn compute_nullifier(note: Card) -> Field {
    note.compute_nullifier()
}

fn get_header(note: Card) -> NoteHeader {
    note.header
}

fn set_header(note: &mut Card, header: NoteHeader) {
    note.set_header(header)
}

global CardMethods = NoteInterface {
    deserialise,
    serialise,
    compute_note_hash,
    compute_nullifier,
    get_header,
    set_header,
};
