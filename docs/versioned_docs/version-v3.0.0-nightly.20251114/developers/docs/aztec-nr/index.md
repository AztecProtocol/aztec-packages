---
title: Developing Smart Contracts
sidebar_position: 0
tags: [aztec.nr, smart contracts]
description: Comprehensive guide to writing smart contracts for the Aztec network using Noir.
---

import DocCardList from "@theme/DocCardList";

Aztec.nr is the smart contract development framework for Aztec. It is a set of utilities that
help you write Noir programs to deploy on the Aztec network.

## Contract Development

### Prerequisites

- Install [Aztec Local Network and Tooling](../../getting_started_on_local_network.md)
- Install the [Noir LSP](../aztec-nr/installation.md) for your editor.

### Flow

1. Write your contract and specify your contract dependencies. Every contract written for Aztec will have
   aztec-nr as a dependency. Add it to your `Nargo.toml` with

```toml
# Nargo.toml
[dependencies]
aztec = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v3.0.0-nightly.20251114", directory="noir-projects/smart-contracts/aztec" }
```

Update your `main.nr` contract file to use the Aztec.nr macros for writing contracts.

```rust title="setup" showLineNumbers 
use dep::aztec::macros::aztec;

#[aztec]
pub contract Counter {
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-nightly.20251114/docs/examples/contracts/counter_contract/src/main.nr#L1-L6" target="_blank" rel="noopener noreferrer">Source code: docs/examples/contracts/counter_contract/src/main.nr#L1-L6</a></sub></sup>


and import dependencies from the Aztec.nr library.

```rust title="imports" showLineNumbers 
use aztec::{
    macros::{functions::{external, initializer}, storage::storage},
    oracle::debug_log::debug_log_format, protocol_types::{address::AztecAddress, traits::ToField},
    state_vars::Map,
};
use easy_private_state::EasyPrivateUint;
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-nightly.20251114/docs/examples/contracts/counter_contract/src/main.nr#L7-L14" target="_blank" rel="noopener noreferrer">Source code: docs/examples/contracts/counter_contract/src/main.nr#L7-L14</a></sub></sup>


:::info

You can see a complete example of a simple counter contract written with Aztec.nr [here](https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-nightly.20251114/docs/examples/contracts/counter_contract/src/main.nr).

:::

2. [Profile](./framework-description/advanced/how_to_profile_transactions.md) the private functions in your contract to get
   a sense of how long generating client side proofs will take
3. Write unit tests [directly in Noir](how_to_test_contracts.md) and end-to-end
   tests [with TypeScript](../aztec-js/how_to_test.md)
4. [Compile](how_to_compile_contract.md) your contract
5. [Deploy](../aztec-js/how_to_deploy_contract.md) your contract with Aztec.js

## Section Contents

<DocCardList />
