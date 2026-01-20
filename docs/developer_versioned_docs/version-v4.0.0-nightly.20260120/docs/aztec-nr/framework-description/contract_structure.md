---
title: Contract Structure
sidebar_position: 1
tags: [contracts]
description: Learn the fundamental structure of Aztec smart contracts including the contract keyword, directory layout, and how contracts manage state and functions.
---

A contract is a collection of persistent [state variables](./how_to_define_storage.md) and [functions](./functions/index.md) which may manipulate these variables. Functions and state variables within a contract's scope are said to belong to that contract.

A contract can only access and modify its own state. If a contract wishes to access or modify another contract's state, it must make a call to an external function of the other contract. For anything to happen on the Aztec network, an external function of a contract needs to be called.

## Contract

A contract is declared using the `#[aztec]` attribute and the `contract` keyword. By convention, contracts are named in `PascalCase`.

```rust title="setup" showLineNumbers 
use dep::aztec::macros::aztec;

#[aztec]
pub contract Counter {
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260120/docs/examples/contracts/counter_contract/src/main.nr#L1-L6" target="_blank" rel="noopener noreferrer">Source code: docs/examples/contracts/counter_contract/src/main.nr#L1-L6</a></sub></sup>


:::info A note for vanilla Noir devs
There is no [`main()`](https://noir-lang.org/docs/getting_started/project_breakdown/#mainnr) function within a Noir `contract` scope. More than one function can be an entrypoint.
:::

## Directory structure

Here's a common layout for a basic Aztec.nr Contract project:

```text title="layout of an aztec contract project"
─── my_aztec_contract_project
       ├── src
       │     └── main.nr       <-- your contract
       └── Nargo.toml          <-- package and dependency management
```

See the vanilla Noir docs for [more info on packages](https://noir-lang.org/docs/noir/modules_packages_crates/crates_and_packages).

## Next steps

- [Define functions](./functions/index.md) - Learn about private, public, and utility functions
- [Define storage](./how_to_define_storage.md) - Work with persistent state variables
- [Compile your contract](../how_to_compile_contract.md) - Build your contract artifact
