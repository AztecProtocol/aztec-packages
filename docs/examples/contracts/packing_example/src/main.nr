mod types;

use aztec::macros::aztec;

#[aztec]
pub contract PackingExample {
    use aztec::{
        macros::{functions::{external, initializer}, storage::storage},
        protocol::address::AztecAddress,
        state_vars::PublicMutable,
    };

    use crate::types::{Card, GameConfig};

    #[storage]
    struct Storage {
        card: PublicMutable<Card>,
        config: PublicMutable<GameConfig>,
    }

    #[initializer]
    #[external("public")]
    fn constructor() {}

    #[external("public")]
    fn set_card(strength: u32, points: u32) {
        self.storage.card.write(Card { strength, points });
    }

    #[external("public")]
    fn get_card() -> Card {
        self.storage.card.read()
    }

    #[external("public")]
    fn set_config(interest_accumulator: u128, last_updated_ts: u64, admin: AztecAddress) {
        self.storage.config.write(GameConfig { interest_accumulator, last_updated_ts, admin });
    }
}
