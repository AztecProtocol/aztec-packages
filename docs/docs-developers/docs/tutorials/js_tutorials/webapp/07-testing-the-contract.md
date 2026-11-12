---
title: "7. Testing the contract"
sidebar_position: 8
description: "Test the Pod Racing contract in Noir with the TXE: setup, helpers, failure cases and finalization guards."
references: ["docs/examples/contracts/pod_racing_contract_test/src/utils.nr", "docs/examples/contracts/pod_racing_contract_test/src/helpers.nr", "docs/examples/contracts/pod_racing_contract_test/src/pod_racing.nr", "docs/examples/contracts/pod_racing_contract_test/src/finalize.nr", "docs/examples/webapp-tutorial/contracts/src/main.nr"]
---

# Testing the contract

In this section, you test the Pod Racing contract from [part 1](./01-the-contract.md) with Noir unit tests. The tests run in the TXE (Testing eXecution Environment), a local test runtime that the `aztec` CLI starts for you. No network is needed. Each code block below links to its source file.

## Prerequisites

- The Pod Racing contract from [part 1](./01-the-contract.md)
- The Aztec CLI at version #include_version_without_prefix

## Set up a test crate

Keep tests in their own `type = "lib"` crate next to the contract crate, as `aztec new` does (see [Keep tests in the test crate](../../../aztec-nr/testing_contracts.md#keep-tests-in-the-test-crate)). The test crate depends on the contract by path. In your project, put it beside `contracts/`:

```toml title="contracts_test/Nargo.toml"
[package]
name = "pod_racing_contract_test"
type = "lib"

[dependencies]
aztec = { git = "https://github.com/aztec-labs-eng/aztec-nr/", tag = "#include_aztec_version", directory = "aztec" }
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

#include_code test-setup /docs/examples/contracts/pod_racing_contract_test/src/utils.nr rust

`env.deploy("@pod_racing_contract/PodRacing")` names the package and the contract, so the TXE loads the artifact that `aztec compile` wrote for that package. `create_light_account` makes a test account without deploying an account contract.

Public state is read inside `env.public_context_at`. Reading the whole `Race` struct, instead of single storage slots, keeps the tests working when the struct gains a field:

#include_code read-race /docs/examples/contracts/pod_racing_contract_test/src/utils.nr rust

## Helpers

Point allocations and multi-step setups live in `helpers.nr`, so each test states only what it checks:

#include_code allocation-strategies /docs/examples/contracts/pod_racing_contract_test/src/helpers.nr rust

#include_code setup-helpers /docs/examples/contracts/pod_racing_contract_test/src/helpers.nr rust

`env.call_public` and `env.call_private` send a transaction from the given account, like `vm.prank` followed by a call in Foundry. `call_private` runs the private function and then its enqueued public calls.

## Test patterns

A basic test checks state after setup:

#include_code test-initializer /docs/examples/contracts/pod_racing_contract_test/src/pod_racing.nr rust

A failure test names the error it expects. `should_fail_with` matches a substring of the assertion message, so the test cannot pass because of a different failure:

#include_code test-fail-too-many-points /docs/examples/contracts/pod_racing_contract_test/src/pod_racing.nr rust

The full game flow plays all rounds for both players, reveals both totals, and checks the stored scores:

#include_code test-full-game-flow /docs/examples/contracts/pod_racing_contract_test/src/pod_racing.nr rust

## Finalization guards

`finalize_game` runs only once per game, only after player 2 has joined, and only after both players have revealed. Each guard has its own failure test. These two tests check that the winner is credited once:

#include_code test-finalize /docs/examples/contracts/pod_racing_contract_test/src/finalize.nr rust

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
