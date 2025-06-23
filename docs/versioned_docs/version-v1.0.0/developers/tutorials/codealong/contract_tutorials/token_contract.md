---
title: "Private & Public token contract"
draft: true
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

We are going to start with a blank project and fill in the token contract source code defined [here (GitHub Link)](https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr), and explain what is being added as we go.

This tutorial is compatible with the Aztec version `v1.0.0`. Install the correct version with `aztec-up -v 1.0.0`. Or if you'd like to use a different version, you can find the relevant tutorial by clicking the version dropdown at the top of the page.

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
aztec = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v1.0.0", directory="noir-projects/aztec-nr/aztec" }
authwit={ git="https://github.com/AztecProtocol/aztec-packages/", tag="v1.0.0", directory="noir-projects/aztec-nr/authwit"}
compressed_string = {git="https://github.com/AztecProtocol/aztec-packages/", tag="v1.0.0", directory="noir-projects/aztec-nr/compressed-string"}
uint_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v1.0.0", directory="noir-projects/aztec-nr/uint-note" }
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
- [`prepare_private_balance_increase`](#prepare_private_balance_increase) is used to set up a [partial note](../../../../aztec/concepts/advanced/storage/partial_notes.md) to be completed in public

#### Private `view` functions

These functions provide an interface to allow other contracts to read state variables in private:

- `private_get_name`
- `private_get_symbol`
- `private_get_decimals`

### Internal functions

Internal functions are functions that can only be called by the contract itself. These can be used when the contract needs to call one of it's public functions from one of it's private functions.

- [`_increase_public_balance`](#_increase_public_balance) increases the public balance of an account when `transfer_to_public` is called
- [`_reduce_total_supply`](#_reduce_total_supply) reduces the total supply of tokens when a token is privately burned
- [`complete_refund`](#complete_refund) used in the fee payment flow. There is more detail on the [partial note](../../../../aztec/concepts/advanced/storage/partial_notes.md#complete_refund) page.
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

## Contract dependencies

Before we can implement the functions, we need set up the contract storage, and before we do that we need to import the appropriate dependencies.

:::info Copy required files

We will be going over the code in `main.nr` [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src). If you are following along and want to compile `main.nr` yourself, you need to add the other files in the directory as they contain imports that are used in `main.nr`.

:::

Paste these imports:

```rust
mod types;
mod test;

use dep::aztec::macros::aztec;

// Minimal token implementation that supports `AuthWit` accounts.
// The auth message follows a similar pattern to the cross-chain message and includes a designated caller.
// The designated caller is ALWAYS used here, and not based on a flag as cross-chain.
// message hash = H([caller, contract, selector, ...args])
// To be read as `caller` calls function at `contract` defined by `selector` with `args`
// Including a nonce in the message hash ensures that the message can only be used once.
#[aztec]
pub contract Token {
    // Libs
    use std::ops::{Add, Sub};

    use dep::compressed_string::FieldCompressedString;

    use dep::aztec::{
        context::{PrivateCallInterface, PrivateContext},
        event::event_interface::{emit_event_in_private_log, PrivateLogContent},
        macros::{
            events::event,
            functions::{initializer, internal, private, public, utility, view},
            storage::storage,
        },
        messages::logs::note::{encode_and_encrypt_note, encode_and_encrypt_note_unconstrained},
        prelude::{AztecAddress, Map, PublicContext, PublicImmutable, PublicMutable},
    };

    use dep::uint_note::uint_note::{PartialUintNote, UintNote};
    use aztec::protocol_types::traits::ToField;

    use dep::authwit::auth::{
        assert_current_call_valid_authwit, assert_current_call_valid_authwit_public,
        compute_authwit_nullifier,
    };

    use crate::types::balance_set::BalanceSet;
}
```

We are importing:

- `CompressedString` to hold the token symbol
- Types from `aztec::prelude`
- Types for storing note types

### Types files

We are also importing types from a `types.nr` file, which imports types from the `types` folder. You can view them [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src).

:::note

Private state in Aztec is all [UTXOs](../../../../aztec/concepts/storage/index.md).

:::

## Contract Storage

Now that we have dependencies imported into our contract we can define the storage for the contract.

Below the dependencies, paste the following Storage struct:

```rust title="storage_struct" showLineNumbers 
#[storage]
struct Storage<Context> {
    admin: PublicMutable<AztecAddress, Context>,
    minters: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
    balances: Map<AztecAddress, BalanceSet<Context>, Context>,
    total_supply: PublicMutable<u128, Context>,
    public_balances: Map<AztecAddress, PublicMutable<u128, Context>, Context>,
    symbol: PublicImmutable<FieldCompressedString, Context>,
    name: PublicImmutable<FieldCompressedString, Context>,
    decimals: PublicImmutable<u8, Context>,
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L63-L83" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L63-L83</a></sub></sup>


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

```rust title="constructor" showLineNumbers 
#[public]
#[initializer]
fn constructor(admin: AztecAddress, name: str<31>, symbol: str<31>, decimals: u8) {
    assert(!admin.is_zero(), "invalid admin");
    storage.admin.write(admin);
    storage.minters.at(admin).write(true);
    storage.name.initialize(FieldCompressedString::from_string(name));
    storage.symbol.initialize(FieldCompressedString::from_string(symbol));
    storage.decimals.initialize(decimals);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L85-L98" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L85-L98</a></sub></sup>


### Public function implementations

Public functions are declared with the `#[public]` macro above the function name.

As described in the [execution contexts section above](#execution-contexts), public function logic and transaction information is transparent to the world. Public functions update public state, but can be used to finalize notes prepared in a private context ([partial notes flow](../../../../aztec/concepts/advanced/storage/partial_notes.md)).

Storage is referenced as `storage.variable`.

#### `set_admin`

After storage is initialized, the contract checks that the `msg_sender` is the `admin`. If not, the transaction will fail. If it is, the `new_admin` is saved as the `admin`.

```rust title="set_admin" showLineNumbers 
#[public]
fn set_admin(new_admin: AztecAddress) {
    assert(storage.admin.read().eq(context.msg_sender()), "caller is not admin");
    storage.admin.write(new_admin);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L100-L108" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L100-L108</a></sub></sup>


#### `set_minter`

This function allows the `admin` to add or a remove a `minter` from the public `minters` mapping. It checks that `msg_sender` is the `admin` and finally adds the `minter` to the `minters` mapping.

```rust title="set_minter" showLineNumbers 
#[public]
fn set_minter(minter: AztecAddress, approve: bool) {
    assert(storage.admin.read().eq(context.msg_sender()), "caller is not admin");
    storage.minters.at(minter).write(approve);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L178-L188" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L178-L188</a></sub></sup>


#### `mint_to_public`

This function allows an account approved in the public `minters` mapping to create new public tokens owned by the provided `to` address.

First, storage is initialized. Then the function checks that the `msg_sender` is approved to mint in the `minters` mapping. If it is, a new `U128` value is created of the `amount` provided. The function reads the recipients public balance and then adds the amount to mint, saving the output as `new_balance`, then reads to total supply and adds the amount to mint, saving the output as `supply`. `new_balance` and `supply` are then written to storage.

```rust title="mint_to_public" showLineNumbers 
#[public]
fn mint_to_public(to: AztecAddress, amount: u128) {
    assert(storage.minters.at(context.msg_sender()).read(), "caller is not minter");
    let new_balance = storage.public_balances.at(to).read().add(amount);
    let supply = storage.total_supply.read().add(amount);
    storage.public_balances.at(to).write(new_balance);
    storage.total_supply.write(supply);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L190-L201" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L190-L201</a></sub></sup>


#### `transfer_in_public`

This public function enables public transfers between Aztec accounts. The sender's public balance will be debited the specified `amount` and the recipient's public balances will be credited with that amount.

##### Authorizing token spends

If the `msg_sender` is **NOT** the same as the account to debit from, the function checks that the account has authorized the `msg_sender` contract to debit tokens on its behalf. This check is done by computing the function selector that needs to be authorized, computing the hash of the message that the account contract has approved. This is a hash of the contract that is approved to spend (`context.msg_sender`), the token contract that can be spent from (`context.this_address()`), the `selector`, the account to spend from (`from`), the `amount` and a `nonce` to prevent multiple spends. This hash is passed to `assert_inner_hash_valid_authwit_public` to ensure that the Account Contract has approved tokens to be spent on it's behalf.

If the `msg_sender` is the same as the account to debit tokens from, the authorization check is bypassed and the function proceeds to update the account's `public_balance`.

```rust title="transfer_in_public" showLineNumbers 
#[public]
fn transfer_in_public(
    from: AztecAddress,
    to: AztecAddress,
    amount: u128,
    authwit_nonce: Field,
) {
    if (!from.eq(context.msg_sender())) {
        assert_current_call_valid_authwit_public(&mut context, from);
    } else {
        assert(authwit_nonce == 0, "invalid authwit nonce");
    }
    let from_balance = storage.public_balances.at(from).read().sub(amount);
    storage.public_balances.at(from).write(from_balance);
    let to_balance = storage.public_balances.at(to).read().add(amount);
    storage.public_balances.at(to).write(to_balance);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L203-L221" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L203-L221</a></sub></sup>


#### `burn_public`

This public function enables public burning (destroying) of tokens from the sender's public balance.

After storage is initialized, the [authorization flow specified above](#authorizing-token-spends) is checked. Then the sender's public balance and the `total_supply` are updated and saved to storage.

```rust title="burn_public" showLineNumbers 
#[public]
fn burn_public(from: AztecAddress, amount: u128, authwit_nonce: Field) {
    if (!from.eq(context.msg_sender())) {
        assert_current_call_valid_authwit_public(&mut context, from);
    } else {
        assert(authwit_nonce == 0, "invalid authwit nonce");
    }
    let from_balance = storage.public_balances.at(from).read().sub(amount);
    storage.public_balances.at(from).write(from_balance);
    let new_supply = storage.total_supply.read().sub(amount);
    storage.total_supply.write(new_supply);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L223-L238" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L223-L238</a></sub></sup>


#### `finalize_mint_to_private`

This public function finalizes a transfer that has been set up by a call to `prepare_private_balance_increase` by reducing the public balance of the associated account and emitting the note for the intended recipient.

```rust title="finalize_mint_to_private" showLineNumbers 
/// Finalizes a mint of token `amount` to a private balance of `to`. The mint must be prepared by calling
/// `prepare_private_balance_increase` first and the resulting
/// `partial_note` must be passed as an argument to this function.
///
/// Note: This function is only an optimization as it could be replaced by a combination of `mint_to_public`
/// and `finalize_transfer_to_private`. It is however used very commonly so it makes sense to optimize it
/// (e.g. used during token bridging, in AMM liquidity token etc.).
#[public]
fn finalize_mint_to_private(amount: u128, partial_note: PartialUintNote) {
    // Completer is the entity that can complete the partial note. In this case, it's the same as the minter
    // account.
    let minter_and_completer = context.msg_sender();
    assert(storage.minters.at(minter_and_completer).read(), "caller is not minter");

    _finalize_mint_to_private(
        minter_and_completer,
        amount,
        partial_note,
        &mut context,
        storage,
    );
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L625-L648" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L625-L648</a></sub></sup>


#### `finalize_transfer_to_private`

Similar to `finalize_mint_to_private`, this public function finalizes a transfer that has been set up by a call to `prepare_private_balance_increase` by reducing the public balance of the associated account and emitting the note for the intended recipient.

```rust title="finalize_transfer_to_private" showLineNumbers 
/// Finalizes a transfer of token `amount` from public balance of `msg_sender` to a private balance of `to`.
/// The transfer must be prepared by calling `prepare_private_balance_increase` from `msg_sender` account and
/// the resulting `partial_note` must be passed as an argument to this function.
///
/// Note that this contract does not protect against a `partial_note` being used multiple times and it is up to
/// the caller of this function to ensure that it doesn't happen. If the same `partial_note` is used multiple
/// times, the token `amount` would most likely get lost (the partial note log processing functionality would fail
/// to find the pending partial note when trying to complete it).
#[public]
fn finalize_transfer_to_private(amount: u128, partial_note: PartialUintNote) {
    // Completer is the entity that can complete the partial note. In this case, it's the same as the account
    // `from` from whose balance we're subtracting the `amount`.
    let from_and_completer = context.msg_sender();
    _finalize_transfer_to_private(
        from_and_completer,
        amount,
        partial_note,
        &mut context,
        storage,
    );
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L506-L528" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L506-L528</a></sub></sup>


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

```rust title="transfer_to_public" showLineNumbers 
#[private]
fn transfer_to_public(
    from: AztecAddress,
    to: AztecAddress,
    amount: u128,
    authwit_nonce: Field,
) {
    if (!from.eq(context.msg_sender())) {
        assert_current_call_valid_authwit(&mut context, from);
    } else {
        assert(authwit_nonce == 0, "invalid authwit nonce");
    }

    storage.balances.at(from).sub(from, amount).emit(encode_and_encrypt_note(
        &mut context,
        from,
        from,
    ));
    Token::at(context.this_address())._increase_public_balance(to, amount).enqueue(&mut context);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L240-L261" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L240-L261</a></sub></sup>


#### `transfer`

This private function enables private token transfers between Aztec accounts.

After initializing storage, the function checks that the `msg_sender` is authorized to spend tokens. See [the Authorizing token spends section](#authorizing-token-spends) above for more detail--the only difference being that `assert_valid_message_for` is modified to work specifically in the private context. After authorization, the function gets the current balances for the sender and recipient and decrements and increments them, respectively, using the `value_note` helper functions.

```rust title="transfer" showLineNumbers 
#[private]
fn transfer(to: AztecAddress, amount: u128) {
    let from = context.msg_sender();

    // We reduce `from`'s balance by amount by recursively removing notes over potentially multiple calls. This
    // method keeps the gate count for each individual call low - reading too many notes at once could result in
    // circuits in which proving is not feasible.
    // Since the sum of the amounts in the notes we nullified was potentially larger than amount, we create a new
    // note for `from` with the change amount, e.g. if `amount` is 10 and two notes are nullified with amounts 8 and
    // 5, then the change will be 3 (since 8 + 5 - 10 = 3).
    let change = subtract_balance(
        &mut context,
        storage,
        from,
        amount,
        INITIAL_TRANSFER_CALL_MAX_NOTES,
    );
    storage.balances.at(from).add(from, change).emit(encode_and_encrypt_note_unconstrained(
        &mut context,
        from,
        from,
    ));
    storage.balances.at(to).add(to, amount).emit(encode_and_encrypt_note_unconstrained(
        &mut context,
        to,
        from,
    ));

    // We don't constrain encryption of the note log in `transfer` (unlike in `transfer_in_private`) because the transfer
    // function is only designed to be used in situations where the event is not strictly necessary (e.g. payment to
    // another person where the payment is considered to be successful when the other party successfully decrypts a
    // note).
    emit_event_in_private_log(
        Transfer { from, to, amount },
        &mut context,
        from,
        to,
        PrivateLogContent.NO_CONSTRAINTS,
    );
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L301-L344" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L301-L344</a></sub></sup>


#### `transfer_in_private`

This private function enables an account to transfer tokens on behalf of another account. The account that tokens are being debited from must have authorized the `msg_sender` to spend tokens on its behalf.

```rust title="transfer_in_private" showLineNumbers 
#[private]
fn transfer_in_private(
    from: AztecAddress,
    to: AztecAddress,
    amount: u128,
    authwit_nonce: Field,
) {
    if (!from.eq(context.msg_sender())) {
        assert_current_call_valid_authwit(&mut context, from);
    } else {
        assert(authwit_nonce == 0, "invalid authwit nonce");
    }

    storage.balances.at(from).sub(from, amount).emit(encode_and_encrypt_note(
        &mut context,
        from,
        from,
    ));
    storage.balances.at(to).add(to, amount).emit(encode_and_encrypt_note(&mut context, to, from));
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L408-L433" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L408-L433</a></sub></sup>


#### `transfer_to_private`

This function execution flow starts in the private context and is completed with a call to a public internal function. It enables an account to send tokens from its `public_balance` to a private balance of an arbitrary recipient.

First a partial note is prepared then a call to the public, internal `_finalize_transfer_to_private_unsafe` is enqueued. The enqueued public call subtracts the `amount` from public balance of `msg_sender` and finalizes the partial note with the `amount`.

```rust title="transfer_to_private" showLineNumbers 
// Transfers token `amount` from public balance of message sender to a private balance of `to`.
#[private]
fn transfer_to_private(to: AztecAddress, amount: u128) {
    // `from` is the owner of the public balance from which we'll subtract the `amount`.
    let from = context.msg_sender();
    let token = Token::at(context.this_address());

    // We prepare the private balance increase (the partial note).
    let partial_note = _prepare_private_balance_increase(from, to, &mut context, storage);

    // At last we finalize the transfer. Usage of the `unsafe` method here is safe because we set the `from`
    // function argument to a message sender, guaranteeing that he can transfer only his own tokens.
    token._finalize_transfer_to_private_unsafe(from, amount, partial_note).enqueue(&mut context);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L452-L467" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L452-L467</a></sub></sup>


#### `mint_to_private`

This private function prepares a partial `UintNote` at the recipients storage slot in the contract and enqueues a public call to `_finalize_mint_to_private_unsafe`, which asserts that the `msg_sender` is an authorized minter and finalized the mint by incrementing the total supply and emitting the complete, encrypted `UintNote` to the intended recipient. Note that the `amount` and the minter (`from`) are public, but the recipient is private.

```rust title="mint_to_private" showLineNumbers 
/// Mints token `amount` to a private balance of `to`. Message sender has to have minter permissions (checked
/// in the enqueued call).
#[private]
fn mint_to_private(
    // TODO(benesjan): This allows minter to set arbitrary `from`. That seems undesirable. Will nuke it in a followup PR.
    from: AztecAddress, // sender of the tag
    to: AztecAddress,
    amount: u128,
) {
    let token = Token::at(context.this_address());

    // We prepare the partial note to which we'll "send" the minted amount.
    let partial_note = _prepare_private_balance_increase(from, to, &mut context, storage);

    // At last we finalize the mint. Usage of the `unsafe` method here is safe because we set
    // the `minter_and_completer` function argument to a message sender, guaranteeing that only a message sender
    // with minter permissions can successfully execute the function.
    token._finalize_mint_to_private_unsafe(context.msg_sender(), amount, partial_note).enqueue(
        &mut context,
    );
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L601-L623" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L601-L623</a></sub></sup>


#### `cancel_authwit`

This private function allows a user to cancel an authwit that was previously granted. This is achieved by emitting the corresponding nullifier before it is used.

```rust title="cancel_authwit" showLineNumbers 
#[private]
fn cancel_authwit(inner_hash: Field) {
    let on_behalf_of = context.msg_sender();
    let nullifier = compute_authwit_nullifier(on_behalf_of, inner_hash);
    context.push_nullifier(nullifier);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L399-L406" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L399-L406</a></sub></sup>


#### `burn_private`

This private function enables accounts to privately burn (destroy) tokens.

After initializing storage, the function checks that the `msg_sender` is authorized to spend tokens. Then it gets the sender's current balance and decrements it. Finally it stages a public function call to [`_reduce_total_supply`](#_reduce_total_supply).

```rust title="burn_private" showLineNumbers 
#[private]
fn burn_private(from: AztecAddress, amount: u128, authwit_nonce: Field) {
    if (!from.eq(context.msg_sender())) {
        assert_current_call_valid_authwit(&mut context, from);
    } else {
        assert(authwit_nonce == 0, "invalid authwit nonce");
    }
    storage.balances.at(from).sub(from, amount).emit(encode_and_encrypt_note(
        &mut context,
        from,
        from,
    ));
    Token::at(context.this_address())._reduce_total_supply(amount).enqueue(&mut context);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L435-L450" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L435-L450</a></sub></sup>


#### `prepare_private_balance_increase`

TODO: update from `prepare_transfer_to_private`

This private function prepares to transfer from a public balance to a private balance by setting up a partial note for the recipient. The function returns the `hiding_point_slot`. After this, the public [`finalize_transfer_to_private`](#finalize_transfer_to_private) must be called, passing the amount and the hiding point slot.

```rust title="prepare_private_balance_increase" showLineNumbers 
/// Prepares an increase of private balance of `to` (partial note). The increase needs to be finalized by calling
/// some of the finalization functions (`finalize_transfer_to_private`, `finalize_mint_to_private`) with the
/// returned partial note.
#[private]
fn prepare_private_balance_increase(to: AztecAddress, from: AztecAddress) -> PartialUintNote {
    // ideally we'd not have `from` here, but we do need a `from` address to produce a tagging secret with `to`.
    _prepare_private_balance_increase(from, to, &mut context, storage)
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L469-L478" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L469-L478</a></sub></sup>


### Internal function implementations

Internal functions are functions that can only be called by this contract. The following 3 functions are public functions that are called from the [private execution context](#execution-contexts). Marking these as `internal` ensures that only the desired private functions in this contract are able to call them. Private functions defer execution to public functions because private functions cannot update public state directly.

#### `_increase_public_balance`

This function is called from [`transfer_to_public`](#transfer_to_public). The account's private balance is decremented in `transfer_to_public` and the public balance is increased in this function.

```rust title="increase_public_balance" showLineNumbers 
/// TODO(#9180): Consider adding macro support for functions callable both as an entrypoint and as an internal
/// function.
#[public]
#[internal]
fn _increase_public_balance(to: AztecAddress, amount: u128) {
    _increase_public_balance_inner(to, amount, storage);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L690-L698" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L690-L698</a></sub></sup>


#### `_reduce_total_supply`

This function is called from [`burn`](#burn). The account's private balance is decremented in `burn` and the public `total_supply` is reduced in this function.

```rust title="reduce_total_supply" showLineNumbers 
#[public]
#[internal]
fn _reduce_total_supply(amount: u128) {
    // Only to be called from burn.
    let new_supply = storage.total_supply.read().sub(amount);
    storage.total_supply.write(new_supply);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L710-L718" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L710-L718</a></sub></sup>


#### `_finalize_transfer_to_private_unsafe`

This public internal function decrements the public balance of the `from` account and finalizes the partial note for the recipient, which is hidden in the `hiding_point_slot`.

This function is called by the private function [`transfer_to_private`](#transfer_to_private) to finalize the transfer. The `transfer_to_private` enforces the `from` argument, which is why using it `unsafe` is okay.

```rust title="finalize_transfer_to_private_unsafe" showLineNumbers 
/// This is a wrapper around `_finalize_transfer_to_private` placed here so that a call
/// to `_finalize_transfer_to_private` can be enqueued. Called unsafe as it does not check `from_and_completer`
/// (this has to be done in the calling function).
#[public]
#[internal]
fn _finalize_transfer_to_private_unsafe(
    from_and_completer: AztecAddress,
    amount: u128,
    partial_note: PartialUintNote,
) {
    _finalize_transfer_to_private(
        from_and_completer,
        amount,
        partial_note,
        &mut context,
        storage,
    );
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L561-L580" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L561-L580</a></sub></sup>


#### `_finalize_mint_to_private_unsafe`

Similar to `_finalize_transfer_to_private_unsafe`, this public internal function increments the private balance of the recipient by finalizing the partial note and emitting the encrypted note. It also increments the public total supply and ensures that the sender of the transaction is authorized to mint tokens on the contract.

```rust title="finalize_mint_to_private_unsafe" showLineNumbers 
/// This is a wrapper around `_finalize_mint_to_private` placed here so that a call
/// to `_finalize_mint_to_private` can be enqueued. Called unsafe as it does not check `minter_and_completer` (this
/// has to be done in the calling function).
#[public]
#[internal]
fn _finalize_mint_to_private_unsafe(
    minter_and_completer: AztecAddress,
    amount: u128,
    partial_note: PartialUintNote,
) {
    // We check the minter permissions as it was not done in `mint_to_private` function.
    assert(storage.minters.at(minter_and_completer).read(), "caller is not minter");
    _finalize_mint_to_private(
        minter_and_completer,
        amount,
        partial_note,
        &mut context,
        storage,
    );
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L650-L671" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L650-L671</a></sub></sup>


### View function implementations

View functions in Aztec are similar to `view` functions in Solidity in that they only return information from the contract storage or compute and return data without modifying contract storage. These functions are different from utility functions in that the return values are constrained by their definition in the contract.

Public view calls that are part of a transaction will be executed by the sequencer when the transaction is being executed, so they are not private and will reveal information about the transaction. Private view calls can be safely used in private transactions for getting the same information.

#### `admin`

A getter function for reading the public `admin` value.

```rust title="admin" showLineNumbers 
#[public]
#[view]
fn get_admin() -> Field {
    storage.admin.read().to_field()
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L146-L152" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L146-L152</a></sub></sup>


#### `is_minter`

A getter function for checking the value of associated with a `minter` in the public `minters` mapping.

```rust title="is_minter" showLineNumbers 
#[public]
#[view]
fn is_minter(minter: AztecAddress) -> bool {
    storage.minters.at(minter).read()
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L154-L160" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L154-L160</a></sub></sup>


#### `total_supply`

A getter function for checking the token `total_supply`.

```rust title="total_supply" showLineNumbers 
#[public]
#[view]
fn total_supply() -> u128 {
    storage.total_supply.read()
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L162-L168" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L162-L168</a></sub></sup>


#### `balance_of_public`

A getter function for checking the public balance of the provided Aztec account.

```rust title="balance_of_public" showLineNumbers 
#[public]
#[view]
fn balance_of_public(owner: AztecAddress) -> u128 {
    storage.public_balances.at(owner).read()
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L170-L176" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L170-L176</a></sub></sup>


### Utility function implementations

[Utility](../../../../aztec/smart_contracts/functions/attributes.md#utility-functions-utility) functions can be used to get contract information, both private and public, from an application - they are not callable inside a transaction.

#### `balance_of_private`

A getter function for checking the private balance of the provided Aztec account. Note that the [Private Execution Environment (PXE) (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/v1.0.0/yarn-project/pxe) must have `ivsk` ([incoming viewing secret key](../../../../aztec/concepts/accounts/keys.md#incoming-viewing-keys)) in order to decrypt the notes.

```rust title="balance_of_private" showLineNumbers 
#[utility]
pub(crate) unconstrained fn balance_of_private(owner: AztecAddress) -> u128 {
    storage.balances.at(owner).balance_of()
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L720-L725" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L720-L725</a></sub></sup>


## Compiling

Now that the contract is complete, you can compile it with `aztec-nargo`. See the [Sandbox reference page](../../../reference/environment_reference/index.md) for instructions on setting it up.

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

The [token bridge tutorial](../js_tutorials/token_bridge) is a great follow up to this one.

It builds on the Token contract described here and goes into more detail about Aztec contract composability and Ethereum (L1) and Aztec (L2) cross-chain messaging.

### Optional: Dive deeper into this contract and concepts mentioned here

- Review [the end to end tests (Github link)](https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/yarn-project/end-to-end/src/e2e_token_contract/) for reference.
- [Commitments (Wikipedia link)](https://en.wikipedia.org/wiki/Commitment_scheme)
- [Nullifier tree](../../../../aztec/concepts/advanced/storage/indexed_merkle_tree.mdx)
- [Public / Private function calls](../../../../aztec/smart_contracts/functions/public_private_calls.md).
- [Contract Storage](../../../../aztec/concepts/storage/index.md)
- [Authwit](../../../../aztec/concepts/advanced/authwit.md)
