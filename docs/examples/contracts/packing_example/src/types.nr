use aztec::protocol::{
    address::AztecAddress,
    traits::{FromField, Packable, Serialize, ToField},
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

// docs:start:card_custom_packable
// Two u32 values packed into a single Field.
// Derived Packable would give N = 2; manual packing gives N = 1.
#[derive(Eq, Serialize)]
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

// docs:start:pack_unpack_tests
mod test {
    use super::{AztecAddress, Card, FromField, GameConfig, Packable};

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
}
// docs:end:pack_unpack_tests
