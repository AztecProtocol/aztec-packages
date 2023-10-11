---
title: Setup & Installation
---

This tutorial builds on top of the project created in the previous tutorial. It can exist on its own, but for our sake it is much easier to utilize the existing L1 contracts that we already have in place.

If you don’t have this, you can find the code for it [here].
// TODO full code in dev-rels rouper

# L1 contracts

We will need one more L1 contract - _ISwapRouter_ - which you can find [here](https://github.com/AztecProtocol/aztec-packages/blob/c794533754a9706d362d0374209df9eb5b6bfdc7/l1-contracts/test/external/ISwapRouter.sol). Add this to `l1-contracts/external`:

```bash
cd l1-contracts && mkdir external && touch ISwapRouter.sol
```

Inside `ISwapRouter.sol` paste this:

"#include_code iswaprouter l1-contracts/test/external/ISwapRouter.sol solidity

This is an interface for the Uniswap V3 Router, providing token swapping functionality. The contract defines methods for token swaps, both between two tokens or via a multi-hop path. Our portal will interact with the Uniswap V3 Router via this interface to perform token swaps on L1. We’ll see more about this in the next step.

# Create nargo project

In `aztec-packages` create a new nargo project.

```bash
cd aztec-packages && nargo new --contract uniswap
```

Now your `aztec-contracts` will look like this:

```bash
aztec-contracts
└── token_bridge
    ├── Nargo.toml
    ├── src
      ├── main.nr
└── uniswap
    ├── Nargo.toml
    ├── src
      ├── main.nr
```

Inside the new `Nargo.toml` paste this in `[dependencies]`:

```json
[dependencies]
aztec = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="yarn-project/aztec-nr/aztec" }
value_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="yarn-project/aztec-nr/value-note"}
safe_math = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="yarn-project/aztec-nr/safe-math"}
```

# L2 contracts

The `main.nr` will utilize a few helper functions that are outside the scope of this tutorial. Inside `uniswap/src` create two new files:

```bash
cd uniswap/src && touch util.nr && touch interface.nr
```

Inside `util.nr` paste this:

#include_code uniswap_util
yarn-project/noir-contracts/src/contracts/uniswap_contract/src/util.nr rust

This file contains two functions, `compute_swap_private_content_hash` and `compute_swap_public_content_hash`, which generate content hashes for L2 to L1 messages representing swap transactions.

and inside `interface.nr` paste this:

#include_code interfaces yarn-project/noir-contracts/src/contracts/uniswap_contract/src/interfaces.nr rust

This defines two structs: `Token` and `TokenBridge.`

- `Token` represents an Aztec token, allowing for public transfers (`transfer_public`) and private-to-public conversions (`unshield`).
- The `TokenBridge` struct facilitates interactions with our bridge contract, enabling getting the associated token (`token`), claiming tokens in a public context (`claim_public`), and exiting tokens to L1. (`exit_to_l1_public`).

# Run Aztec sandbox

You will need a running sandbox.

```bash
/bin/bash -c "$(curl -fsSL 'https://sandbox.aztec.network')"
```
