---
title: How to Define Functions
sidebar_position: 1
tags: [functions, smart-contracts]
description: Define different types of functions in your Aztec contracts for private, public, and utility execution.
---

## Overview

This guide shows you how to define different types of functions in your Aztec contracts, each serving specific purposes and execution environments.

## Quick reference

| Annotation               | Execution         | State access                                                 |
| ------------------------ | ----------------- | ------------------------------------------------------------ |
| `#[external("private")]` | User device       | Private state (and selected public values via storage types) |
| `#[external("public")]`  | Sequencer         | Public state                                                 |
| `#[external("utility")]` | Offchain client   | Public + private (unconstrained)                             |
| `#[internal("private")]` | N/A               | Inlined private helper (non-entrypoint)                      |
| `#[internal("public")]`  | N/A               | Inlined public helper (non-entrypoint)                       |
| `#[view]`                | Private or public | Read-only (no state mutation)                                |
| `#[only_self]`           | Private or public | Callable only by the same contract                           |
| `#[initializer]`         | Private or public | One-time initialization                                      |

## Prerequisites

- An Aztec contract project set up with the `aztec-nr` dependency
- Basic understanding of [Noir programming language](https://noir-lang.org/docs)
- Familiarity with Aztec Protocol's [call types](../../../foundational-topics/call_types.md) (private vs public)

## Define private functions

Use `#[external("private")]` to create functions that execute privately on user devices. For example:

#include_code increment /docs/examples/contracts/counter_contract/src/main.nr rust

Private functions run in a private context, can access private state, and can read certain public values through storage types like [`DelayedPublicMutable`](../how_to_define_storage.md#delayedpublicmutable).

## Define public functions

Use `#[external("public")]` to create functions that execute on the sequencer:

#include_code mint_public /docs/examples/contracts/bob_token_contract/src/main.nr rust

Public functions operate on public state, similar to EVM contracts. They can write to private storage, but any data written from a public function is publicly visible.

## Define utility functions

Create offchain query functions using the `#[external("utility")]` annotation with `unconstrained`.

Utility functions are standalone unconstrained functions that cannot be called from private or public functions. They are meant to be called by _applications_ to perform auxiliary tasks like querying contract state or processing offchain messages. Example:

#include_code get_counter /docs/examples/contracts/counter_contract/src/main.nr rust

Use `aztec.js` `simulate` to execute utility functions and read their return values. For details, see [Call Types](../../../foundational-topics/call_types.md#simulate).

## Define view functions

Create read-only functions using the `#[view]` annotation combined with `#[external("private")]` or `#[external("public")]`:

```rust
#[external("public")]
#[view]
fn get_config_value() -> Field {
    // logic
}
```

View functions cannot modify contract state. They're akin to Ethereum's `view` functions.
`#[view]` only applies to `#[external("private")]` and `#[external("public")]` functions.

## Define only-self functions

Create contract-only functions using the `#[only_self]` annotation:

#include_code _assert_is_owner /docs/examples/contracts/bob_token_contract/src/main.nr rust

Only-self functions are only callable by the same contract, which is useful when a private function enqueues a public call that should only be callable internally.

## Define initializer functions

Create constructor-like functions using the `#[initializer]` annotation:

#include_code constructor /docs/examples/contracts/counter_contract/src/main.nr rust

### Use multiple initializers

Define multiple initialization options:

1. Mark each function with `#[initializer]`
2. Choose which one to call during deployment
3. Any initializer marks the contract as initialized

## Define internal functions

Create helper functions using `#[internal("private")]` or `#[internal("public")]`. Internal functions are inlined at call sites and do not create separate entrypoints:

```rust
#[internal("private")]
fn _prepare_transfer(to: AztecAddress, amount: u128) -> Field {
    // helper logic for private functions
}

#[internal("public")]
fn _update_balance(owner: AztecAddress, amount: u128) {
    // helper logic for public functions
}
```

Call internal functions via `self.internal`:

```rust
let result = self.internal._prepare_transfer(recipient, amount);
```

Key constraints:

- Private internal functions can only be called from private external or internal functions
- Public internal functions can only be called from public external or internal functions

## Next steps

- [Attributes and Macros](./attributes.md)
- [Call Types](../../../foundational-topics/call_types.md)
