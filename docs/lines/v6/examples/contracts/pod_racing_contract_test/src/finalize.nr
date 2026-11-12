use crate::{helpers, helpers::GAME_ID, utils};
use pod_racing_contract::PodRacing;

// docs:start:test-finalize
#[test]
unconstrained fn test_finalize_credits_the_winner_once() {
    let (mut env, contract_address, _) = utils::setup();
    let player1 = env.create_light_account();
    let player2 = env.create_light_account();
    helpers::play_full_game(&mut env, contract_address, player1, player2, true, true);
    env.mine_block();

    env.call_public(player1, PodRacing::at(contract_address).finalize_game(GAME_ID));

    assert_eq(utils::wins(env, contract_address, player1), 1);
    assert_eq(utils::wins(env, contract_address, player2), 0);
}

#[test(should_fail_with = "game already finalized")]
unconstrained fn test_fail_finalize_twice() {
    let (mut env, contract_address, _) = utils::setup();
    let player1 = env.create_light_account();
    let player2 = env.create_light_account();
    helpers::play_full_game(&mut env, contract_address, player1, player2, true, true);
    env.mine_block();

    env.call_public(player1, PodRacing::at(contract_address).finalize_game(GAME_ID));
    env.call_public(player1, PodRacing::at(contract_address).finalize_game(GAME_ID));
}
// docs:end:test-finalize

#[test(should_fail_with = "game has not started")]
unconstrained fn test_fail_finalize_unjoined_game() {
    let (mut env, contract_address, _) = utils::setup();
    let player1 = env.create_light_account();
    env.call_public(player1, PodRacing::at(contract_address).create_game(GAME_ID));
    env.mine_block();

    env.call_public(player1, PodRacing::at(contract_address).finalize_game(GAME_ID));
}

#[test(should_fail_with = "both players must reveal")]
unconstrained fn test_fail_finalize_after_one_reveal() {
    let (mut env, contract_address, _) = utils::setup();
    let player1 = env.create_light_account();
    let player2 = env.create_light_account();
    helpers::play_full_game(&mut env, contract_address, player1, player2, true, false);
    env.mine_block();

    env.call_public(player1, PodRacing::at(contract_address).finalize_game(GAME_ID));
}
