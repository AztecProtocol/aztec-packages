---
title: Testing Contracts
tags: [contracts, tests, testing, txe]
keywords: [tests, testing, txe]
sidebar_position: 2
importance: 1
---

Aztec contracts can be tested in a variety of ways depending on the needs of a particular application and the complexity of the interactions they must support.

To test individual contract functions, you can use the Testing eXecution Environment (TXE) described below. For more complex interactions that require checking that the protocol rules are enforced, you should [write end-to-end tests using TypeScript](../js_apps/test.md).

## Pure Noir tests

Noir supports the `#[test]` annotation which can be used to write simple logic tests on isolated utility functions. These tests only make assertions on algorithms and cannot interact with protocol-specific constructs such as `storage` or `context`, but are extremely fast and can be useful in certain scenarios.

```rust title="pure_noir_testing" showLineNumbers 
#[test]
fn test_to_from_field() {
    let field = 1234567890;
    let card = Card::from_field(field);
    assert(card.to_field() == field);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/card_game_contract/src/cards.nr#L40-L47" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/card_game_contract/src/cards.nr#L40-L47</a></sub></sup>


To learn more about Noir testing, please refer to [the Noir docs](https://Noir-lang.org/docs/tooling/testing/).

## TXE (pronounced "trixie")

In order to interact with the protocol, Aztec contracts leverage the power of oracles: functions that reach out to the outside world and are able to query and manipulate data outside of itself. The values returned by oracles are then constrained inside Noir and modifications to the blockchain state are later verified to adhere to the protocol rules by our kernel circuits.

However, all of this is often not necessary to ensure the contract logic itself is sound. All that we need is an entity to provide values consistent with real execution. This is where our TXE (Testing eXecution Environment, pronounced "trixie") comes in!

TXE is a JSON RPC server much like PXE, but provides an extra set of oracle functions called `cheatcodes` that allow developers to manipulate the state of the chain and simulate contract execution. Since TXE skips most of the checks, block building and other intricacies of the Aztec protocol, it is much faster to run than simulating everything in the sandbox.

## TXE vs End-to-end tests

End-to-end tests are written in typescripts and use compiled Aztec contracts and generated Typescript interfaces, a private execution environment (PXE) and a simulated execution environment to process transactions, create blocks and apply state updates. This allows for advanced checks on state updates like generation the of logs, cross-chain messages and checking transaction status and also enforce the rules of the protocol (e.g. checks in our rollup circuits). If you need the rules of the protocol to be enforced or require complex interactions (such as with L1 contracts), please refer to [Testing Aztec.nr contracts with Typescript](../js_apps/test.md).

The TXE is a super fast framework in Noir to quickly test your smart contract code.

So to summarize:

- End-to-end tests are written in Typescript. TXE in Noir.
- End-to-end tests are most similar to using mocha + ethers.js to test Solidity Contracts. TXE is like foundry (fast tests in solidity)

### Running TXE

If you have [the sandbox](../../getting_started.md) installed, you can run TXE tests using:

`aztec test`

The complete process for running tests:

1. Compile contracts
2. Start the sandbox
3. Run `aztec test`

In order to use the TXE, it must be running on a known address.

:::warning
Since TXE tests are written in Noir and executed with `aztec-nargo`, they all run in parallel. This also means every test creates their own isolated environment, so state modifications are local to each one of them.
:::

### Writing TXE tests

`aztec-nr` provides an utility class called `TestEnvironment`, that should take care of the most common operations needed to setup contract testing. Setting up a new test environment with `TestEnvironment::new()` **will reset the current test's TXE state**.

:::tip
You can find all of the methods available in the `TestEnvironment` [here (Github link)](https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/aztec-nr/aztec/src/test/helpers/test_environment.nr).
:::

```rust title="txe_test_increment" showLineNumbers 
#[test]
unconstrained fn test_increment() {
    // Setup env, generate keys
    let mut env = TestEnvironment::new();
    let owner = env.create_account(1);
    let sender = env.create_account(2);
    let initial_value: Field = 5;

    // Deploy contract and initialize
    let initializer = Counter::interface().initialize(initial_value as u64, owner);
    let contract_address =
        env.deploy_self("Counter").with_private_initializer(owner, initializer).to_address();

    // Read the stored value in the note
    let initial_counter =
        env.simulate_utility(Counter::at(contract_address)._experimental_get_counter(owner));
    assert(
        initial_counter == initial_value,
        f"Expected {initial_value} but got {initial_counter}",
    );

    // Increment the counter
    let _ =
        env.call_private_void(owner, Counter::at(contract_address).increment(owner, sender));

    let incremented_counter =
        env.simulate_utility(Counter::at(contract_address)._experimental_get_counter(owner));
    let expected_current_value = initial_value + 1;
    assert(
        expected_current_value == incremented_counter,
        f"Expected {expected_current_value} but got {incremented_counter}",
    );
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/test/counter_contract/src/main.nr#L132-L168" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/test/counter_contract/src/main.nr#L132-L168</a></sub></sup>


:::warning
Tests run significantly faster as `unconstrained` functions. This means we generate bytecode (Brillig) and not circuits (ACIR), which _should_ yield exactly the same results. Any other behavior is considered a bug.
:::

### Imports

Writing tests in contracts requires importing additional modules from Aztec.nr. Here are the modules that are needed for testing the increment function in the counter contract.

```rust title="test_imports" showLineNumbers 
use crate::test;
use dep::aztec::note::note_getter::{MAX_NOTES_PER_PAGE, view_notes};
use dep::aztec::note::note_viewer_options::NoteViewerOptions;
use dep::aztec::protocol_types::storage::map::derive_storage_slot_in_map;
use dep::aztec::test::helpers::test_environment::TestEnvironment;
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/test/counter_contract/src/main.nr#L124-L131" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/test/counter_contract/src/main.nr#L124-L131</a></sub></sup>


### Deploying contracts

```rust

// Deploy the contract we're currently on

let deployer = env.deploy_self("ContractName");

// Deploy a standalone contract in a path relative to the current one (always from the location of Nargo.toml)

let deployer = env.deploy("path_to_contract_root_folder_where_nargo_toml_is", "ContractName");

// Deploy a contract in a workspace

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
It is always necessary to deploy a contract in order to test it. **It is important to keep them up to date**, as TXE cannot recompile them on changes. Think of it as regenerating the bytecode and ABI so it becomes accessible externally.
:::

### Calling functions

Our test environment is capable of utilizing the autogenerated contract interfaces to abstract calls, but without going through the usual external call flow (meaning much faster execution).

#### Private

For example, to call the private `transfer` function on the token contract:

```rust title="txe_test_transfer_private" showLineNumbers 
// Transfer tokens
let transfer_amount = 1000 as u128;
Token::at(token_contract_address).transfer(recipient, transfer_amount).call(&mut env.private());
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/test/transfer.nr#L11-L15" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/test/transfer.nr#L11-L15</a></sub></sup>


#### Public

To call the public `transfer_in_public` function:

```rust title="call_public" showLineNumbers 
Token::at(token_contract_address).transfer_in_public(owner, owner, transfer_amount, 0).call(
    &mut env.public(),
);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/test/transfer_in_public.nr#L29-L33" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/test/transfer_in_public.nr#L29-L33</a></sub></sup>


#### Utility

Utility functions can be directly called from the contract interface. Notice that we need to set the contract address to the specific token contract that we are calling before making the call. This is to ensure that `view_notes` works properly.

```rust title="txe_test_call_utility" showLineNumbers 
pub unconstrained fn check_private_balance(
    token_contract_address: AztecAddress,
    address: AztecAddress,
    address_amount: u128,
) {
    let current_contract_address = get_contract_address();
    cheatcodes::set_contract_address(token_contract_address);
    // Direct call to a utility function
    let balance_of_private = Token::balance_of_private(address);
    assert(balance_of_private == address_amount, "Private balance is not correct");
    cheatcodes::set_contract_address(current_contract_address);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/test/utils.nr#L135-L148" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/test/utils.nr#L135-L148</a></sub></sup>


### Creating accounts

The test environment provides two different ways of creating accounts, depending on the testing needs. For most cases, it is only necessary to obtain a valid `AztecAddress` that represents the user's account contract. For this, is is enough to do:

```rust
let mocked_account_address = env.create_account(secret);
```

These accounts also create the necessary keys to ensure notes can be created/nullified, etc.

For more advanced flows, such as authwits, it is necessary to create a real `AccountContract`, with valid signing keys that gets actually deployed to TXE. For that you can use:

```rust
let real_account_address = env.create_account_contract(secret);
```

Besides deploying a complete `SchnorrAccountContract`, key derivation is performed so that authwits can be signed. It is slightly slower than the mocked version.

Once accounts have been created, you can impersonate them in your test by calling:

```rust
env.impersonate(account_address);
// or (these are equivalent)
cheatcodes::set_contract_address(contract_address);
```

### Checking state

It is possible to use the regular oracles in tests in order to retrieve public and private state and make assertions about them.

:::warning
Remember to switch to the current contract's address in order to be able to read it's siloed state!
:::

Reading public state:
```rust title="txe_test_read_public" showLineNumbers 
pub unconstrained fn check_public_balance(
    token_contract_address: AztecAddress,
    address: AztecAddress,
    address_amount: u128,
) {
    let current_contract_address = get_contract_address();
    cheatcodes::set_contract_address(token_contract_address);
    let block_number = get_block_number();

    let balances_slot = Token::storage_layout().public_balances.slot;
    let address_slot = derive_storage_slot_in_map(balances_slot, address);
    let amount: u128 = storage_read(token_contract_address, address_slot, block_number);
    assert(amount == address_amount, "Public balance is not correct");
    cheatcodes::set_contract_address(current_contract_address);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/test/utils.nr#L88-L104" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/test/utils.nr#L88-L104</a></sub></sup>


Reading notes:
```rust title="txe_test_read_notes" showLineNumbers 
// Read the stored value in the note
let initial_counter =
    env.simulate_utility(Counter::at(contract_address)._experimental_get_counter(owner));
assert(
    initial_counter == initial_value,
    f"Expected {initial_value} but got {initial_counter}",
);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/test/counter_contract/src/main.nr#L146-L154" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/test/counter_contract/src/main.nr#L146-L154</a></sub></sup>


### Authwits

#### Private

You can add [authwits](writing_contracts/authwit.md) to the TXE. Here is an example of testing a private token transfer using authwits:

```rust title="private_authwit" showLineNumbers 
let transfer_amount = 1000 as u128;
let transfer_private_from_call_interface =
    Token::at(token_contract_address).transfer_in_private(owner, recipient, transfer_amount, 1);
authwit_cheatcodes::add_private_authwit_from_call_interface(
    owner,
    recipient,
    transfer_private_from_call_interface,
);
// Impersonate recipient to perform the call
env.impersonate(recipient);
// Transfer tokens
transfer_private_from_call_interface.call(&mut env.private());
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/test/transfer_in_private.nr#L11-L24" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/test/transfer_in_private.nr#L11-L24</a></sub></sup>


#### Public

```rust title="public_authwit" showLineNumbers 
let public_transfer_in_private_call_interface =
    Token::at(token_contract_address).transfer_in_public(owner, recipient, transfer_amount, 1);
authwit_cheatcodes::add_public_authwit_from_call_interface(
    owner,
    recipient,
    public_transfer_in_private_call_interface,
);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/test/transfer_in_public.nr#L115-L123" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/test/transfer_in_public.nr#L115-L123</a></sub></sup>


### Storing notes in cache

Sometimes we have to tell TXE about notes that are not generated by ourselves, but someone else. This allows us to check if we are able to decrypt them:

```rust title="txe_test_add_note" showLineNumbers 
let balances_owner_slot =
    derive_storage_slot_in_map(Token::storage_layout().balances.slot, owner);

env.add_note(
    UintNote { value: amount, owner: owner, randomness: note_randomness },
    balances_owner_slot,
    token_contract_address,
);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/test/utils.nr#L169-L178" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/test/utils.nr#L169-L178</a></sub></sup>


### Time traveling

TXE can force the generation of "new blocks" very quickly using:

```rust
env.advance_block_by(n_blocks);
```

This will effectively consolidate state transitions into TXE's internal trees, allowing things such as reading "historical state" from private, generating inclusion proofs, etc.

### Failing cases

You can test functions that you expect to fail generically, with the `#[test(should_fail)]` annotation, or that it should fail with a specific message with `#[test(should_fail_with = "Failure message")]`.

For example:

```rust title="fail_with_message" showLineNumbers 
#[test(should_fail_with = "invalid authwit nonce")]
unconstrained fn transfer_private_failure_on_behalf_of_self_non_zero_nonce() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient, _) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ false);
    // Add authwit
    let transfer_amount = 1000 as u128;
    let transfer_private_from_call_interface =
        Token::at(token_contract_address).transfer_in_private(owner, recipient, transfer_amount, 1);
    authwit_cheatcodes::add_private_authwit_from_call_interface(
        owner,
        recipient,
        transfer_private_from_call_interface,
    );
    // Transfer tokens
    transfer_private_from_call_interface.call(&mut env.private());
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/test/transfer_in_private.nr#L30-L48" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/test/transfer_in_private.nr#L30-L48</a></sub></sup>


You can also use the `assert_public_call_fails` or `assert_private_call_fails` methods on the `TestEnvironment` to check that a call fails.

```rust title="assert_public_fail" showLineNumbers 
// Try to set ourselves as admin, fail miserably
let set_admin_call_interface = Token::at(token_contract_address).set_admin(recipient);
env.assert_public_call_fails(set_admin_call_interface);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/test/access_control.nr#L34-L38" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/test/access_control.nr#L34-L38</a></sub></sup>


### Logging

You can use `aztec.nr`'s oracles as usual for debug logging, as explained [here](../../reference/debugging/index.md)


:::warning
Remember to set the following environment variables to activate debug logging:

```bash
export LOG_LEVEL="debug"
```

:::

### All Cheatcodes

You can find the full list of cheatcodes available in the TXE [here](https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/aztec-nr/aztec/src/test/helpers/cheatcodes.nr)
