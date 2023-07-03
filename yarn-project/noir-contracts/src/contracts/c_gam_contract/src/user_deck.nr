
use dep::std;
use dep::aztec3::abi;
use dep::aztec3::abi::PrivateContextInputs;
use dep::aztec3::abi::PublicContextInputs;
use dep::aztec3::context::PrivateFunctionContext;
use dep::aztec3::notes::value_note::Note;
use dep::aztec3::types::point::Point;
use dep::aztec3::state_vars::map::Map;
use dep::aztec3::state_vars::storage_map::StorageMap;
use dep::aztec3::state_vars::storage_field::StorageField;
use dep::aztec3::state_vars::set::Set;
use dep::aztec3::public_call_stack_item::PublicCallStackItem;

// oracles
use dep::aztec3::oracle::get_secret_key::get_secret_key;
use dep::aztec3::oracle::logs::emit_encrypted_log;
use dep::aztec3::oracle::logs::emit_unencrypted_log;

// use card::Card; // TODO WHY CANT WE DO THIS
use crate::hash_with_storage_slot;
    
//users' deck
global user_deck = Map { storage_slot: 5 };
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

//TODO should not be a contract function !!
//TODO HACK needed why can't comptime decay to normal Field when passed to pedersen?
fn user_deck_insert(owner: Point, g_id: Field, i_hack_comptime : comptime Field, i : Field, user_cards: [Card; MAX_CARDS], initialContext: PrivateFunctionContext) -> pub PrivateFunctionContext{
    let card_note = Note::new(user_cards[i_hack_comptime].id(), owner);
    let idx = std::hash::pedersen([owner.x, g_id, i])[0];
    user_deck.at(idx).insert(initialContext, card_note)
}
