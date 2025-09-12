---
title: Testing Contracts
tags: [contracts, tests, testing, noir]
keywords: [tests, testing, noir]
sidebar_position: 10
description: Learn how to write and run tests for your Aztec smart contracts.
---

Aztec contracts can be tested in a variety of ways depending on the needs of a particular application and the complexity of the interactions they must support.

To test individual contract functions, you can write your tests directly in Noir as explained below. For more complex interactions that e.g. utilize cross-chain features, you should [write end-to-end tests using TypeScript](../js_apps/test.md).

## Pure Noir tests

Noir supports the `#[test]` annotation which can be used to write simple logic tests on isolated utility functions. These tests only make assertions on algorithms, and cannot interact with protocol-specific constructs such as contracts, accounts, or transactions, but are extremely fast and can be useful in certain scenarios.

#include_code pure_noir_testing /noir-projects/noir-contracts/contracts/app/card_game_contract/src/cards.nr rust

To learn more about Noir testing, please refer to [the Noir docs](https://Noir-lang.org/docs/tooling/testing/).

## Aztec Noir tests

`aztec-nr` provides an utility called `TestEnvironment` which provides the functionality required to test Aztec contracts in a Noir test. This is the most convenient and quickest way to write contract unit tests, and is expected to be the first tool developers use to test their contracts.

Part of this speed comes from running tests in a lightweight environment where most non-essential components are mocked out - e.g. there are no rollup circuits nor cross-chain messaging. If you need a more complete environment in which to test complex end-to-end interactions, such as with L1 contracts, please refer to [Testing Aztec.nr contracts with Typescript](../js_apps/test.md).

To summarize:

- Simple contract tests can be written in Noir using `TestEnvironment`- not unlike Foundry.
- Complex end-to-end tests can be written in Typescript using `aztec.js` alongside a testing framework like Jest or Mocha - not unlike Hardhat.

## Running Aztec Noir tests

If you have [the sandbox](../../getting_started/getting_started_on_sandbox.md) installed, you can run Noir tests using:

`aztec test`

The complete process for running tests:

1. Compile contracts
2. Start the sandbox
3. Run `aztec test`

:::warning
Under the hood, `TestEnvironment` expects an oracle resolver called 'TXE' (Test eXecution Environment) to be available. This means that a regular `nargo test` command will not suffice - you _must_ use `aztec test` instead.
:::

## Writing Aztec Noir tests

All tests have the same overall shape: a test environment is created by calling `TestEnvironment::new()`, and then methods on the created object are invoked to create accounts, manipulate the network state, deploy and call contracts and so on. By default Noir will execute all tests in parallel - this is fully supported by `TestEnvironment` and each test is fully independent.

:::tip
You can find all of the methods available in the `TestEnvironment` [here (Github link)](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/aztec-nr/aztec/src/test/helpers/test_environment.nr).
:::

#include_code txe_test_increment /noir-projects/noir-contracts/contracts/test/counter_contract/src/main.nr rust

:::tip
Tests run significantly faster if they are made `unconstrained` functions.
:::

## Imports

Writing tests in contracts requires importing additional modules from Aztec.nr. Here are the modules that are needed for testing the increment function in the counter contract.

#include_code test_imports /noir-projects/noir-contracts/contracts/test/counter_contract/src/main.nr rust

## Deploying contracts

```rust

// Deploy the contract from crate the tests are in

let deployer = env.deploy("ContractName");

// Deploy a contract in different crate (at a path relative to the one the tests are in, from the location of Nargo.toml)

let deployer = env.deploy("path_to_contract_root_folder_where_nargo_toml_is", "ContractName");

// Deploy a contract in a different crate in a workspace (at a path relative to the one the tests are in, from the location of Nargo.toml)

let deployer = env.deploy("path_to_workspace_root_folder_where_main_nargo_toml_is@package_name", "ContractName");

// Now one of these can be called, depending on the contract and their possible initialization options.
// Remember a contract can only be initialized once.

let my_private_initializer_call_interface = MyContract::interface().private_constructor(...);
let my_contract_instance = deployer.with_private_initializer(my_private_initializer_call_interface);

// or

let my_public_initializer_call_interface = MyContract::interface().public_constructor(...);
let my_contract_instance = deployer.with_public_initializer(my_public_initializer_call_interface);

// or

let my_contract_instance = deployer.without_initializer();
```

:::warning
It is always necessary to deploy a contract in order to test it. **It is important to compile before testing**, as `aztec test` does not recompile them on changes. Think of it as regenerating the bytecode and ABI so it becomes accessible externally.
:::

## Calling functions

The `TestEnvironment` is capable of utilizing the autogenerated contract interfaces to perform calls via the `call_private`, `call_public`, etc., family of functions.

### Private

For example, to call the private `transfer` function on the token contract:

#include_code txe_test_transfer_private /noir-projects/noir-contracts/contracts/app/token_contract/src/test/transfer.nr rust

### Public

To call the public `transfer_in_public` function:

#include_code call_public /noir-projects/noir-contracts/contracts/app/token_contract/src/test/transfer_in_public.nr rust

### Utility

Utility functions can also simulated from the contract interface, though they are (currently) found under the `_experimental` prefix.

#include_code txe_test_call_utility /noir-projects/noir-contracts/contracts/app/token_contract/src/test/utils.nr rust

## Creating accounts

The test environment provides two different ways of creating accounts, depending on the testing needs. For most cases, it is only necessary to obtain a valid `AztecAddress` that represents the user's account contract. For this, is is enough to do:

```rust
let account_address = env.create_light_account(secret);
```

These accounts contain the necessary keys to ensure notes can be created/nullified, etc. However, they lack the capacity to process private authwit validation requests. This requires for accounts to have a corresponding account contract deployed and initialized, which results in slower account creation. This is achieved as follows:

```rust
let account_address = env.create_contract_account(secret);
```

Once accounts have been created they can be used as the `from` parameter to methods such as `private_call`.

## Authwits

### Private

[Authwits](authwit.md) are currently added via the `add_private_authwit_from_call_interface` and `add_public_authwit_from_call_interface` experimental functions. Here is an example of testing a private token transfer using authwits:

#include_code private_authwit /noir-projects/noir-contracts/contracts/app/token_contract/src/test/transfer_in_private.nr rust

### Public

#include_code public_authwit /noir-projects/noir-contracts/contracts/app/token_contract/src/test/transfer_in_public.nr rust

## Time traveling

Contract calls do not advance the timestamp by default, despite each of them resulting in a block with a single transaction. Block timestamp can instead by manually manipulated by any of the following methods:

```rust
// Sets the timestamp of the next block to be mined, i.e. of the next public execution. Does not affect private execution.
env.set_next_block_timestamp(block_timestamp);

// Same as `set_next_block_timestamp`, but moving time forward by `duration` instead of advancing to a target timestamp.
env.advance_next_block_timestamp_by(duration);

// Mines an empty block at a given timestamp, causing the next public execution to occur at this time (like `set_next_block_timestamp`), but also allowing for private execution to happen using this empty block as the anchor block.
env.mine_block_at(block_timestamp);
```

## Failing cases

You can test functions that you expect to fail generically, with the `#[test(should_fail)]` annotation, or that it should fail with a specific message with `#[test(should_fail_with = "Failure message")]`.

For example:

#include_code fail_with_message /noir-projects/noir-contracts/contracts/app/token_contract/src/test/transfer_in_private.nr rust

## Logging

You can use `aztec.nr`'s oracles as usual for debug logging, as explained [here](../local_env/how_to_debug.md)

:::warning
Remember to set the following environment variables to activate debug logging:

```bash
export LOG_LEVEL="debug"
```
