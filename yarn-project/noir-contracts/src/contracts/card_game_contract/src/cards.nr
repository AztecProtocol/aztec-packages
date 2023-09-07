use dep::aztec::{
    context::{PrivateContext, PublicContext},
    constants_gen::{MAX_NOTES_PER_PAGE},
    log::emit_encrypted_log,
    note::{
        note_getter_options::NoteGetterOptions,
        note_viewer_options::NoteViewerOptions,
        note_getter::view_notes,
    },
    oracle::{
        get_public_key::get_public_key,
        get_secret_key::get_secret_key,
    },
    state_vars::set::Set,
    types::point::Point,
};
use dep::std;
use dep::std::{
    unsafe::zeroed,
    option::Option,
};
use dep::value_note::{
    value_note::{ValueNote, ValueNoteMethods, VALUE_NOTE_LEN},
};

struct Card {
    strength: u16,
    points: u16,
}

struct CardNote {
    card: Card,
    note: ValueNote,
}

impl CardNote {
    fn new(
        strength: u16,
        points: u16,
        owner: Field,
    ) -> Self {
        CardNote {
            card: Card {
                strength,
                points,
            },
            note: ValueNote::new(strength as Field + (points as Field)*65536, owner),
        }
    }

    fn from_note(note: ValueNote) -> CardNote {
        let value_bytes = note.value.to_le_bytes(32);
        let points = (value_bytes[0] as u16) + (value_bytes[1] as u16) * 256;
        let strength = (value_bytes[2] as u16) + (value_bytes[3] as u16) * 256;

        CardNote {
            card: Card {
                strength,
                points,
            },
            note,
        }
    }
}

struct Deck {
    set: Set<ValueNote, VALUE_NOTE_LEN>,
}

impl Deck {
    fn new(
        private_context: Option<&mut PrivateContext>,
        public_context: Option<&mut PublicContext>,
        storage_slot: Field,
    ) -> Self {
        let set = Set {
            private_context,
            public_context,
            storage_slot,
            note_interface: ValueNoteMethods,
        };
        Deck {
            set
        }
    }

    fn add_cards<N>(&mut self, cards: [CardNote; N], owner: Field) -> [CardNote]{
        let owner_key = get_public_key(owner);
        let context = self.set.private_context.unwrap();

        let mut inserted_cards = [];
        for card in cards {
            let mut mutable_card = card;
            self.set.insert(&mut mutable_card.note);
            emit_encrypted_log(
                context,
                (*context).this_address(),
                self.set.storage_slot,
                owner_key,
                mutable_card.note.serialise(),
            );
            inserted_cards = inserted_cards.push_back(mutable_card);
        }

        inserted_cards
    }

    unconstrained fn view_cards(self, offset: u32) -> [Option<CardNote>; MAX_NOTES_PER_PAGE] {
        let options = NoteViewerOptions::new().set_offset(offset);
        let opt_notes = self.set.view_notes(options);
        let mut opt_cards = [Option::none(); MAX_NOTES_PER_PAGE];
        
        for i in 0..opt_notes.len() {
            opt_cards[i] = opt_notes[i].map(CardNote::from_note);
        }

        opt_cards
    }

}

global PACK_CARDS = 3; // Limited by number of write requests (max 4)

fn get_pack_cards(
    seed: Field,
    owner_address: Field
) -> [CardNote; PACK_CARDS] {
    // generate pseudo randomness deterministically from 'seed' and user secret
    let secret = get_secret_key(owner_address);
    let mix = secret.high + secret.low + seed;
    let random_bytes = std::hash::sha256(mix.to_le_bytes(32));

    let mut cards = [zeroed(); PACK_CARDS];
    // we generate PACK_CARDS cards
    assert((PACK_CARDS as u64) < 8, "Cannot generate more than 8 cards");
    for i in 0..PACK_CARDS {
        let strength = (random_bytes[i] as u16) + (random_bytes[i + 1] as u16) * 256;
        let points = (random_bytes[i + 2] as u16) + (random_bytes[i + 3] as u16) * 256;
        cards[i] = CardNote::new(strength, points, owner_address);
    }

    cards
}