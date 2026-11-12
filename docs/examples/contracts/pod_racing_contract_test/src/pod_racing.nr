use crate::{helpers, helpers::GAME_ID, utils};
use aztec::protocol::address::AztecAddress;
use pod_racing_contract::PodRacing;

// docs:start:test-initializer
#[test]
unconstrained fn test_initializer() {
    let (env, contract_address, admin) = utils::setup();

    let stored_admin: AztecAddress = env.public_context_at(contract_address, |context| {
        context.storage_read(PodRacing::storage_layout().admin.slot)
    });
    assert_eq(stored_admin, admin);
}
// docs:end:test-initializer

#[test]
unconstrained fn test_create_game() {
    let (mut env, contract_address, _) = utils::setup();
    let player1 = env.create_light_account();

    env.call_public(player1, PodRacing::at(contract_address).create_game(GAME_ID));

    let race = utils::read_race(env, contract_address, GAME_ID);
    assert_eq(race.player1, player1);
    assert_eq(race.player2, AztecAddress::zero());
}

#[test(should_fail_with = "game already exists")]
unconstrained fn test_fail_create_duplicate_game() {
    let (mut env, contract_address, _) = utils::setup();
    let player1 = env.create_light_account();

    env.call_public(player1, PodRacing::at(contract_address).create_game(GAME_ID));
    env.call_public(player1, PodRacing::at(contract_address).create_game(GAME_ID));
}

#[test]
unconstrained fn test_join_game() {
    let (mut env, contract_address, _) = utils::setup();
    let player1 = env.create_light_account();
    let player2 = env.create_light_account();

    helpers::setup_two_player_game(&mut env, contract_address, player1, player2, GAME_ID);

    let race = utils::read_race(env, contract_address, GAME_ID);
    assert_eq(race.player1, player1);
    assert_eq(race.player2, player2);
}

#[test(should_fail_with = "game does not exist")]
unconstrained fn test_fail_join_nonexistent_game() {
    let (mut env, contract_address, _) = utils::setup();
    let player2 = env.create_light_account();

    env.call_public(player2, PodRacing::at(contract_address).join_game(GAME_ID));
}

#[test(should_fail_with = "cannot join your own game")]
unconstrained fn test_fail_same_player_joins_twice() {
    let (mut env, contract_address, _) = utils::setup();
    let player1 = env.create_light_account();

    env.call_public(player1, PodRacing::at(contract_address).create_game(GAME_ID));
    env.call_public(player1, PodRacing::at(contract_address).join_game(GAME_ID));
}

#[test]
unconstrained fn test_play_round() {
    let (mut env, contract_address, _) = utils::setup();
    let player1 = env.create_light_account();
    let player2 = env.create_light_account();
    helpers::setup_two_player_game(&mut env, contract_address, player1, player2, GAME_ID);

    helpers::play_round_with_allocation(
        &mut env,
        contract_address,
        player1,
        GAME_ID,
        1,
        helpers::balanced_allocation(),
    );

    assert_eq(utils::read_race(env, contract_address, GAME_ID).player1_round, 1);
}

// docs:start:test-fail-too-many-points
#[test(should_fail_with = "a round allows at most 9 points")]
unconstrained fn test_fail_play_round_too_many_points() {
    let (mut env, contract_address, _) = utils::setup();
    let player1 = env.create_light_account();
    let player2 = env.create_light_account();
    helpers::setup_two_player_game(&mut env, contract_address, player1, player2, GAME_ID);

    env.call_private(player1, PodRacing::at(contract_address).play_round(GAME_ID, 1, 2, 2, 2, 2, 2));
}
// docs:end:test-fail-too-many-points

#[test]
unconstrained fn test_play_round_with_max_points() {
    let (mut env, contract_address, _) = utils::setup();
    let player1 = env.create_light_account();
    let player2 = env.create_light_account();
    helpers::setup_two_player_game(&mut env, contract_address, player1, player2, GAME_ID);

    helpers::play_round_with_allocation(
        &mut env,
        contract_address,
        player1,
        GAME_ID,
        1,
        helpers::aggressive_allocation(),
    );

    assert_eq(utils::read_race(env, contract_address, GAME_ID).player1_round, 1);
}

#[test]
unconstrained fn test_play_round_with_zero_points() {
    let (mut env, contract_address, _) = utils::setup();
    let player1 = env.create_light_account();
    let player2 = env.create_light_account();
    helpers::setup_two_player_game(&mut env, contract_address, player1, player2, GAME_ID);

    env.call_private(player1, PodRacing::at(contract_address).play_round(GAME_ID, 1, 0, 0, 0, 0, 0));

    assert_eq(utils::read_race(env, contract_address, GAME_ID).player1_round, 1);
}

#[test(should_fail_with = "rounds must be played in order")]
unconstrained fn test_fail_skip_round() {
    let (mut env, contract_address, _) = utils::setup();
    let player1 = env.create_light_account();
    let player2 = env.create_light_account();
    helpers::setup_two_player_game(&mut env, contract_address, player1, player2, GAME_ID);

    helpers::play_round_with_allocation(
        &mut env,
        contract_address,
        player1,
        GAME_ID,
        2,
        helpers::balanced_allocation(),
    );
}

#[test]
unconstrained fn test_both_players_play_rounds() {
    let (mut env, contract_address, _) = utils::setup();
    let player1 = env.create_light_account();
    let player2 = env.create_light_account();
    helpers::setup_two_player_game(&mut env, contract_address, player1, player2, GAME_ID);

    helpers::play_round_with_allocation(
        &mut env,
        contract_address,
        player1,
        GAME_ID,
        1,
        helpers::aggressive_allocation(),
    );
    helpers::play_round_with_allocation(
        &mut env,
        contract_address,
        player2,
        GAME_ID,
        1,
        helpers::defensive_allocation(),
    );

    let race = utils::read_race(env, contract_address, GAME_ID);
    assert_eq(race.player1_round, 1);
    assert_eq(race.player2_round, 1);
}

// docs:start:test-full-game-flow
#[test]
unconstrained fn test_full_game_flow() {
    let (mut env, contract_address, _) = utils::setup();
    let player1 = env.create_light_account();
    let player2 = env.create_light_account();

    helpers::play_full_game(&mut env, contract_address, player1, player2, true, true);

    let race = utils::read_race(env, contract_address, GAME_ID);
    assert_eq(
        [
            race.player1_track1_final, race.player1_track2_final, race.player1_track3_final,
            race.player1_track4_final, race.player1_track5_final,
        ],
        [7, 7, 7, 3, 3],
    );
    assert_eq(
        [
            race.player2_track1_final, race.player2_track2_final, race.player2_track3_final,
            race.player2_track4_final, race.player2_track5_final,
        ],
        [3, 3, 6, 7, 8],
    );
}
// docs:end:test-full-game-flow

#[test]
unconstrained fn test_all_points_on_one_track() {
    let (mut env, contract_address, _) = utils::setup();
    let player1 = env.create_light_account();
    let player2 = env.create_light_account();
    helpers::setup_two_player_game(&mut env, contract_address, player1, player2, GAME_ID);

    env.call_private(player1, PodRacing::at(contract_address).play_round(GAME_ID, 1, 9, 0, 0, 0, 0));

    assert_eq(utils::read_race(env, contract_address, GAME_ID).player1_round, 1);
}

#[test]
unconstrained fn test_player2_sequential_rounds() {
    let (mut env, contract_address, _) = utils::setup();
    let player1 = env.create_light_account();
    let player2 = env.create_light_account();
    helpers::setup_two_player_game(&mut env, contract_address, player1, player2, GAME_ID);

    for i in 0..3 {
        helpers::play_round_with_allocation(
            &mut env,
            contract_address,
            player2,
            GAME_ID,
            (i + 1) as u8,
            helpers::balanced_allocation(),
        );
    }

    assert_eq(utils::read_race(env, contract_address, GAME_ID).player2_round, 3);
}

#[test(should_fail_with = "scores already revealed")]
unconstrained fn test_fail_double_reveal() {
    let (mut env, contract_address, _) = utils::setup();
    let player1 = env.create_light_account();
    let player2 = env.create_light_account();

    helpers::play_full_game(&mut env, contract_address, player1, player2, true, false);
    env.call_private(player1, PodRacing::at(contract_address).finish_game(GAME_ID));
}
