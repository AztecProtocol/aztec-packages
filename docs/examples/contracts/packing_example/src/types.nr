use aztec::macros::notes::note;
use aztec::protocol::{
    address::AztecAddress,
    traits::{Deserialize, FromField, Packable, Serialize, ToField},
};
use std::meta::derive;

// docs:start:derived_packable
// When all members are Field-sized, derive(Packable) is sufficient.
// Each member gets its own Field -- no packing benefit, but no manual work needed.
#[derive(Eq, Packable, Serialize)]
pub struct ServerConfig {
    pub admin: AztecAddress,
    pub token: AztecAddress,
    pub max_supply: Field,
}
// N = 3 (one Field per member)
// docs:end:derived_packable

// docs:start:field_like_note
// A note whose members are already Field-sized.
// #[note] requires Packable; derive is sufficient here -- N = 1.
#[derive(Deserialize, Eq, Packable, Serialize)]
#[note]
pub struct OwnerNote {
    pub owner: AztecAddress,
}
// docs:end:field_like_note

// docs:start:card_note
// A note with two u32 members. Derived Packable would give N = 2;
// a custom impl halves that to N = 1, reducing note-hash inputs.
#[derive(Eq)]
#[note]
pub struct CardNote {
    pub strength: u32,
    pub points: u32,
}

impl Packable for CardNote {
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
// docs:end:card_note

// docs:start:card_custom_packable
// Two u32 values packed into a single Field.
// Derived Packable would give N = 2; manual packing gives N = 1.
#[derive(Deserialize, Eq, Serialize)]
pub struct Card {
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
// docs:end:card_custom_packable

// docs:start:mixed_width_packable
// Mixed-width integers: a u128 and a u64 packed into one Field,
// plus an AztecAddress that takes a full Field on its own.
// Derived Packable would give N = 3; manual packing gives N = 2.
#[derive(Eq, Serialize)]
pub struct GameConfig {
    pub interest_accumulator: u128,
    pub last_updated_ts: u64,
    pub admin: AztecAddress,
}

impl Packable for GameConfig {
    let N: u32 = 2;

    fn pack(self) -> [Field; Self::N] {
        [
            // u128 (128 bits) + u64 (64 bits) = 192 bits, fits in one Field
            (self.interest_accumulator as Field) * 2.pow_32(64)
                + (self.last_updated_ts as Field),
            self.admin.to_field(),
        ]
    }

    fn unpack(packed: [Field; Self::N]) -> Self {
        let last_updated_ts = packed[0] as u64;
        let interest_accumulator =
            ((packed[0] - last_updated_ts as Field) / 2.pow_32(64)) as u128;
        let admin = AztecAddress::from_field(packed[1]);
        Self { interest_accumulator, last_updated_ts, admin }
    }
}
// docs:end:mixed_width_packable

// docs:start:game_state_manual_packable
// Mixed-width with a bool: started (1 bit) + round (32 bits) + score (32 bits).
// Derived Packable would give N = 3; manual packing gives N = 1.
#[derive(Eq, Serialize)]
pub struct GameState {
    pub started: bool,
    pub round: u32,
    pub score: u32,
}

impl Packable for GameState {
    let N: u32 = 1;

    // docs:start:game_state_pack
    fn pack(self) -> [Field; Self::N] {
        // Layout within a single Field:
        // [ started (1 bit) | round (32 bits) | score (32 bits) ]
        //   bit 64            bits 32..63       bits 0..31
        [
            (self.started as Field) * 2.pow_32(64) // shift left by 64 bits
                + (self.round as Field) * 2.pow_32(32) // shift left by 32 bits
                + (self.score as Field), // lowest bits
        ]
    }
    // docs:end:game_state_pack

    // docs:start:game_state_unpack
    fn unpack(packed: [Field; Self::N]) -> Self {
        // 1. Extract lowest value via truncating cast
        let score = packed[0] as u32;

        // 2. Subtract and shift right to get next value
        let round = ((packed[0] - score as Field) / 2.pow_32(32)) as u32;

        // 3. Subtract and shift right to get highest value.
        //    Bools are extracted by comparing the resulting Field to 0.
        let started = ((packed[0] - score as Field - (round as Field) * 2.pow_32(32))
            / 2.pow_32(64))
            != 0;

        Self { started, round, score }
    }
    // docs:end:game_state_unpack
}
// docs:end:game_state_manual_packable

// docs:start:pack_unpack_tests
mod test {
    use super::{AztecAddress, Card, FromField, GameConfig, GameState, Packable};

    #[test]
    fn test_card_pack_unpack() {
        let card = Card { strength: 42, points: 100 };
        let unpacked = Card::unpack(card.pack());
        assert_eq(unpacked.strength, card.strength);
        assert_eq(unpacked.points, card.points);
    }

    #[test]
    fn test_card_pack_unpack_max() {
        let card = Card { strength: 0xffffffff, points: 0xffffffff };
        let unpacked = Card::unpack(card.pack());
        assert_eq(unpacked.strength, card.strength);
        assert_eq(unpacked.points, card.points);
    }

    #[test]
    fn test_config_pack_unpack() {
        let config = GameConfig {
            interest_accumulator: 1000000,
            last_updated_ts: 1700000000,
            admin: AztecAddress::from_field(0xabcdef),
        };
        let unpacked = GameConfig::unpack(config.pack());
        assert_eq(unpacked.interest_accumulator, config.interest_accumulator);
        assert_eq(unpacked.last_updated_ts, config.last_updated_ts);
        assert(unpacked.admin.eq(config.admin));
    }

    #[test]
    fn test_config_pack_unpack_max() {
        let config = GameConfig {
            interest_accumulator: 0xffffffffffffffffffffffffffffffff,
            last_updated_ts: 0xffffffffffffffff,
            admin: AztecAddress::from_field(0xabcdef),
        };
        let unpacked = GameConfig::unpack(config.pack());
        assert_eq(unpacked.interest_accumulator, config.interest_accumulator);
        assert_eq(unpacked.last_updated_ts, config.last_updated_ts);
        assert(unpacked.admin.eq(config.admin));
    }

    // docs:start:game_state_tests
    #[test]
    fn test_game_state_pack_unpack() {
        let state = GameState { started: true, round: 42, score: 1000 };
        let unpacked = GameState::unpack(state.pack());
        assert_eq(unpacked.started, state.started);
        assert_eq(unpacked.round, state.round);
        assert_eq(unpacked.score, state.score);
    }

    #[test]
    fn test_game_state_pack_unpack_max() {
        let state =
            GameState { started: true, round: 0xffffffff, score: 0xffffffff };
        let unpacked = GameState::unpack(state.pack());
        assert_eq(unpacked.started, state.started);
        assert_eq(unpacked.round, state.round);
        assert_eq(unpacked.score, state.score);
    }
    // docs:end:game_state_tests
}
// docs:end:pack_unpack_tests
