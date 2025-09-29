---
title: Project Structure
tags: [contracts]
sidebar_position: 0
description: Learn how to set up and structure your project for Aztec smart contracts.
---

This guide explains how to set up and structure your project for Aztec smart contracts.

## Before you start

You should have installed the sandbox, which includes local development tools, as described in [the getting started guide](../../../getting_started_on_sandbox.md).

## Setup

To create a new project, run the following command:

```bash
aztec-nargo new new_project --contract
```

This will create a new project with a `Nargo.toml` file and a `src` directory with a `main.nr` file where your contract will be written.

## Dependencies

Define Aztec.nr as a dependency in your `Nargo.toml` file. Aztec.nr is a package that contains the core functionality for writing Aztec smart contracts.

```toml
[dependencies]
aztec = { git = "https://github.com/AztecProtocol/aztec-packages", tag = "v2.0.2", directory = "noir-projects/aztec-nr/aztec" }
```

## Writing a contract

To write a contract:

1. Import aztec.nr into your contract in the `src/main.nr` file and declare your contract

```rust
use dep::aztec::macros::aztec;

#[aztec]
pub contract Counter {
```

2. Define imports in your contract block

For example, these are the imports for the example counter contract:

```rust title="imports" showLineNumbers 
use aztec::{
    macros::{functions::{initializer, private, public, utility}, storage::storage},
    oracle::debug_log::debug_log_format,
    protocol_types::{address::AztecAddress, traits::ToField},
    state_vars::Map,
};
use easy_private_state::EasyPrivateUint;
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/test/counter_contract/src/main.nr#L7-L15" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/test/counter_contract/src/main.nr#L7-L15</a></sub></sup>


3. Declare your contract storage below your imports

```rust title="storage_struct" showLineNumbers 
#[storage]
struct Storage<Context> {
    counters: Map<AztecAddress, EasyPrivateUint<Context>, Context>,
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/test/counter_contract/src/main.nr#L17-L22" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/test/counter_contract/src/main.nr#L17-L22</a></sub></sup>


4. Declare a constructor with `#[initializer]`. Constructors can be private or public functions.

```rust title="constructor" showLineNumbers 
#[initializer]
#[private]
// We can name our initializer anything we want as long as it's marked as aztec(initializer)
fn initialize(headstart: u64, owner: AztecAddress) {
    let counters = storage.counters;
    counters.at(owner).add(headstart, owner);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/test/counter_contract/src/main.nr#L24-L32" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/test/counter_contract/src/main.nr#L24-L32</a></sub></sup>


5. Declare your contract functions

```rust title="increment" showLineNumbers 
#[private]
fn increment(owner: AztecAddress) {
    debug_log_format("Incrementing counter for owner {0}", [owner.to_field()]);

    Counter::at(context.this_address()).emit_in_public(12345).enqueue(&mut context);

    let counters = storage.counters;
    counters.at(owner).add(1, owner);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/test/counter_contract/src/main.nr#L34-L44" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/test/counter_contract/src/main.nr#L34-L44</a></sub></sup>


There is a lot more detail and nuance to writing contracts, but this should give you a good starting point.
Read contents of this section for more details about authorizing contract to act on your behalf (authenticaion witnesses),
emitting events, calling functions on other contracts and other common patterns.
