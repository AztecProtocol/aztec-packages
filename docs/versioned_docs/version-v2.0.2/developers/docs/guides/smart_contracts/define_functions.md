---
title: Define Functions
sidebar_position: 4
tags: [functions, smart-contracts]
description: Learn how to define functions in your Aztec smart contracts.
---

There are several types of functions in Aztec contracts that correspond the the different execution environments in which they run. These include:

- private functions
- public functions
- utility functions
- view functions
- internal functions
- initializer functions
- contract library methods

## Private Functions

Private functions execute client-side on user devices to maintain private of user inputs and execution. Specify a private function in your contract using the `#[private]` function annotation.

```rust title="withdraw" showLineNumbers
// Withdraws balance. Requires that msg.sender is the owner.
#[private]
fn withdraw(token: AztecAddress, amount: u128, recipient: AztecAddress) {
    let sender = context.msg_sender();

    let note = storage.owner.get_note();
    assert(note.get_address() == sender);
    Token::at(token).transfer(recipient, amount).call(&mut context);
}
```

> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/escrow_contract/src/main.nr#L32-L44" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/escrow_contract/src/main.nr#L32-L44</a></sub></sup>

## Public Functions

A public function is executed by the sequencer and has access to a state model that is very similar to that of the EVM and Ethereum. Even though they work in an EVM-like model for public transactions, they are able to write data into private storage that can be consumed later by a private function.

Read more about the concept of public functions [here](../../concepts/smart_contracts/functions/attributes.md#public-functions).

Declare a public function in your contract using the `#[public]` function annotation.

```rust title="mint" showLineNumbers
#[public]
fn mint(to: AztecAddress, token_id: Field) {
    assert(token_id != 0, "zero token ID not supported");
    assert(storage.minters.at(context.msg_sender()).read(), "caller is not a minter");
    assert(storage.nft_exists.at(token_id).read() == false, "token already exists");

    storage.nft_exists.at(token_id).write(true);

    storage.public_owners.at(token_id).write(to);
}
```

> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L91-L102" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L91-L102</a></sub></sup>

## Utility Functions

Contract functions marked with `#[utility]` are used to perform state queries from an offchain client (from both private and public state!) or to modify local contract-related PXE state (e.g. when processing logs in Aztec.nr), and are never included in any transaction. No guarantees are made on the correctness of the result since the entire execution is unconstrained and heavily reliant on [oracle calls](https://noir-lang.org/docs/explainers/explainer-oracle). Read more about the concept of utility functions [here](../../concepts/smart_contracts/functions/attributes.md#utility-functions).

```rust title="get_private_nfts" showLineNumbers
#[utility]
unconstrained fn get_private_nfts(
    owner: AztecAddress,
    page_index: u32,
) -> ([Field; MAX_NOTES_PER_PAGE], bool) {
    let offset = page_index * MAX_NOTES_PER_PAGE;
    let mut options = NoteViewerOptions::new();
    let notes = storage.private_nfts.at(owner).view_notes(options.set_offset(offset));

    let mut owned_nft_ids = [0; MAX_NOTES_PER_PAGE];
    for i in 0..options.limit {
        if i < notes.len() {
            owned_nft_ids[i] = notes.get_unchecked(i).get_token_id();
        }
    }

    let page_limit_reached = notes.len() == options.limit;
    (owned_nft_ids, page_limit_reached)
}
```

> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L348-L368" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L348-L368</a></sub></sup>

## View Functions

The #[view] attribute can be applied to a #[private] or a #[public] function and it guarantees that the function cannot modify any contract state (just like view functions in Solidity). This allows you to read private or public state by calling the function from another contract.

For examples, to get the admin address from the NFT contract, you can use the `get_admin` function:

```rust title="admin" showLineNumbers
#[public]
#[view]
fn get_admin() -> Field {
    storage.admin.read().to_field()
}
```

> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L128-L134" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L128-L134</a></sub></sup>

## Internal Functions

Internal functions are functions that are only callable within the same contract. They are not visible to other contracts and cannot be called from outside the contract.

Mark an internal function with the `#[internal]` attribute.

```rust title="add_to_tally_public" showLineNumbers
#[public]
#[internal]
fn add_to_tally_public(candidate: Field) {
    assert(storage.vote_ended.read() == false, "Vote has ended"); // assert that vote has not ended
    let new_tally = storage.tally.at(candidate).read() + 1;
    storage.tally.at(candidate).write(new_tally);
}
```

> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/private_voting_contract/src/main.nr#L58-L66" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/private_voting_contract/src/main.nr#L58-L66</a></sub></sup>

## Initializer Functions

Initializers are regular functions that set an "initialized" flag (a nullifier) for the contract. A contract can only be initialized once, and contract functions can only be called after the contract has been initialized, much like a constructor. However, if a contract defines no initializers, it can be called at any time. Additionally, you can define as many initializer functions in a contract as you want, both private and public.

#### Annotate with `#[initializer]`

Define your initializer like so:

```rust
#[initializer]
fn constructor(){
    // function logic here
}
```

Aztec supports both public and private initializers. Use the appropriate macro, for example for a private initializer:

```rust
#[private]
#[initializer]
fn constructor(){
    // function logic here
}
```

Initializers are commonly used to set an admin, such as this example:

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

> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L82-L95" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L82-L95</a></sub></sup>

Here, the initializer is writing to storage. It can also call another function. Learn more about calling functions from functions [here](./call_contracts.md).

### Multiple initializers

You can set multiple functions as an initializer function simply by annotating each of them with `#[initializer]`. You can then decide which one to call when you are deploying the contract.

Calling any one of the functions annotated with `#[initializer]` will mark the contract as initialized.

To see an initializer in action, follow the [Counter codealong tutorial](../../tutorials/contract_tutorials/counter_contract.md).

## Contract Library Methods

Contract library methods are functions that are used to implement the logic of a contract and reduce code duplication. When called by another function, they are inlined into the calling function. They are not visible to the outside world and are only callable within the same contract.

For example, the `subtract_balance` function in the simple token contract:

```rust title="subtract_balance" showLineNumbers
#[contract_library_method]
fn subtract_balance(
    context: &mut PrivateContext,
    storage: Storage<&mut PrivateContext>,
    account: AztecAddress,
    amount: u128,
    max_notes: u32,
) -> u128 {
    let subtracted = storage.balances.at(account).try_sub(amount, max_notes);
    assert(subtracted > 0 as u128, "Balance too low");
    if subtracted >= amount {
        subtracted - amount
    } else {
        let remaining = amount - subtracted;
        compute_recurse_subtract_balance_call(*context, account, remaining).call(context)
    }
}
```

> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/simple_token_contract/src/main.nr#L324-L342" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/simple_token_contract/src/main.nr#L324-L342</a></sub></sup>
