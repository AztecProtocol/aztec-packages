---
title: "7. Testing the contract"
sidebar_position: 8
description: "Test the Pod Racing contract in Noir with the TXE: setup, helpers, failure cases and finalization guards."
references: ["docs/lines/v6/examples/contracts/pod_racing_contract_test/src/utils.nr", "docs/lines/v6/examples/contracts/pod_racing_contract_test/src/helpers.nr", "docs/lines/v6/examples/contracts/pod_racing_contract_test/src/pod_racing.nr", "docs/lines/v6/examples/contracts/pod_racing_contract_test/src/finalize.nr", "docs/lines/v6/examples/webapp-tutorial/contracts/src/main.nr"]
---

# Testing the contract

In this section, you test the Pod Racing contract from [part 1](./01-the-contract.md) with Noir unit tests. The tests run in the TXE (Testing eXecution Environment), a local test runtime that the `aztec` CLI starts for you. No network is needed. Each code block below links to its source file.

## Prerequisites

- The Pod Racing contract from [part 1](./01-the-contract.md)
- The Aztec CLI at version 6.0.0

## Set up a test crate

Keep tests in their own `type = "lib"` crate next to the contract crate, as `aztec new` does (see [Keep tests in the test crate](../../../aztec-nr/testing_contracts.md#keep-tests-in-the-test-crate)). The test crate depends on the contract by path. In your project, put it beside `contracts/`:

```toml title="contracts_test/Nargo.toml"
[package]
name = "pod_racing_contract_test"
type = "lib"

[dependencies]
aztec = { git = "https://github.com/aztec-labs-eng/aztec-nr/", tag = "v6.0.0", directory = "aztec" }
pod_racing_contract = { path = "../contracts" }
```

Then list both crates in a workspace `Nargo.toml` at the project root:

```toml title="Nargo.toml"
[workspace]
members = ["contracts", "contracts_test"]
```

The contract module that defines `Race` is public (`pub mod race;` in `main.nr`), so the tests can read a game's state by field name.

## Run the tests

From the project root:

```bash
aztec test
```

`aztec test` compiles the contracts, starts a TXE, and runs every `#[test]` in the workspace. Use `aztec test` rather than `nargo test`: the tests call the TXE's oracles.

## Test setup

Each test deploys a fresh contract:

```rust title="test-setup" showLineNumbers 
/// Deploys a fresh PodRacing contract and returns the environment, its address and the admin.
pub unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let admin = env.create_light_account();

    let initializer = PodRacing::interface().constructor(admin);
    let contract_address =
        env.deploy("@pod_racing_contract/PodRacing").with_public_initializer(admin, initializer);

    (env, contract_address, admin)
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/c0643538fa9523cca55eab25f5befd31b4d115b8/docs/lines/v6/examples/contracts/pod_racing_contract_test/src/utils.nr#L7-L19" target="_blank" rel="noopener noreferrer">Source code: docs/lines/v6/examples/contracts/pod_racing_contract_test/src/utils.nr#L7-L19</a></sub></sup>


`env.deploy("@pod_racing_contract/PodRacing")` names the package and the contract, so the TXE loads the artifact that `aztec compile` wrote for that package. `create_light_account` makes a test account without deploying an account contract.

Public state is read inside `env.public_context_at`. Reading the whole `Race` struct, instead of single storage slots, keeps the tests working when the struct gains a field:

```rust title="read-race" showLineNumbers 
/// Reads a game's public `Race` struct by field name, so a new field does not break the tests.
pub unconstrained fn read_race(env: TestEnvironment, contract_address: AztecAddress, game_id: Field) -> Race {
    env.public_context_at(contract_address, |context| {
        context.storage_read(derive_storage_slot_in_map(PodRacing::storage_layout().races.slot, game_id))
    })
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/c0643538fa9523cca55eab25f5befd31b4d115b8/docs/lines/v6/examples/contracts/pod_racing_contract_test/src/utils.nr#L21-L28" target="_blank" rel="noopener noreferrer">Source code: docs/lines/v6/examples/contracts/pod_racing_contract_test/src/utils.nr#L21-L28</a></sub></sup>


## Helpers

Point allocations and multi-step setups live in `helpers.nr`, so each test states only what it checks:

```rust title="allocation-strategies" showLineNumbers 
pub unconstrained fn balanced_allocation() -> (u8, u8, u8, u8, u8) {
    (2, 2, 2, 2, 1)
}

pub unconstrained fn aggressive_allocation() -> (u8, u8, u8, u8, u8) {
    (3, 3, 3, 0, 0)
}

pub unconstrained fn defensive_allocation() -> (u8, u8, u8, u8, u8) {
    (0, 0, 1, 4, 4)
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/c0643538fa9523cca55eab25f5befd31b4d115b8/docs/lines/v6/examples/contracts/pod_racing_contract_test/src/helpers.nr#L6-L18" target="_blank" rel="noopener noreferrer">Source code: docs/lines/v6/examples/contracts/pod_racing_contract_test/src/helpers.nr#L6-L18</a></sub></sup>


```rust title="setup-helpers" showLineNumbers 
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
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/c0643538fa9523cca55eab25f5befd31b4d115b8/docs/lines/v6/examples/contracts/pod_racing_contract_test/src/helpers.nr#L20-L58" target="_blank" rel="noopener noreferrer">Source code: docs/lines/v6/examples/contracts/pod_racing_contract_test/src/helpers.nr#L20-L58</a></sub></sup>


`env.call_public` and `env.call_private` send a transaction from the given account, like `vm.prank` followed by a call in Foundry. `call_private` runs the private function and then its enqueued public calls.

## Test patterns

A basic test checks state after setup:

```rust title="test-initializer" showLineNumbers 
#[test]
unconstrained fn test_initializer() {
    let (env, contract_address, admin) = utils::setup();

    let stored_admin: AztecAddress = env.public_context_at(contract_address, |context| {
        context.storage_read(PodRacing::storage_layout().admin.slot)
    });
    assert_eq(stored_admin, admin);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/c0643538fa9523cca55eab25f5befd31b4d115b8/docs/lines/v6/examples/contracts/pod_racing_contract_test/src/pod_racing.nr#L5-L15" target="_blank" rel="noopener noreferrer">Source code: docs/lines/v6/examples/contracts/pod_racing_contract_test/src/pod_racing.nr#L5-L15</a></sub></sup>


A failure test names the error it expects. `should_fail_with` matches a substring of the assertion message, so the test cannot pass because of a different failure:

```rust title="test-fail-too-many-points" showLineNumbers 
#[test(should_fail_with = "a round allows at most 9 points")]
unconstrained fn test_fail_play_round_too_many_points() {
    let (mut env, contract_address, _) = utils::setup();
    let player1 = env.create_light_account();
    let player2 = env.create_light_account();
    helpers::setup_two_player_game(&mut env, contract_address, player1, player2, GAME_ID);

    env.call_private(player1, PodRacing::at(contract_address).play_round(GAME_ID, 1, 2, 2, 2, 2, 2));
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/c0643538fa9523cca55eab25f5befd31b4d115b8/docs/lines/v6/examples/contracts/pod_racing_contract_test/src/pod_racing.nr#L87-L97" target="_blank" rel="noopener noreferrer">Source code: docs/lines/v6/examples/contracts/pod_racing_contract_test/src/pod_racing.nr#L87-L97</a></sub></sup>


The full game flow plays all rounds for both players, reveals both totals, and checks the stored scores:

```rust title="test-full-game-flow" showLineNumbers 
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
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/c0643538fa9523cca55eab25f5befd31b4d115b8/docs/lines/v6/examples/contracts/pod_racing_contract_test/src/pod_racing.nr#L176-L201" target="_blank" rel="noopener noreferrer">Source code: docs/lines/v6/examples/contracts/pod_racing_contract_test/src/pod_racing.nr#L176-L201</a></sub></sup>


## Finalization guards

`finalize_game` runs only once per game, only after player 2 has joined, and only after both players have revealed. Each guard has its own failure test. These two tests check that the winner is credited once:

```rust title="test-finalize" showLineNumbers 
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
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/c0643538fa9523cca55eab25f5befd31b4d115b8/docs/lines/v6/examples/contracts/pod_racing_contract_test/src/finalize.nr#L4-L30" target="_blank" rel="noopener noreferrer">Source code: docs/lines/v6/examples/contracts/pod_racing_contract_test/src/finalize.nr#L4-L30</a></sub></sup>


`env.mine_block()` makes sure the chain is past the game's block deadline, which `finalize_game` checks before it compares the scores.

## Known limits of the tutorial contract

The contract keeps the game simple, so two gaps remain:

- **No reveal deadline.** Finalization waits until both players reveal. A player who expects to lose can block the game forever by never calling `finish_game`. A production game needs a deadline after which the revealed player wins.
- **A zero total reads as "not revealed".** The contract tells a revealed player apart by a non-zero total. A player who put no points on any track reveals a total of zero, and the game cannot be finalized.

## Exercise: add a forfeit function

Add a public `forfeit_game(game_id)` function that lets a player concede before the game ends:

1. Check that player 2 has joined, that the caller is one of the two players, and that the game is not finalized.
2. Credit the other player in `win_history` and mark the game as finalized.
3. Write a test that forfeits a game, then checks `win_history` with `utils::wins`.
4. Write `should_fail_with` tests for a caller who is not a player and for a game player 2 has not joined.

Run `aztec test` until all tests pass.

## Next steps

- [Testing Aztec.nr contracts](../../../aztec-nr/testing_contracts.md) covers the full `TestEnvironment` API: authwits, time travel and oracle versions.
- [Testing with Aztec.js](../../../aztec-js/how_to_test.md) runs end-to-end tests against a local network.
