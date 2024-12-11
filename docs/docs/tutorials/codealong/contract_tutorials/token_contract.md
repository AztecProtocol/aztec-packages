---
title: "Private & Public token contract"
sidebar_position: 5
---

In this tutorial we will go through writing an L2 native token contract
for the Aztec Network, using the Aztec.nr contract libraries.

This tutorial is intended to help you get familiar with the Aztec.nr library, Aztec contract syntax and some of the underlying structure of the Aztec network.

In this tutorial you will learn how to:

- Write public functions that update public state
- Write private functions that update private state
- Implement access control on public and private functions
- Handle math operations safely
- Handle different private note types
- Pass data between private and public state

We are going to start with a blank project and fill in the token contract source code defined [here (GitHub Link)](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/noir-contracts/contracts/token_contract/src/main.nr), and explain what is being added as we go.

## Requirements

You will need to have `aztec-nargo` installed in order to compile Aztec.nr contracts.

## Project setup

Create a new project with:

```bash
aztec-nargo new --contract token_contract
```

Your file structure should look something like this:

```tree
.
|--private_voting
|  |--src
|  |  |--main.nr
|  |--Nargo.toml
```

Inside `Nargo.toml` paste the following:

```toml
[dependencies]
aztec = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/aztec" }
authwit={ git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/authwit"}
compressed_string = {git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/compressed-string"}
uint_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/uint-note" }
```

We will be working within `main.nr` for the rest of the tutorial.

## How this will work

Before writing the functions, let's go through them to see how this contract will work:

### Initializer

There is one `initializer` function in this contract, and it will be selected and executed once when the contract is deployed, similar to a constructor in Solidity. This is marked private, so the function logic will not be transparent. To execute public function logic in the constructor, this function will call `_initialize` (marked internal, more detail below).

### Public functions

These are functions that have transparent logic, will execute in a publicly verifiable context and can update public storage.

- [`set_admin`](#set_admin) enables the admin to be updated
- [`set_minter](#set_minter)` enables accounts to be added / removed from the approved minter list
- [`mint_to_public`](#mint_to_public) enables tokens to be minted to the public balance of an account
- [`transfer_in_public`](#transfer_in_public) enables users to transfer tokens from one account's public balance to another account's public balance
- [`burn_public`](#burn_public) enables users to burn tokens
- [`finalize_mint_to_private`](#finalize_mint_to_private) finalizes a `prepare_private_balance_increase` call
- [`finalize_transfer_to_private`](#finalize_transfer_to_private) finalizes a `prepare_private_balance_increase` call

### Private functions

These are functions that have private logic and will be executed on user devices to maintain privacy. The only data that is submitted to the network is a proof of correct execution, new data commitments and nullifiers, so users will not reveal which contract they are interacting with or which function they are executing. The only information that will be revealed publicly is that someone executed a private transaction on Aztec.

- [`transfer`](#transfer) enables an account to send tokens from their private balance to another account's private balance
- [`transfer_in_private`](#transfer_in_private) enables an account to send tokens from another account's private balance to another account's private balance
- [`transfer_to_private`](#transfer_to_private) transfers a specified `amount` from an accounts public balance to a designated recipient's private balance. This flow starts in private, but will be completed in public.
- [`transfer_to_public`](#transfer_to_public) transfers tokens from the private balance of another account, to a (potentially different account's) public balance
- [`mint_to_private`](#mint_to_private) enables an authorized minter to mint tokens to a specified address
- [`cancel_authwit`](#cancel_authwit) enables an account to cancel an authorization to spend tokens
- [`burn_private`](#burn_private) enables tokens to be burned privately
- [`setup_refund`](#setup_refund) allows users using a fee paying contract to receive unspent transaction fees
- [`prepare_private_balance_increase`](#prepare_private_balance_increase) is used to set up a [partial note](../../../aztec/concepts/storage/partial_notes.md) to be completed in public

#### Private `view` functions

These functions provide an interface to allow other contracts to read state variables in private:

- `private_get_name`
- `private_get_symbol`
- `private_get_decimals`

### Internal functions

Internal functions are functions that can only be called by the contract itself. These can be used when the contract needs to call one of it's public functions from one of it's private functions.

- [`_increase_public_balance`](#_increase_public_balance) increases the public balance of an account when `transfer_to_public` is called
- [`_reduce_total_supply`](#_reduce_total_supply) reduces the total supply of tokens when a token is privately burned
- [`complete_refund`](#complete_refund) used in the fee payment flow. There is more detail on the [partial note](../../../aztec/concepts/storage/partial_notes.md#private-fee-payment-implementation) page.
- [`_finalize_transfer_to_private_unsafe`](#_finalize_transfer_to_private_unsafe) is the public component for finalizing a transfer from a public balance to private balance. It is considered `unsafe` because `from` is not enforced in this function, but it is in enforced the private function that calls this one (so it's safe).
- [`_finalize_mint_to_private_unsafe`](#_finalize_mint_to_private_unsafe) finalizes a private mint. Like the function above, it is considered `unsafe` because `from` is not enforced in this function, but it is in enforced the private function that calls this one (so it's safe).

To clarify, let's review some details of the Aztec transaction lifecycle, particularly how a transaction "moves through" these contexts.

#### Execution contexts

Transactions are initiated in the private context (executed client-side), then move to the L2 public context (executed remotely by an Aztec sequencer), then to the Ethereum L1 context (executed by an Ethereum node).

Step 1. Private Execution

Users provide inputs and execute locally on their device for privacy reasons. Outputs of the private execution are commitment and nullifier updates, a proof of correct execution and any return data to pass to the public execution context.

Step 2. Public Execution

This happens remotely by the sequencer, which takes inputs from the private execution and runs the public code in the network virtual machine, similar to any other public blockchain.

Step 3. Ethereum execution

Aztec transactions can pass messages to Ethereum contracts through the rollup via the outbox. The data can be consumed by Ethereum contracts at a later time, but this is not part of the transaction flow for an Aztec transaction. The technical details of this are beyond the scope of this tutorial, but we will cover them in an upcoming piece.

### Unconstrained functions

Unconstrained functions can be thought of as view functions from Solidity--they only return information from the contract storage or compute and return data without modifying contract storage.

## Contract dependencies

Before we can implement the functions, we need set up the contract storage, and before we do that we need to import the appropriate dependencies.

:::info Copy required files

We will be going over the code in `main.nr` [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/#include_aztec_version/noir-projects/noir-contracts/contracts/token_contract/src). If you are following along and want to compile `main.nr` yourself, you need to add the other files in the directory as they contain imports that are used in `main.nr`.

:::

Paste these imports:

```rust
#include_code imports /noir-projects/noir-contracts/contracts/token_contract/src/main.nr raw
}
```

We are importing:

- `CompressedString` to hold the token symbol
- Types from `aztec::prelude`
- Types for storing note types

### Types files

We are also importing types from a `types.nr` file, which imports types from the `types` folder. You can view them [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/#include_aztec_version/noir-projects/noir-contracts/contracts/token_contract/src).

:::note

Private state in Aztec is all [UTXOs](../../../aztec/concepts/storage/index.md).

:::

## Contract Storage

Now that we have dependencies imported into our contract we can define the storage for the contract.

Below the dependencies, paste the following Storage struct:

#include_code storage_struct /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

Reading through the storage variables:

- `admin` an Aztec address stored in public state.
- `minters` is a mapping of Aztec addresses in public state. This will store whether an account is an approved minter on the contract.
- `balances` is a mapping of private balances. Private balances are stored in a `PrivateSet` of `UintNote`s. The balance is the sum of all of an account's `UintNote`s.
- `total_supply` is an unsigned integer (max 128 bit value) stored in public state and represents the total number of tokens minted.
- `public_balances` is a mapping of Aztec addresses in public state and represents the publicly viewable balances of accounts.
- `symbol`, `name`, and `decimals` are similar in meaning to ERC20 tokens on Ethereum.

## Functions

Copy and paste the body of each function into the appropriate place in your project if you are following along.

### Constructor

This function sets the creator of the contract (passed as `msg_sender` from the constructor) as the admin and makes them a minter, and sets name, symbol, and decimals.

#include_code constructor /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

### Public function implementations

Public functions are declared with the `#[public]` macro above the function name.

As described in the [execution contexts section above](#execution-contexts), public function logic and transaction information is transparent to the world. Public functions update public state, but can be used to finalize notes prepared in a private context ([partial notes flow](../../../aztec/concepts/storage/partial_notes.md)).

Storage is referenced as `storage.variable`.

#### `set_admin`

After storage is initialized, the contract checks that the `msg_sender` is the `admin`. If not, the transaction will fail. If it is, the `new_admin` is saved as the `admin`.

#include_code set_admin /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

#### `set_minter`

This function allows the `admin` to add or a remove a `minter` from the public `minters` mapping. It checks that `msg_sender` is the `admin` and finally adds the `minter` to the `minters` mapping.

#include_code set_minter /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

#### `mint_to_public`

This function allows an account approved in the public `minters` mapping to create new public tokens owned by the provided `to` address.

First, storage is initialized. Then the function checks that the `msg_sender` is approved to mint in the `minters` mapping. If it is, a new `U128` value is created of the `amount` provided. The function reads the recipients public balance and then adds the amount to mint, saving the output as `new_balance`, then reads to total supply and adds the amount to mint, saving the output as `supply`. `new_balance` and `supply` are then written to storage.

#include_code mint_to_public /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

#### `transfer_in_public`

This public function enables public transfers between Aztec accounts. The sender's public balance will be debited the specified `amount` and the recipient's public balances will be credited with that amount.

##### Authorizing token spends

If the `msg_sender` is **NOT** the same as the account to debit from, the function checks that the account has authorized the `msg_sender` contract to debit tokens on its behalf. This check is done by computing the function selector that needs to be authorized, computing the hash of the message that the account contract has approved. This is a hash of the contract that is approved to spend (`context.msg_sender`), the token contract that can be spent from (`context.this_address()`), the `selector`, the account to spend from (`from`), the `amount` and a `nonce` to prevent multiple spends. This hash is passed to `assert_inner_hash_valid_authwit_public` to ensure that the Account Contract has approved tokens to be spent on it's behalf.

If the `msg_sender` is the same as the account to debit tokens from, the authorization check is bypassed and the function proceeds to update the account's `public_balance`.

#include_code transfer_in_public /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

#### `burn_public`

This public function enables public burning (destroying) of tokens from the sender's public balance.

After storage is initialized, the [authorization flow specified above](#authorizing-token-spends) is checked. Then the sender's public balance and the `total_supply` are updated and saved to storage.

#include_code burn_public /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

#### `finalize_mint_to_private`

This public function finalizes a transfer that has been set up by a call to `prepare_private_balance_increase` by reducing the public balance of the associated account and emitting the note for the intended recipient.

#include_code finalize_mint_to_private /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

#### `finalize_transfer_to_private`

Similar to `finalize_mint_to_private`, this public function finalizes a transfer that has been set up by a call to `prepare_private_balance_increase` by reducing the public balance of the associated account and emitting the note for the intended recipient.

#include_code finalize_transfer_to_private /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

### Private function implementations

Private functions are declared with the `#[private]` macro above the function name like so:

```rust
    #[private]
    fn transfer_to_public(
```

As described in the [execution contexts section above](#execution-contexts), private function logic and transaction information is hidden from the world and is executed on user devices. Private functions update private state, but can pass data to the public execution context (e.g. see the [`transfer_to_public`](#transfer_to_public) function).

Storage is referenced as `storage.variable`.

#### `transfer_to_public`

This private function enables transferring of private balance (`UintNote` stored in `balances`) to any Aztec account's `public_balance`.

After initializing storage, the function checks that the `msg_sender` is authorized to spend tokens. See [the Authorizing token spends section](#authorizing-token-spends) above for more detail--the only difference being that `assert_inner_hash_valid_authwit` in the authwit check is modified to work specifically in the private context. After the authorization check, the sender's private balance is decreased using the `decrement` helper function for the `value_note` library. Then it stages a public function call on this contract ([`_increase_public_balance`](#_increase_public_balance)) to be executed in the [public execution phase](#execution-contexts) of transaction execution. `_increase_public_balance` is marked as an `internal` function, so can only be called by this token contract.

The function returns `1` to indicate successful execution.

#include_code transfer_to_public /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

#### `transfer`

This private function enables private token transfers between Aztec accounts.

After initializing storage, the function checks that the `msg_sender` is authorized to spend tokens. See [the Authorizing token spends section](#authorizing-token-spends) above for more detail--the only difference being that `assert_valid_message_for` is modified to work specifically in the private context. After authorization, the function gets the current balances for the sender and recipient and decrements and increments them, respectively, using the `value_note` helper functions.

#include_code transfer /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

#### `transfer_in_private`

This private function enables an account to transfer tokens on behalf of another account. The account that tokens are being debited from must have authorized the `msg_sender` to spend tokens on its behalf.

#include_code transfer_in_private /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

#### `transfer_to_private`

This function execution flow starts in the private context and is completed with a call to a public internal function. It enables an account to send tokens from its `public_balance` to a private balance of an arbitrary recipient.

First a partial note is prepared then a call to the public, internal `_finalize_transfer_to_private_unsafe` is enqueued. The enqueued public call subtracts the `amount` from public balance of `msg_sender` and finalizes the partial note with the `amount`.

#include_code transfer_to_private /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

#### `mint_to_private`

This private function prepares a partial `UintNote` at the recipients storage slot in the contract and enqueues a public call to `_finalize_mint_to_private_unsafe`, which asserts that the `msg_sender` is an authorized minter and finalized the mint by incrementing the total supply and emitting the complete, encrypted `UintNote` to the intended recipient. Note that the `amount` and the minter (`from`) are public, but the recipient is private.

#include_code mint_to_private /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

#### `cancel_authwit`

This private function allows a user to cancel an authwit that was previously granted. This is achieved by emitting the corresponding nullifier before it is used.

#include_code cancel_authwit /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

#### `burn_private`

This private function enables accounts to privately burn (destroy) tokens.

After initializing storage, the function checks that the `msg_sender` is authorized to spend tokens. Then it gets the sender's current balance and decrements it. Finally it stages a public function call to [`_reduce_total_supply`](#_reduce_total_supply).

#include_code burn_private /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

#### `setup_refund`

This private function may be called by a Fee Paying Contract (FPC) in order to allow users to pay transaction fees privately on the network. This function ensures that the user has enough funds in their account to pay the transaction fees for the transaction, sets up partial notes for paying the fees to the `fee_payer` and sending any unspent fees back to the user, and enqueues a call to the internal, public [`complete_refund`](#complete_refund) function to be run as part of the public execution step.

#include_code setup_refund /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

#### `prepare_private_balance_increase`

TODO: update from `prepare_transfer_to_private`

This private function prepares to transfer from a public balance to a private balance by setting up a partial note for the recipient. The function returns the `hiding_point_slot`. After this, the public [`finalize_transfer_to_private`](#finalize_transfer_to_private) must be called, passing the amount and the hiding point slot.

#include_code prepare_private_balance_increase /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

### Internal function implementations

Internal functions are functions that can only be called by this contract. The following 3 functions are public functions that are called from the [private execution context](#execution-contexts). Marking these as `internal` ensures that only the desired private functions in this contract are able to call them. Private functions defer execution to public functions because private functions cannot update public state directly.

#### `_increase_public_balance`

This function is called from [`transfer_to_public`](#transfer_to_public). The account's private balance is decremented in `transfer_to_public` and the public balance is increased in this function.

#include_code increase_public_balance /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

#### `_reduce_total_supply`

This function is called from [`burn`](#burn). The account's private balance is decremented in `burn` and the public `total_supply` is reduced in this function.

#include_code reduce_total_supply /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

#### `complete_refund`

This public function is intended to be called during the public teardown at the end of public transaction execution. The call to this function is staged in [`setup_refund`](#setup_refund). This function ensures that the user has sufficient funds to cover the transaction costs and emits encrypted notes to the fee payer and the remaining, unused transaction fee back to the user.

#include_code complete_refund /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

#### `_finalize_transfer_to_private_unsafe`

This public internal function decrements the public balance of the `from` account and finalizes the partial note for the recipient, which is hidden in the `hiding_point_slot`.

This function is called by the private function [`transfer_to_private`](#transfer_to_private) to finalize the transfer. The `transfer_to_private` enforces the `from` argument, which is why using it `unsafe` is okay.

#include_code finalize_transfer_to_private_unsafe /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

#### `_finalize_mint_to_private_unsafe`

Similar to `_finalize_transfer_to_private_unsafe`, this public internal function increments the private balance of the recipient by finalizing the partial note and emitting the encrypted note. It also increments the public total supply and ensures that the sender of the transaction is authorized to mint tokens on the contract.

#include_code finalize_mint_to_private_unsafe /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

### View function implementations

View functions in Aztec are similar to `view` functions in Solidity in that they only return information from the contract storage or compute and return data without modifying contract storage. These functions are different from unconstrained functions in that the return values are constrained by their definition in the contract.

Public view calls that are part of a transaction will be executed by the sequencer when the transaction is being executed, so they are not private and will reveal information about the transaction. Private view calls can be safely used in private transactions for getting the same information.

#### `admin`

A getter function for reading the public `admin` value.

#include_code admin /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

#### `is_minter`

A getter function for checking the value of associated with a `minter` in the public `minters` mapping.

#include_code is_minter /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

#### `total_supply`

A getter function for checking the token `total_supply`.

#include_code total_supply /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

#### `balance_of_public`

A getter function for checking the public balance of the provided Aztec account.

#include_code balance_of_public /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

### Unconstrained function implementations

Unconstrained functions are similar to `view` functions in Solidity in that they only return information from the contract storage or compute and return data without modifying contract storage. They are different from view functions in that the values are returned from the user's PXE and are not constrained by the contract's definition--if there is bad data in the user's PXE, they will get bad data back.

#### `balance_of_private`

A getter function for checking the private balance of the provided Aztec account. Note that the [Private Execution Environment (PXE) (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/#include_aztec_version/yarn-project/pxe) must have `ivsk` ([incoming viewing secret key](../../../aztec/concepts/accounts/keys.md#incoming-viewing-keys)) in order to decrypt the notes.

#include_code balance_of_private /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

## Compiling

Now that the contract is complete, you can compile it with `aztec-nargo`. See the [Sandbox reference page](../../../reference/developer_references/sandbox_reference/index.md) for instructions on setting it up.

Run the following command in the directory where your `Nargo.toml` file is located:

```bash
aztec-nargo compile
```

Once your contract is compiled, optionally generate a typescript interface with the following command:

```bash
aztec codegen target -o src/artifacts
```

## Next Steps

### Token Bridge Contract

The [token bridge tutorial](.//token_bridge/index.md) is a great follow up to this one.

It builds on the Token contract described here and goes into more detail about Aztec contract composability and Ethereum (L1) and Aztec (L2) cross-chain messaging.

### Optional: Dive deeper into this contract and concepts mentioned here

- Review [the end to end tests (Github link)](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/yarn-project/end-to-end/src/e2e_token_contract/) for reference.
- [Commitments (Wikipedia link)](https://en.wikipedia.org/wiki/Commitment_scheme)
- [Nullifiers](../../../aztec/concepts/storage/trees/index.md#nullifier-tree)
- [Public / Private function calls](../../../aztec/smart_contracts/functions/public_private_calls.md).
- [Contract Storage](../../../aztec/concepts/storage/index.md)
- [Authwit](../../../aztec/concepts/accounts/authwit.md)
