
use dep::std;
use dep::aztec::abi;
use dep::aztec::abi::PrivateContextInputs;
use dep::aztec::abi::PublicContextInputs;
use dep::aztec::context::Context;
use dep::aztec::types::point::Point;
use dep::aztec::public_call_stack_item::PublicCallStackItem;
use dep::aztec::note::note_getter::NoteGetterOptions;

use dep::token_utils::{
    balance_utils,
    value_note::{
        value_note::ValueNote,
        filter::get_2_notes,
    }
};

use dep::aztec::state_vars::{
    map::Map,
    set::Set,
    public_state::PublicState,
    public_state_value::field_value::{
        FIELD_VALUE_LEN,
        FieldValueInterface,
    },
};

use dep::token_utils::value_note::{
    value_note::ValueNoteInterface,
    value_note::VALUE_NOTE_LEN,
};
// oracles
use dep::aztec::oracle::get_secret_key::get_secret_key;
use dep::aztec::oracle::logs::emit_encrypted_log;
use dep::aztec::oracle::logs::emit_unencrypted_log;

global MAX_CARDS = 2; // Limited by square root of read requests (max 4, so 2)

struct Card {
    inner: Field,
}

impl Card {
    fn default() -> Self {
        Card {
            inner: 1
        }
    }
    fn id(self) -> Field {
        self.inner
    }
    fn dummy() -> Self {
        Card {
            inner: 0
        }
    }
    fn is_dummy(self) -> bool {
        self.inner == 0
    }
    fn points(self) -> u8 {
        self.inner.to_le_bytes(32)[0]
    }
    fn strength(self) -> u8 {
        self.inner.to_le_bytes(32)[1]
    }
}

fn user_cards_private_storage() -> Map<Set<ValueNote, VALUE_NOTE_LEN>> {
    Map::new(1, |s| Set::new(s, ValueNoteInterface))
}
fn user_decks_private_storage() -> Map<Set<ValueNote, VALUE_NOTE_LEN>> {
    Map::new(2, |s| Set::new(s, ValueNoteInterface))
}
fn deck_strength_public_storage() -> Map<PublicState<Field, FIELD_VALUE_LEN>> {
    Map::new(3, |s| PublicState::new(s, FieldValueInterface))
}
fn user_plays_public_storage() -> Map<PublicState<Field, FIELD_VALUE_LEN>> {
    Map::new(4, |s| PublicState::new(s, FieldValueInterface))
}
fn player_order_public_storage() -> Map<PublicState<Field, FIELD_VALUE_LEN>> {
    Map::new(5, |s| PublicState::new(s, FieldValueInterface))
}
fn played_cards_public_storage() -> Map<PublicState<Field, FIELD_VALUE_LEN>> {
    Map::new(6, |s| PublicState::new(s, FieldValueInterface))
}
fn winning_card_public_storage() -> Map<PublicState<Field, FIELD_VALUE_LEN>> {
    Map::new(7, |s| PublicState::new(s, FieldValueInterface))
}
fn game_points_public_storage() -> Map<PublicState<Field, FIELD_VALUE_LEN>> {
    Map::new(8, |s| PublicState::new(s, FieldValueInterface))
}
fn winning_user_public_storage() -> Map<PublicState<Field, FIELD_VALUE_LEN>> {
    Map::new(9, |s| PublicState::new(s, FieldValueInterface))
}
fn user_points_public_storage() -> Map<PublicState<Field, FIELD_VALUE_LEN>> {
    Map::new(10, |s| PublicState::new(s, FieldValueInterface))
}
fn winner_public_storage() -> Map<PublicState<Field, FIELD_VALUE_LEN>> {
    Map::new(11, |s| PublicState::new(s, FieldValueInterface))
}
fn user_pub_key_public_storage() -> Map<PublicState<Field, FIELD_VALUE_LEN>> {
    Map::new(12, |s| PublicState::new(s, FieldValueInterface))
}

fn user_collection_insert(context: Context, owner: Point, card: Card) -> Context {
    user_cards_private_storage().at(card.id()).insert(context, ValueNote::new(card.id(), owner))
}

//TODO HACK needed why can't comptime decay to normal Field when passed to pedersen?
fn user_deck_insert(owner: Point, game_id: Field, i_hack_comptime : comptime Field, i : Field, user_cards: [Card; MAX_CARDS], initialContext: Context) -> pub Context {
    let card_note = ValueNote::new(user_cards[i_hack_comptime].id(), owner);
    let idx = std::hash::pedersen([owner.x, game_id, i])[0];
    user_decks_private_storage().at(idx).insert(initialContext, card_note)
}

fn user_deck_get(initialContext: Context, owner: Point, game_id: Field, i: Field) -> Context {
    let idx = std::hash::pedersen([owner.x, game_id, i])[0];
    let options = NoteGetterOptions::with_filter(get_2_notes, 0);
    let (mut context, notes) = user_decks_private_storage().at(idx).get_notes(initialContext, options);
    // cards.at(game_id).remove(inputs, context,card_note1); // TODO do we remove this?
    context
}

global y = 1;
fn x<T>(x: T) -> T {
    x
}

fn assert_own_card(
    context: Context,
    card: Card, 
    owner: Point
) -> pub Context {
    let options = NoteGetterOptions::with_filter(get_2_notes, 0);
    let (mut context, notes) = user_decks_private_storage().at(card.id()).get_notes(context, options);
    assert(notes[0].owner.x == owner.x);
    context
}
