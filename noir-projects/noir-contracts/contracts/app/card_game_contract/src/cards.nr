use aztec::{
    context::{PrivateContext, UtilityContext},
    keys::getters::get_public_keys,
    messages::delivery::MessageDelivery,
    note::{
        constants::MAX_NOTES_PER_PAGE, HintedNote, note_getter_options::NoteGetterOptions,
        note_viewer_options::NoteViewerOptions,
    },
    protocol::{
        address::AztecAddress,
        constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
        traits::{Deserialize, FromField, Packable, Serialize, ToField},
    },
    state_vars::{Owned, PrivateSet, StateVariable},
};
use field_note::FieldNote;
use std::meta::derive;

#[derive(Serialize, Deserialize)]
pub struct Card {
    // We use u32s since u16s are unsupported
    pub strength: u32,
    pub points: u32,
}

impl Packable for Card {
    let N: u32 = 1;

    fn pack(self) -> [Field; Self::N] {
        [(self.strength as Field) * 2.pow_32(32) + (self.points as Field)]
    }

    fn unpack(packed: [Field; Self::N]) -> Self {
        let points = packed[0] as u32;
        let strength = ((packed[0] - points as Field) / 2.pow_32(32)) as u32;
        Self { strength, points }
    }
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

mod test {
    use super::{Card, FromField, Packable, ToField};

    #[test]
    fn test_to_from_field() {
        let field = 1234567890;
        let card = Card::from_field(field);
        assert(card.to_field() == field);
    }

    #[test]
    fn test_pack_unpack_card() {
        let card = Card { strength: 42, points: 100 };
        let unpacked = Card::unpack(card.pack());
        assert_eq(unpacked.strength, card.strength);
        assert_eq(unpacked.points, card.points);
    }

    #[test]
    fn test_pack_unpack_card_zeros() {
        let card = Card { strength: 0, points: 0 };
        let unpacked = Card::unpack(card.pack());
        assert_eq(unpacked.strength, 0);
        assert_eq(unpacked.points, 0);
    }

    #[test]
    fn test_pack_unpack_card_max() {
        let card = Card { strength: 0xffffffff, points: 0xffffffff };
        let unpacked = Card::unpack(card.pack());
        assert_eq(unpacked.strength, card.strength);
        assert_eq(unpacked.points, card.points);
    }
}

pub struct CardNote {
    card: Card,
    note: FieldNote,
}

impl CardNote {
    pub fn from_card(card: Card) -> CardNote {
        CardNote { card, note: FieldNote { value: card.to_field() } }
    }

    pub fn from_note(note: FieldNote) -> CardNote {
        CardNote { card: Card::from_field(note.value), note }
    }
}

pub struct Deck<Context> {
    owned_set: Owned<PrivateSet<FieldNote, Context>, Context>,
}

// TODO(#13824): remove this impl once we allow structs to hold state variables.
impl<Context> StateVariable<1, Context> for Deck<Context> {
    fn new(context: Context, storage_slot: Field) -> Self {
        Deck { owned_set: Owned::new(context, storage_slot) }
    }

    fn get_storage_slot(self) -> Field {
        self.owned_set.get_storage_slot()
    }
}

pub fn filter_cards<let N: u32>(
    hinted_notes: [Option<HintedNote<FieldNote>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
    desired_cards: [Card; N],
) -> [Option<HintedNote<FieldNote>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] {
    let mut selected = [Option::none(); MAX_NOTE_HASH_READ_REQUESTS_PER_CALL];

    let mut found = [false; N];

    for i in 0..hinted_notes.len() {
        let hinted_note = hinted_notes[i];
        if hinted_note.is_some() {
            let card_note = CardNote::from_note(hinted_note.unwrap_unchecked().note);
            for j in 0..N {
                if !found[j]
                    & (card_note.card.strength == desired_cards[j].strength)
                    & (card_note.card.points == desired_cards[j].points) {
                    selected[i] = hinted_note;
                    found[j] = true;
                }
            }
        }
    }

    selected
}

impl<Context> Deck<Context> {
    pub fn new(context: Context, storage_slot: Field) -> Self {
        let owned_set = Owned::new(context, storage_slot);
        Deck { owned_set }
    }
}

impl Deck<&mut PrivateContext> {
    pub fn add_cards<let N: u32>(&mut self, cards: [Card; N], owner: AztecAddress) -> [CardNote] {
        let mut inserted_cards = @[];
        for card in cards {
            let card_note = CardNote::from_card(card);
            self.owned_set.at(owner).insert(card_note.note).deliver(MessageDelivery::onchain_constrained().with_sender(
                owner,
            ));
            inserted_cards = inserted_cards.push_back(card_note);
        }

        inserted_cards
    }

    pub fn remove_cards<let N: u32>(&mut self, cards: [Card; N], owner: AztecAddress) {
        let options = NoteGetterOptions::with_filter(filter_cards, cards);
        let notes = self.owned_set.at(owner).pop_notes(options);
        assert(notes.len() == N, "Not all cards were removed");
    }
}

impl Deck<UtilityContext> {
    pub unconstrained fn view_cards(self, owner: AztecAddress, offset: u32) -> BoundedVec<Card, MAX_NOTES_PER_PAGE> {
        let options = NoteViewerOptions::new().set_offset(offset);
        let notes = self.owned_set.at(owner).view_notes(options);

        notes.map(|note| Card::from_field(note.value))
    }
}

global PACK_CARDS: u32 = 3; // Limited by number of write requests (max 4)

pub fn get_pack_cards(seed: Field, owner: AztecAddress, context: &mut PrivateContext) -> [Card; PACK_CARDS] {
    let owner_npk_m_hash = get_public_keys(owner).npk_m_hash;

    // generate pseudo randomness deterministically from 'seed' and user secret
    let secret = context.request_nhk_app(owner_npk_m_hash);
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
