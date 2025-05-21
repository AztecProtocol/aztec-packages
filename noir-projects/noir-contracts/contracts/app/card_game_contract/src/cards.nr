use dep::aztec::prelude::{NoteGetterOptions, NoteViewerOptions, PrivateContext, RetrievedNote};

use dep::aztec::{
    context::UtilityContext,
    keys::getters::get_public_keys,
    messages::logs::note::encode_and_encrypt_note,
    note::constants::MAX_NOTES_PER_PAGE,
    protocol_types::{
        address::AztecAddress,
        constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
        traits::{FromField, Hash, Serialize, ToField},
    },
    state_vars::{PrivateSet, storage::Storage},
};
use dep::value_note::value_note::ValueNote;
use std::meta::derive;

#[derive(Serialize)]
pub struct Card {
    // We use u32s since u16s are unsupported
    strength: u32,
    points: u32,
}

impl FromField for Card {
    fn from_field(field: Field) -> Card {
        let value_bytes: [u8; 32] = field.to_le_bytes();
        let strength = (value_bytes[0] as u32) + (value_bytes[1] as u32) * 256;
        let points = (value_bytes[2] as u32) + (value_bytes[3] as u32) * 256;
        Card { strength, points }
    }
}

impl ToField for Card {
    fn to_field(self) -> Field {
        self.strength as Field + (self.points as Field) * 65536
    }
}

// docs:start:pure_noir_testing
#[test]
fn test_to_from_field() {
    let field = 1234567890;
    let card = Card::from_field(field);
    assert(card.to_field() == field);
}
// docs:end:pure_noir_testing

pub struct CardNote {
    card: Card,
    note: ValueNote,
}

impl CardNote {
    fn new(strength: u32, points: u32, owner: AztecAddress) -> Self {
        let card = Card { strength, points };
        CardNote::from_card(card, owner)
    }

    pub fn from_card(card: Card, owner: AztecAddress) -> CardNote {
        CardNote { card, note: ValueNote::new(card.to_field(), owner) }
    }

    pub fn from_note(note: ValueNote) -> CardNote {
        CardNote { card: Card::from_field(note.value), note }
    }
}

pub struct Deck<Context> {
    set: PrivateSet<ValueNote, Context>,
}

// TODO(#13824): remove this impl once we allow structs to hold state variables.
impl<Context> Storage<1> for Deck<Context> {
    fn get_storage_slot(self) -> Field {
        self.set.get_storage_slot()
    }
}

pub fn filter_cards<let N: u32>(
    retrieved_notes: [Option<RetrievedNote<ValueNote>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
    desired_cards: [Card; N],
) -> [Option<RetrievedNote<ValueNote>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] {
    let mut selected = [Option::none(); MAX_NOTE_HASH_READ_REQUESTS_PER_CALL];

    let mut found = [false; N];

    for i in 0..retrieved_notes.len() {
        let retrieved_note = retrieved_notes[i];
        if retrieved_note.is_some() {
            let card_note = CardNote::from_note(retrieved_note.unwrap_unchecked().note);
            for j in 0..N {
                if !found[j]
                    & (card_note.card.strength == desired_cards[j].strength)
                    & (card_note.card.points == desired_cards[j].points) {
                    selected[i] = retrieved_note;
                    found[j] = true;
                }
            }
        }
    }

    selected
}

impl<Context> Deck<Context> {
    pub fn new(context: Context, storage_slot: Field) -> Self {
        let set = PrivateSet { context, storage_slot };
        Deck { set }
    }
}

impl Deck<&mut PrivateContext> {
    pub fn add_cards<let N: u32>(&mut self, cards: [Card; N], owner: AztecAddress) -> [CardNote] {
        let mut inserted_cards = &[];
        for card in cards {
            let card_note = CardNote::from_card(card, owner);
            self.set.insert(card_note.note).emit(encode_and_encrypt_note(
                self.set.context,
                owner,
                self.set.context.msg_sender(),
            ));
            inserted_cards = inserted_cards.push_back(card_note);
        }

        inserted_cards
    }

    pub fn remove_cards<let N: u32>(&mut self, cards: [Card; N]) {
        let options = NoteGetterOptions::with_filter(filter_cards, cards);
        let notes = self.set.pop_notes(options);
        assert(notes.len() == N, "Not all cards were removed");
    }
}

impl Deck<UtilityContext> {
    pub unconstrained fn view_cards(self, offset: u32) -> BoundedVec<Card, MAX_NOTES_PER_PAGE> {
        let mut options = NoteViewerOptions::new();
        let notes = self.set.view_notes(options.set_offset(offset));

        // TODO: ideally we'd do let cards = notes.map(|note| Cards::from_field(note.value));
        // see https://github.com/noir-lang/noir/pull/5250
        let mut cards = BoundedVec::new();
        cards.len = notes.len();
        for i in 0..notes.len() {
            cards.storage[i] = Card::from_field(notes.get_unchecked(i).value);
        }

        cards
    }
}

global PACK_CARDS: u32 = 3; // Limited by number of write requests (max 4)

pub fn get_pack_cards(
    seed: Field,
    owner: AztecAddress,
    context: &mut PrivateContext,
) -> [Card; PACK_CARDS] {
    let owner_npk_m_hash = get_public_keys(owner).npk_m.hash();

    // generate pseudo randomness deterministically from 'seed' and user secret
    let secret = context.request_nsk_app(owner_npk_m_hash);
    let mix = secret + seed;
    let mix_bytes: [u8; 32] = mix.to_le_bytes();
    let random_bytes = sha256::digest(mix_bytes);

    let mut cards = [Card::from_field(0); PACK_CARDS];
    // we generate PACK_CARDS cards
    assert(PACK_CARDS < 8, "Cannot generate more than 8 cards");
    for i in 0..PACK_CARDS {
        let strength = (random_bytes[i] as u32) + (random_bytes[i + 1] as u32) * 256;
        let points = (random_bytes[i + 2] as u32) + (random_bytes[i + 3] as u32) * 256;
        cards[i] = Card { strength, points };
    }

    cards
}

pub fn compute_deck_strength<let N: u32>(cards: [Card; N]) -> Field {
    cards.fold(0, |acc, card: Card| acc + card.strength as Field)
}
