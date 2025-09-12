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

#include_code withdraw noir-projects/noir-contracts/contracts/app/escrow_contract/src/main.nr rust

## Public Functions

A public function is executed by the sequencer and has access to a state model that is very similar to that of the EVM and Ethereum. Even though they work in an EVM-like model for public transactions, they are able to write data into private storage that can be consumed later by a private function.

Read more about the concept of public functions [here](../../../aztec/smart_contracts/functions/attributes.md#public-functions).

Declare a public function in your contract using the `#[public]` function annotation.

#include_code mint noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr rust

## Utility Functions

Contract functions marked with `#[utility]` are used to perform state queries from an offchain client (from both private and public state!) or to modify local contract-related PXE state (e.g. when processing logs in Aztec.nr), and are never included in any transaction. No guarantees are made on the correctness of the result since the entire execution is unconstrained and heavily reliant on [oracle calls](https://noir-lang.org/docs/explainers/explainer-oracle). Read more about the concept of utility functions [here](../../../aztec/smart_contracts/functions/attributes.md#utility-functions).

#include_code get_private_nfts noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr rust

## View Functions

The #[view] attribute can be applied to a #[private] or a #[public] function and it guarantees that the function cannot modify any contract state (just like view functions in Solidity). This allows you to read private or public state by calling the function from another contract.

For examples, to get the admin address from the NFT contract, you can use the `get_admin` function:

#include_code admin noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr rust

## Internal Functions

Internal functions are functions that are only callable within the same contract. They are not visible to other contracts and cannot be called from outside the contract.

Mark an internal function with the `#[internal]` attribute.

#include_code add_to_tally_public noir-projects/noir-contracts/contracts/app/private_voting_contract/src/main.nr rust

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

#include_code constructor /noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr rust

Here, the initializer is writing to storage. It can also call another function. Learn more about calling functions from functions [here](./call_contracts.md).

### Multiple initializers

You can set multiple functions as an initializer function simply by annotating each of them with `#[initializer]`. You can then decide which one to call when you are deploying the contract.

Calling any one of the functions annotated with `#[initializer]` will mark the contract as initialized.

To see an initializer in action, follow the [Counter codealong tutorial](../../tutorials/contract_tutorials/counter_contract.md).

## Contract Library Methods

Contract library methods are functions that are used to implement the logic of a contract and reduce code duplication. When called by another function, they are inlined into the calling function. They are not visible to the outside world and are only callable within the same contract.

For example, the `subtract_balance` function in the simple token contract:

#include_code subtract_balance noir-projects/noir-contracts/contracts/app/simple_token_contract/src/main.nr rust
