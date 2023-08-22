mod cards;
mod game_rules;
mod legendary_card;
mod locked;
mod profiles;
mod queen;

use dep::aztec::state_vars::{
    immutable_singleton::ImmutableSingleton,
    map::Map,
    public_state::PublicState,
    set::Set,
    singleton::Singleton,
};
use dep::aztec::types::type_serialisation::bool_serialisation::{
    BOOL_SERIALISED_LEN,
};

use crate::types::{
    card::{Card, CARD_LEN},
    profile::{Profile, PROFILE_LEN},
    queen::Queen,
    rules::{Rules, RULES_LEN},
};

use queen::QUEEN_SERIALISED_LEN;

// docs:start:storage-declaration
struct Storage {
    locked: PublicState<bool, BOOL_SERIALISED_LEN>,
    queen: PublicState<Queen, QUEEN_SERIALISED_LEN>,
    game_rules: ImmutableSingleton<Rules, RULES_LEN>,
    legendary_card: Singleton<Card, CARD_LEN>,
    cards: Set<Card, CARD_LEN>,
    profiles: Map<Singleton<Profile, PROFILE_LEN>>,
}

impl Storage {
    fn init() -> Self {
        Storage {
            locked: locked::init(1),
            queen: queen::init(2),
            game_rules: game_rules::init(3),
            legendary_card: legendary_card::init(4),
            cards: cards::init(5),
            profiles: profiles::init(6),
        }
    }
}
// docs:end:storage-declaration