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

- Install [Aztec Sandbox and tooling](../../../getting_started_on_sandbox.md)
- Install the [Noir LSP](../local_env/installing_noir_lsp.md) for your editor.

### Flow

1. Write your contract and specify your contract dependencies. Every contract written for Aztec will have
   aztec-nr as a dependency. Add it to your `Nargo.toml` with

```toml
# Nargo.toml
[dependencies]
aztec = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v3.0.0-devnet.4", directory="noir-projects/smart-contracts/aztec" }
```

Update your `main.nr` contract file to use the Aztec.nr macros for writing contracts.

```rust
use dep::aztec::macros::aztec;

#[aztec]
pub contract Counter {
    // Your contract code here
}
```

and import dependencies from the Aztec.nr library.

```rust
use dep::aztec::macros::aztec;

#[aztec]
pub contract Counter {
    use aztec::{
        macros::{functions::{external, initializer}, storage::storage},
        oracle::debug_log::debug_log_format, protocol_types::{address::AztecAddress, traits::ToField},
        state_vars::Map,
    };

    // your contract code here
}
```

:::info

You can see a complete example of a simple counter contract written with Aztec.nr [here](https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-devnet.4/docs/examples/contracts/counter_contract/src/main.nr).

:::

2.  [Profile](./advanced/how_to_profile_transactions.md) the private functions in your contract to get
    a sense of how long generating client side proofs will take
3.  Write unit tests [directly in Noir](how_to_test_contracts.md) and end-to-end
    tests [with TypeScript](../aztec-js/how_to_test.md)
4.  [Compile](how_to_compile_contract.md) your contract
5.  [Deploy](../aztec-js/how_to_deploy_contract.md) your contract with Aztec.js

## Section Contents

<DocCardList />
