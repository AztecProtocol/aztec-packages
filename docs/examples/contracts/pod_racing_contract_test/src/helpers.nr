use aztec::{protocol::address::AztecAddress, test::helpers::test_environment::TestEnvironment};
use pod_racing_contract::PodRacing;

pub global GAME_ID: Field = 1;

// docs:start:allocation-strategies
pub unconstrained fn balanced_allocation() -> (u8, u8, u8, u8, u8) {
    (2, 2, 2, 2, 1)
}

pub unconstrained fn aggressive_allocation() -> (u8, u8, u8, u8, u8) {
    (3, 3, 3, 0, 0)
}

pub unconstrained fn defensive_allocation() -> (u8, u8, u8, u8, u8) {
    (0, 0, 1, 4, 4)
}
// docs:end:allocation-strategies

// docs:start:setup-helpers
pub unconstrained fn setup_two_player_game(
    env: &mut TestEnvironment,
    contract_address: AztecAddress,
    player1: AztecAddress,
    player2: AztecAddress,
    game_id: Field,
) {
    env.call_public(player1, PodRacing::at(contract_address).create_game(game_id));
    env.call_public(player2, PodRacing::at(contract_address).join_game(game_id));
}

pub unconstrained fn play_round_with_allocation(
    env: &mut TestEnvironment,
    contract_address: AztecAddress,
    player: AztecAddress,
    game_id: Field,
    round: u8,
    allocation: (u8, u8, u8, u8, u8),
) {
    let (t1, t2, t3, t4, t5) = allocation;
    env.call_private(
        player,
        PodRacing::at(contract_address).play_round(game_id, round, t1, t2, t3, t4, t5),
    );
}

pub unconstrained fn play_all_rounds_with_strategy(
    env: &mut TestEnvironment,
    contract_address: AztecAddress,
    player: AztecAddress,
    game_id: Field,
    allocations: [(u8, u8, u8, u8, u8); 3],
) {
    for i in 0..3 {
        play_round_with_allocation(env, contract_address, player, game_id, (i + 1) as u8, allocations[i]);
    }
}
// docs:end:setup-helpers

/// Player 1 totals (7, 7, 7, 3, 3) against player 2's (3, 3, 6, 7, 8): player 1 wins tracks 1-3.
pub global PLAYER1_STRATEGY: [(u8, u8, u8, u8, u8); 3] = [(3, 2, 2, 1, 1), (2, 3, 2, 1, 1), (2, 2, 3, 1, 1)];
pub global PLAYER2_STRATEGY: [(u8, u8, u8, u8, u8); 3] = [(1, 1, 2, 2, 3), (1, 1, 2, 3, 2), (1, 1, 2, 2, 3)];

/// Creates and joins a game, plays every round for both players, and has the given players reveal.
pub unconstrained fn play_full_game(
    env: &mut TestEnvironment,
    contract_address: AztecAddress,
    player1: AztecAddress,
    player2: AztecAddress,
    reveal_player1: bool,
    reveal_player2: bool,
) {
    setup_two_player_game(env, contract_address, player1, player2, GAME_ID);
    play_all_rounds_with_strategy(env, contract_address, player1, GAME_ID, PLAYER1_STRATEGY);
    play_all_rounds_with_strategy(env, contract_address, player2, GAME_ID, PLAYER2_STRATEGY);
    if reveal_player1 {
        env.call_private(player1, PodRacing::at(contract_address).finish_game(GAME_ID));
    }
    if reveal_player2 {
        env.call_private(player2, PodRacing::at(contract_address).finish_game(GAME_ID));
    }
}
