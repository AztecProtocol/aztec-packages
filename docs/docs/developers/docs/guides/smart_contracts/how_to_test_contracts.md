---
title: Testing Contracts
tags: [contracts, tests, testing, noir]
keywords: [tests, testing, noir]
sidebar_position: 8
description: Write and run tests for your Aztec smart contracts using Noir's TestEnvironment.
---

This guide shows you how to test your Aztec smart contracts using Noir's `TestEnvironment` for fast, lightweight testing.

## Prerequisites

- An Aztec contract project with functions to test
- Aztec sandbox running (required for `aztec test` command)
- Basic understanding of Noir syntax

:::tip
For complex cross-chain or integration testing, see the [TypeScript testing guide](../aztec-js/how_to_test.md).
:::

## Write Aztec contract tests

Use `TestEnvironment` from `aztec-nr` for contract unit testing:

- **Fast**: Lightweight environment with mocked components
- **Convenient**: Similar to Foundry for simple contract tests
- **Limited**: No rollup circuits or cross-chain messaging

For complex end-to-end tests, use [TypeScript testing](../aztec-js/how_to_test.md) with `aztec.js`.

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

## Basic test structure

```rust
use crate::MyContract;
use aztec::{
    protocol_types::address::AztecAddress,
    test::helpers::test_environment::TestEnvironment,
};

#[test]
unconstrained fn test_basic_flow() {
    // 1. Create test environment
    let mut env = TestEnvironment::new();

    // 2. Create accounts
    let owner = env.create_light_account();
}
```

:::info Test execution notes
- Tests run in parallel by default
- Use `unconstrained` functions for faster execution
- See all `TestEnvironment` methods [here](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/smart-contracts/aztec/src/test/helpers/test_environment.nr)
:::

:::tip Organizing test files
You can organize tests in separate files:

- Create `src/test.nr` with `mod utils;` to import helper functions
- Split tests into modules like `src/test/transfer_tests.nr`, `src/test/auth_tests.nr`
- Import the test module in `src/main.nr` with `mod test;`
- Share setup functions in `src/test/utils.nr`
:::

## Deploying contracts

In order to test you'll most likely want to deploy a contract in your testing environment. First, instantiate a deployer:

```rust
let deployer = env.deploy("ContractName");

// If on a different crate:
let deployer = env.deploy("../other_contract");
```

:::warning
It is always necessary to deploy a contract in order to test it. **It is important to compile before testing**, as `aztec test` does not recompile them on changes. Think of it as regenerating the bytecode and ABI so it becomes accessible externally.
:::

You can then choose whatever you need to initialize by interfacing with your initializer and calling it:

```rust
let initializer = MyContract::interface().constructor(param1, param2);

let contract_address = deployer.with_private_initializer(owner, initializer);
let contract_address = deployer.with_public_initializer(owner, initializer);
let contract_address = deployer.without_initializer();
```

:::tip Reusable setup functions
Create a setup function to avoid repeating initialization code:

```rust
pub unconstrained fn setup(initial_value: Field) -> (TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();
    let initializer = MyContract::interface().constructor(initial_value, owner);
    let contract_address = env.deploy("MyContract").with_private_initializer(owner, initializer);
    (env, contract_address, owner)
}

#[test]
unconstrained fn test_something() {
    let (env, contract_address, owner) = setup(42);
    // Your test logic here
}
```

:::

## Calling contract functions

TestEnvironment provides methods for different function types:

### Private functions

```rust
// Call private function
env.call_private(caller, Token::at(token_address).transfer(recipient, 100));

// Returns the result
let result = env.call_private(owner, Contract::at(address).get_private_data());
```

### Public functions

```rust
// Call public function
env.call_public(caller, Token::at(token_address).mint_to_public(recipient, 100));

// View public state (read-only)
let balance = env.view_public(Token::at(token_address).balance_of_public(owner));
```

### Utility/Unconstrained functions

```rust
// Simulate utility/view functions (unconstrained)
let total = env.simulate_utility(Token::at(token_address).balance_of_private(owner));
```

:::tip Helper function pattern
Create helper functions for common assertions:
```rust
pub unconstrained fn check_balance(
    env: TestEnvironment,
    token_address: AztecAddress,
    owner: AztecAddress,
    expected: u128,
) {
    assert_eq(
        env.simulate_utility(Token::at(token_address).balance_of_private(owner)),
        expected
    );
}
```
:::

## Creating accounts

Two types of accounts are available:

```rust
// Light account - fast, limited features
let owner = env.create_light_account();

// Contract account - full features, slower
let owner = env.create_contract_account();
```

:::info Account type comparison
**Light accounts:**
- Fast to create
- Work for simple transfers and tests
- Cannot process authwits
- No account contract deployed

**Contract accounts:**
- Required for authwit testing
- Support account abstraction features
- Slower to create (deploys account contract)
- Needed for cross-contract authorization
:::

:::tip Choosing account types
```rust
pub unconstrained fn setup(with_authwits: bool) -> (TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let (owner, recipient) = if with_authwits {
        (env.create_contract_account(), env.create_contract_account())
    } else {
        (env.create_light_account(), env.create_light_account())
    };
    // ... deploy contracts ...
    (env, owner, recipient)
}
```
:::

## Testing with authwits

[Authwits](how_to_use_authwit.md) allow one account to authorize another to act on its behalf.

:::warning
Authwits require **contract accounts**, not light accounts.
:::

### Import authwit helpers

```rust
use aztec::test::helpers::authwit::{
    add_private_authwit_from_call_interface,
    add_public_authwit_from_call_interface,
};
```

### Private authwits

```rust
#[test]
unconstrained fn test_private_authwit() {
    // Setup with contract accounts (required for authwits)
    let (env, token_address, owner, spender) = setup(true);

    // Create the call that needs authorization
    let amount = 100;
    let nonce = 7; // Non-zero nonce for authwit
    let burn_call = Token::at(token_address).burn_private(owner, amount, nonce);

    // Grant authorization from owner to spender
    add_private_authwit_from_call_interface(owner, spender, burn_call);

    // Spender can now execute the authorized action
    env.call_private(spender, burn_call);
}
```

### Public authwits

```rust
#[test]
unconstrained fn test_public_authwit() {
    let (env, token_address, owner, spender) = setup(true);

    // Create public action that needs authorization
    let transfer_call = Token::at(token_address).transfer_public(owner, recipient, 100, nonce);

    // Grant public authorization
    add_public_authwit_from_call_interface(owner, spender, transfer_call);

    // Execute with authorization
    env.call_public(spender, transfer_call);
}

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

## Testing failure cases

Test functions that should fail using annotations:

### Generic failure

```rust
#[test(should_fail)]
unconstrained fn test_unauthorized_access() {
    let (env, contract, owner) = setup(false);
    let attacker = env.create_light_account();

    // This should fail because attacker is not authorized
    env.call_private(attacker, Contract::at(contract).owner_only_function());
}
```

### Specific error message

```rust
#[test(should_fail_with = "Balance too low")]
unconstrained fn test_insufficient_balance() {
    let (env, token, owner, recipient) = setup(false);

    // Try to transfer more than available
    let balance = 100;
    let transfer_amount = 101;

    env.call_private(owner, Token::at(token).transfer(recipient, transfer_amount));
}
```

### Testing authwit failures

```rust
#[test(should_fail_with = "Unknown auth witness for message hash")]
unconstrained fn test_missing_authwit() {
    let (env, token, owner, spender) = setup(true);

    // Try to burn without authorization
    let burn_call = Token::at(token).burn_private(owner, 100, 1);

    // No authwit granted - this should fail
    env.call_private(spender, burn_call);
}

```
