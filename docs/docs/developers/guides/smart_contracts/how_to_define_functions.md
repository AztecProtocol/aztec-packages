---
title: Defining Contract Functions
sidebar_position: 3
tags: [functions, smart-contracts]
description: Define different types of functions in your Aztec smart contracts for various execution environments.
---

This guide shows you how to define different types of functions in your Aztec contracts, each serving specific purposes and execution environments.

## Prerequisites

- An Aztec contract project set up with `aztec-nr` dependency
- Basic understanding of Noir programming language
- Familiarity with Aztec's execution model (private vs public)

## Define private functions

Create functions that execute privately on user devices using the `#[private]` annotation. For example:

```rust
#[private]
fn execute_private_action(param1: AztecAddress, param2: u128) {
    // logic
}
```

Private functions maintain privacy of user inputs and execution logic. Private functions only have access to private state.

## Define public functions

Create functions that execute on the sequencer using the `#[public]` annotation:

```rust
#[public]
fn create_item(recipient: AztecAddress, item_id: Field) {
    // logic
}
```

Public functions can access public state, similar to EVM contracts. Public functions do not have direct access to private state.

## Define utility functions

Create offchain query functions using the `#[utility]` annotation.

Utility functions are standalone unconstrained functions that cannot be called from private or public functions: they are meant to be called by _applications_ to perform auxiliary tasks: query contract state (e.g. a token balance), process messages received offchain, etc. Example:

```rust
#[utility]
unconstrained fn get_private_items(
    owner: AztecAddress,
    page_index: u32,
) -> ([Field; MAX_NOTES_PER_PAGE], bool) {
    // logic
}
```

## Define view functions

Create read-only functions using the `#[view]` annotation combined with `#[private]` or `#[public]`:

```rust
#[public]
#[view]
fn get_config_value() -> Field {
    // logic
}
```

View functions cannot modify contract state. They're akin to Ethereum's `view` functions.

## Define internal functions

Create contract-only functions using the `#[internal]` annotation:

```rust
#[public]
#[internal]
fn update_counter_public(item: Field) {
    // logic
}
```

Internal functions are only callable within the same contract.

## Define initializer functions

Create constructor-like functions using the `#[initializer]` annotation:

```rust
#[private]
#[initializer]
fn constructor() {
    // logic
}
```

### Use multiple initializers

Define multiple initialization options:

1. Mark each function with `#[initializer]`
2. Choose which one to call during deployment
3. Any initializer marks the contract as initialized

## Create library methods

Define reusable contract logic as regular functions (no special annotation needed):

```rust
#[contract_library_method]
fn process_value(
    context: &mut PrivateContext,
    storage: Storage<&mut PrivateContext>,
    account: AztecAddress,
    value: u128,
    max_items: u32,
) -> u128 {
    // logic
}
```

Library methods are inlined when called and reduce code duplication.
