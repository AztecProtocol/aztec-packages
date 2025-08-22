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
- contract library methods
- initializer functions

## Examples

### Private Functions

Private functions execute client-side on user devices to maintain private of user inputs and execution. Specify a private function in your contract using the `#[private]` function annotation.

#include_code withdraw noir-projects/noir-contracts/contracts/app/escrow_contract/src/main.nr rust

### Public Functions

<!-- TODO: flesh out with info about all types -->

### Initializer Functions

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

## Multiple initializers

You can set multiple functions as an initializer function simply by annotating each of them with `#[initializer]`. You can then decide which one to call when you are deploying the contract.

Calling any one of the functions annotated with `#[initializer]` will mark the contract as initialized.

To see an initializer in action, follow the [Counter codealong tutorial](../../tutorials/codealong/contract_tutorials/counter_contract.md).


## Further Reading
