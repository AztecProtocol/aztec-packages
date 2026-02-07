---
title: How to Define Functions
sidebar_position: 1
tags: [functions, smart-contracts]
description: Define different types of functions in your Aztec contracts for private, public, and utility execution.
references: ["docs/examples/contracts/bob_token_contract/src/main.nr", "docs/examples/contracts/counter_contract/src/main.nr"]
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

```rust title="increment" showLineNumbers 
#[external("private")]
fn increment(owner: AztecAddress) {
    debug_log_format("Incrementing counter for owner {0}", [owner.to_field()]);
    self.storage.counters.at(owner).add(1).deliver(MessageDelivery.ONCHAIN_CONSTRAINED);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260207/docs/examples/contracts/counter_contract/src/main.nr#L36-L42" target="_blank" rel="noopener noreferrer">Source code: docs/examples/contracts/counter_contract/src/main.nr#L36-L42</a></sub></sup>


Private functions run in a private context, can access private state, and can read certain public values through storage types like [`DelayedPublicMutable`](../state_variables.md#delayedpublicmutable).

## Define public functions

Use `#[external("public")]` to create functions that execute on the sequencer:

```rust title="mint_public" showLineNumbers 
#[external("public")]
fn mint_public(employee: AztecAddress, amount: u64) {
    // Only Giggle can mint tokens
    assert_eq(self.msg_sender(), self.storage.owner.read(), "Only Giggle can mint BOB tokens");

    // Add tokens to employee's public balance
    let current_balance = self.storage.public_balances.at(employee).read();
    self.storage.public_balances.at(employee).write(current_balance + amount);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260207/docs/examples/contracts/bob_token_contract/src/main.nr#L41-L51" target="_blank" rel="noopener noreferrer">Source code: docs/examples/contracts/bob_token_contract/src/main.nr#L41-L51</a></sub></sup>


Public functions operate on public state, similar to EVM contracts. They can write to private storage, but any data written from a public function is publicly visible.

## Define utility functions

Create offchain query functions using the `#[external("utility")]` annotation with `unconstrained`.

Utility functions are standalone unconstrained functions that cannot be called from private or public functions. They are meant to be called by _applications_ to perform auxiliary tasks like querying contract state or processing offchain messages. Example:

```rust title="get_counter" showLineNumbers 
#[external("utility")]
unconstrained fn get_counter(owner: AztecAddress) -> pub u128 {
    self.storage.counters.at(owner).balance_of()
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260207/docs/examples/contracts/counter_contract/src/main.nr#L44-L49" target="_blank" rel="noopener noreferrer">Source code: docs/examples/contracts/counter_contract/src/main.nr#L44-L49</a></sub></sup>


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

```rust title="_assert_is_owner" showLineNumbers 
#[external("public")]
#[only_self]
fn _assert_is_owner(address: AztecAddress) {
    assert_eq(address, self.storage.owner.read(), "Only Giggle can mint BOB tokens");
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260207/docs/examples/contracts/bob_token_contract/src/main.nr#L131-L137" target="_blank" rel="noopener noreferrer">Source code: docs/examples/contracts/bob_token_contract/src/main.nr#L131-L137</a></sub></sup>


Only-self functions are only callable by the same contract, which is useful when a private function enqueues a public call that should only be callable internally.

## Define initializer functions

Create constructor-like functions using the `#[initializer]` annotation:

```rust title="constructor" showLineNumbers 
#[initializer]
#[external("private")]
// We can name our initializer anything we want as long as it's marked as aztec(initializer)
fn initialize(headstart: u64, owner: AztecAddress) {
    self.storage.counters.at(owner).add(headstart as u128).deliver(
        MessageDelivery.ONCHAIN_CONSTRAINED,
    );
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260207/docs/examples/contracts/counter_contract/src/main.nr#L25-L34" target="_blank" rel="noopener noreferrer">Source code: docs/examples/contracts/counter_contract/src/main.nr#L25-L34</a></sub></sup>


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
