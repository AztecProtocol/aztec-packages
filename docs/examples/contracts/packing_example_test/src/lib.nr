// docs:start:pack_unpack_tests
use aztec::protocol::{address::AztecAddress, traits::{FromField, Packable}};
use packing_example::types::{Card, GameConfig, GameState};

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
    let state = GameState { started: true, round: 0xffffffff, score: 0xffffffff };
    let unpacked = GameState::unpack(state.pack());
    assert_eq(unpacked.started, state.started);
    assert_eq(unpacked.round, state.round);
    assert_eq(unpacked.score, state.score);
}
// docs:end:game_state_tests
// docs:end:pack_unpack_tests
