---
title: Setup & Installation
---

This tutorial builds on top of the project created in the previous tutorial. It can exist on its own, but for our sake it is much easier to utilize the existing L1 contracts that we already have in place.

If you don’t have this, you can find the code for it [here].
// TODO full code in dev-rels rouper

# Uniswap contract
To interact with uniswap we need to add it's interface:

```bash
cd packages/l1-contracts && mkdir external && touch ISwapRouter.sol
```

Inside `ISwapRouter.sol` paste this:

#include_code iswaprouter /l1-contracts/test/external/ISwapRouter.sol solidity

This is an interface for the Uniswap V3 Router, providing token swapping functionality. The contract defines methods for token swaps, both between two tokens or via a multi-hop path. Our portal will interact with the Uniswap V3 Router via this interface to perform token swaps on L1. We’ll see more about this in the next step.

# Create another nargo project

In `aztec-packages` create a new nargo project.

```bash
cd packages/aztec-packages && nargo new --contract uniswap
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

Inside `uniswap/Nargo.toml` paste this in `[dependencies]`:

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

Inside `interface.nr` paste this:

#include_code interfaces yarn-project/noir-contracts/src/contracts/uniswap_contract/src/interfaces.nr rust

This creates interfaces for the `Token` contract and `TokenBridge` contract

- `Token` is a reference implementation for a token on Aztec. Here we just need two methods - [`transfer_public`](../writing_token_contract.md#transfer_public) and [`unshield()`](../writing_token_contract.md#unshield).
- The `TokenBridge` facilitates interactions with our [bridge contract](../token_portal/main.md). Here we just need its [`exit_to_l1_public`](../token_portal/withdrawing_to_l1.md)

# Run Aztec sandbox

You will need a running sandbox.

```bash
/bin/bash -c "$(curl -fsSL 'https://sandbox.aztec.network')"
```

Next we will write the L1 Uniswap Portal 