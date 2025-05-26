---
title: Aztec.nr
tags: [aztec.nr]
---

import DocCardList from "@theme/DocCardList";

Aztec.nr is the smart contract development framework for Aztec. It is a set of utilities that
help you write Noir programs to deploy on the Aztec network.

## Contract Development

### Prerequisites

- Install [Aztec Sandbox and tooling](../../getting_started.md)
- Install the [Noir LSP](../local_env/installing_noir_lsp.md) for your editor.

### Flow

1. Write your contract and specify your contract dependencies. Every contract written for Aztec will have
   aztec-nr as a dependency. Add it to your `Nargo.toml` with

```toml
# Nargo.toml
[dependencies]
aztec = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v0.88.0", directory="noir-projects/aztec-nr/aztec" }
```

2.  [Write your contracts](./writing_contracts/index.mdx).
3.  [Profile](./profiling_transactions.md) the private functions in your contract to get
    a sense of how long generating client side proofs will take
4.  Write unit tests [using the TXE](testing.md) and end-to-end
    tests [with typescript](../js_apps/test.md)
5.  [Compile](how_to_compile_contract.md) your contract
6.  [Deploy](../js_apps/deploy_contract.md) your contract with Aztec.js

## Section Contents

<DocCardList />
