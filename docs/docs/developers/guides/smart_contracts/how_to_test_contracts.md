---
title: Testing Contracts
tags: [contracts, tests, testing, noir]
keywords: [tests, testing, noir]
sidebar_position: 10
description: Write and run tests for your Aztec smart contracts using Noir and TypeScript.
---

This guide shows you how to test your Aztec smart contracts using different approaches based on complexity.

## Prerequisites

- An Aztec contract project with functions to test
- Aztec sandbox running for Noir tests
- Understanding of Noir testing syntax

For complex cross-chain testing, see [TypeScript testing guide](../js_apps/test.md).

## Write pure Noir tests

Test isolated utility functions using `#[test]` annotations:

```rust
#[test]
fn test_to_from_field() {
    let field = 1234567890;
    let item = MyItem::from_field(field);
    assert(item.to_field() == field);
}
```

Pure Noir tests are fast but cannot interact with contracts, accounts, or transactions.

## Write Aztec contract tests

Use `TestEnvironment` from `aztec-nr` for contract unit testing:

- **Fast**: Lightweight environment with mocked components
- **Convenient**: Similar to Foundry for simple contract tests
- **Limited**: No rollup circuits or cross-chain messaging

For complex end-to-end tests, use [TypeScript testing](../js_apps/test.md) with `aztec.js`.

## Run your tests

Execute Aztec Noir tests using:

```bash
aztec test
```

### Test execution process

1. Compile contracts
2. Start the sandbox
3. Run `aztec test`

:::warning
Always use `aztec test` instead of `nargo test`. The `TestEnvironment` requires the TXE (Test eXecution Environment) oracle resolver.
:::

## Structure your test functions

All tests follow this pattern:

1. Create test environment with `TestEnvironment::new()`
2. Deploy contracts, create accounts, and manipulate state
3. Make assertions on results

```rust
pub unconstrained fn setup(
    initial_value: Field,
) -> (TestEnvironment, AztecAddress, AztecAddress) {
    // Setup env, generate keys
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();

    // Deploy contract and initialize
    let initializer = MyContract::interface().initialize(initial_value as u64, owner);
    let contract_address =
        env.deploy("MyContract").with_private_initializer(owner, initializer);
    (env, contract_address, owner)
}

#[test]
unconstrained fn test_update_value() {
    let initial_value = 5;
    let (mut env, contract_address, owner) = setup(initial_value);

    // Read the stored value in the note
    let initial_value_read =
        env.simulate_utility(MyContract::at(contract_address).get_value(owner));
    assert(
        initial_value_read == initial_value,
        f"Expected {initial_value} but got {initial_value_read}",
    );

    // Update the value
    env.call_private(owner, MyContract::at(contract_address).update_value(owner));

    let updated_value =
        env.simulate_utility(MyContract::at(contract_address).get_value(owner));
    let expected_current_value = initial_value + 1;
    assert(
        expected_current_value == updated_value,
        f"Expected {expected_current_value} but got {updated_value}",
    );
}
```

:::tip
- Tests run in parallel by default
- Use `unconstrained` functions for faster execution
- See all `TestEnvironment` methods [here](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/aztec-nr/aztec/src/test/helpers/test_environment.nr)
:::

## Import test dependencies

Import required testing modules:

```rust
use crate::MyContract;
use aztec::{
    protocol_types::address::AztecAddress, test::helpers::test_environment::TestEnvironment,
};
```

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

```rust
// Execute action
let action_value = 1000 as u128;
env.call_private(owner, MyContract::at(contract_address).execute_action(recipient, action_value));
```

### Public

To call the public `transfer_in_public` function:

```rust
env.call_public(
    owner,
    MyContract::at(contract_address).execute_public_action(owner, owner, action_value, 0),
);
```

### Utility

Utility functions can also simulated from the contract interface, though they are (currently) found under the `_experimental` prefix.

```rust
pub unconstrained fn check_private_value(
    env: TestEnvironment,
    contract_address: AztecAddress,
    address: AztecAddress,
    expected_value: u128,
) {
    assert_eq(
        env.simulate_utility(MyContract::at(contract_address).get_private_value(address)),
        expected_value,
    );
```

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

[Authwits](how_to_use_authwit.md) are currently added via the `add_private_authwit_from_call_interface` and `add_public_authwit_from_call_interface` experimental functions. Here is an example of testing a private token transfer using authwits:

```rust
let action_value = 1000 as u128;
let private_action_call_interface =
    MyContract::at(contract_address).execute_private_action(owner, recipient, action_value, 1);
add_private_authwit_from_call_interface(owner, recipient, private_action_call_interface);
```

### Public

```rust
// Generates public authwit for the action call
let public_action_call_interface =
    MyContract::at(contract_address).execute_public_action(owner, recipient, action_value, 1);
add_public_authwit_from_call_interface(owner, recipient, public_action_call_interface);
```

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

```rust
env.call_private_with_custom_assert_message(
    recipient,
    MyContract::at(contract_address).execute_action(owner, action_value),
    "Value too low",
);
```

## Logging

You can use `aztec.nr`'s oracles as usual for debug logging, as explained [here](../local_env/how_to_debug.md)

:::warning
Remember to set the following environment variables to activate debug logging:

```bash
export LOG_LEVEL="debug"
```
