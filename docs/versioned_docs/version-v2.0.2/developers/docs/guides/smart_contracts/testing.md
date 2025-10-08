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

```rust title="pure_noir_testing" showLineNumbers 
#[test]
fn test_to_from_field() {
    let field = 1234567890;
    let card = Card::from_field(field);
    assert(card.to_field() == field);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/card_game_contract/src/cards.nr#L46-L53" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/card_game_contract/src/cards.nr#L46-L53</a></sub></sup>


To learn more about Noir testing, please refer to [the Noir docs](https://Noir-lang.org/docs/tooling/testing/).

## Aztec Noir tests

`aztec-nr` provides an utility called `TestEnvironment` which provides the functionality required to test Aztec contracts in a Noir test. This is the most convenient and quickest way to write contract unit tests, and is expected to be the first tool developers use to test their contracts.

Part of this speed comes from running tests in a lightweight environment where most non-essential components are mocked out - e.g. there are no rollup circuits nor cross-chain messaging. If you need a more complete environment in which to test complex end-to-end interactions, such as with L1 contracts, please refer to [Testing Aztec.nr contracts with Typescript](../js_apps/test.md).

To summarize:

- Simple contract tests can be written in Noir using `TestEnvironment`- not unlike Foundry.
- Complex end-to-end tests can be written in Typescript using `aztec.js` alongside a testing framework like Jest or Mocha - not unlike Hardhat.

## Running Aztec Noir tests

If you have [the sandbox](../../../getting_started_on_sandbox.md) installed, you can run Noir tests using:

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
You can find all of the methods available in the `TestEnvironment` [here (Github link)](https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/aztec-nr/aztec/src/test/helpers/test_environment.nr).
:::

```rust title="txe_test_increment" showLineNumbers 
pub unconstrained fn setup(
    initial_value: Field,
) -> (TestEnvironment, AztecAddress, AztecAddress) {
    // Setup env, generate keys
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();

    // Deploy contract and initialize
    let initializer = Counter::interface().initialize(initial_value as u64, owner);
    let contract_address =
        env.deploy("Counter").with_private_initializer(owner, initializer);
    (env, contract_address, owner)
}

#[test]
unconstrained fn test_increment() {
    let initial_value = 5;
    let (mut env, contract_address, owner) = setup(initial_value);

    // Read the stored value in the note
    let initial_counter =
        env.simulate_utility(Counter::at(contract_address).get_counter(owner));
    assert(
        initial_counter == initial_value,
        f"Expected {initial_value} but got {initial_counter}",
    );

    // Increment the counter
    env.call_private(owner, Counter::at(contract_address).increment(owner));

    let incremented_counter =
        env.simulate_utility(Counter::at(contract_address).get_counter(owner));
    let expected_current_value = initial_value + 1;
    assert(
        expected_current_value == incremented_counter,
        f"Expected {expected_current_value} but got {incremented_counter}",
    );
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/test/counter_contract/src/main.nr#L106-L145" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/test/counter_contract/src/main.nr#L106-L145</a></sub></sup>


:::tip
Tests run significantly faster if they are made `unconstrained` functions.
:::

## Imports

Writing tests in contracts requires importing additional modules from Aztec.nr. Here are the modules that are needed for testing the increment function in the counter contract.

```rust title="test_imports" showLineNumbers 
use crate::Counter;
use aztec::{
    protocol_types::address::AztecAddress, test::helpers::test_environment::TestEnvironment,
};
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/test/counter_contract/src/main.nr#L99-L104" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/test/counter_contract/src/main.nr#L99-L104</a></sub></sup>


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

```rust title="txe_test_transfer_private" showLineNumbers 
// Transfer tokens
let transfer_amount = 1000 as u128;
env.call_private(owner, Token::at(token_contract_address).transfer(recipient, transfer_amount));
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/token_contract/src/test/transfer.nr#L10-L14" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/test/transfer.nr#L10-L14</a></sub></sup>


### Public

To call the public `transfer_in_public` function:

```rust title="call_public" showLineNumbers 
env.call_public(
    owner,
    Token::at(token_contract_address).transfer_in_public(owner, owner, transfer_amount, 0),
);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/token_contract/src/test/transfer_in_public.nr#L34-L39" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/test/transfer_in_public.nr#L34-L39</a></sub></sup>


### Utility

Utility functions can also simulated from the contract interface, though they are (currently) found under the `_experimental` prefix.

```rust title="txe_test_call_utility" showLineNumbers 
pub unconstrained fn check_private_balance(
    env: TestEnvironment,
    token_contract_address: AztecAddress,
    address: AztecAddress,
    address_amount: u128,
) {
    assert_eq(
        env.simulate_utility(Token::at(token_contract_address).balance_of_private(address)),
        address_amount,
    );
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/token_contract/src/test/utils.nr#L79-L91" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/test/utils.nr#L79-L91</a></sub></sup>


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

```rust title="private_authwit" showLineNumbers 
let transfer_amount = 1000 as u128;
let transfer_private_from_call_interface =
    Token::at(token_contract_address).transfer_in_private(owner, recipient, transfer_amount, 1);
add_private_authwit_from_call_interface(owner, recipient, transfer_private_from_call_interface);
// Transfer tokens
env.call_private(recipient, transfer_private_from_call_interface);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/token_contract/src/test/transfer_in_private.nr#L11-L18" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/test/transfer_in_private.nr#L11-L18</a></sub></sup>


### Public

```rust title="public_authwit" showLineNumbers 
let public_transfer_in_private_call_interface =
    Token::at(token_contract_address).transfer_in_public(owner, recipient, transfer_amount, 1);
add_public_authwit_from_call_interface(
    env,
    owner,
    recipient,
    public_transfer_in_private_call_interface,
);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/token_contract/src/test/transfer_in_public.nr#L116-L125" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/test/transfer_in_public.nr#L116-L125</a></sub></sup>


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

```rust title="fail_with_message" showLineNumbers 
#[test(should_fail_with = "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero")]
unconstrained fn transfer_private_failure_on_behalf_of_self_non_zero_nonce() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient, _) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ false);
    // Add authwit
    let transfer_amount = 1000 as u128;
    let transfer_private_from_call_interface =
        Token::at(token_contract_address).transfer_in_private(owner, recipient, transfer_amount, 1);
    add_private_authwit_from_call_interface(owner, recipient, transfer_private_from_call_interface);
    // Transfer tokens
    env.call_private(owner, transfer_private_from_call_interface);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/token_contract/src/test/transfer_in_private.nr#L29-L43" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/test/transfer_in_private.nr#L29-L43</a></sub></sup>


## Logging

You can use `aztec.nr`'s oracles as usual for debug logging, as explained [here](../local_env/how_to_debug.md)

:::warning
Remember to set the following environment variables to activate debug logging:

```bash
export LOG_LEVEL="debug"
```
