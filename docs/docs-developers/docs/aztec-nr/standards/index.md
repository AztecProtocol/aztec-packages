---
title: Aztec Contract Standards
sidebar_position: 0
description: Overview of Aztec Improvement Proposal (AIP) contract standards maintained by DeFi Wonderland.
---

Aztec contract standards define shared interfaces and behaviors for common onchain primitives. They serve the same role that ERC standards play on Ethereum: establishing conventions that allow contracts, wallets, and tooling to interoperate without prior coordination.

The standards described in this section are maintained by [DeFi Wonderland](https://github.com/defi-wonderland/aztec-standards) in the `aztec-standards` repository. Each standard is identified by an **Aztec Improvement Proposal (AIP)** number that mirrors its Ethereum counterpart where applicable (AIP-20 corresponds to ERC-20, AIP-721 to ERC-721, AIP-4626 to ERC-4626).

Because Aztec contracts have both private and public execution contexts, the standards are more involved than their Ethereum equivalents. Transfers can move value between private notes and public balances, and many operations require coordination between encrypted state and transparent state within a single transaction.

:::note
The code examples in this section are taken from the [aztec-standards repository](https://github.com/defi-wonderland/aztec-standards) maintained by DeFi Wonderland. They will differ from the reference contract implementations shipped in the [aztec-packages repo](https://github.com/AztecProtocol/aztec-packages) under `noir-projects/labs/noir-contracts/contracts/`. When in doubt, consult the aztec-standards github repo for the canonical standard interfaces.
:::

## Standards

- [AIP-20: Fungible Token](./aip-20.md) — private and public balances, partial-note transfers, recursive note consumption
- [AIP-721: Non-Fungible Token](./aip-721.md) — private NFT ownership, partial-note support, commitment-based transfers
- [AIP-4626: Tokenized Vault](./aip-4626.md) — yield-bearing vaults with share conversion across private and public contexts
- [Escrow](./escrow.md) — minimal token/NFT custody with salt-based authorization
- [Generic Proxy](./generic-proxy.md) — forwarding layer for account abstraction patterns
- [Dripper](./dripper.md) — development faucet for testing

## Related tutorials

- [Private Token Contract](../../tutorials/contract_tutorials/token_contract.md) — build a privacy-preserving fungible token that closely parallels AIP-20
- [NFT Bridge](../../tutorials/js_tutorials/token_bridge.md) — build a private NFT with custom `NFTNote` and `PrivateSet`, covering patterns extended by AIP-721
- [Deploying a Token Contract](../../tutorials/js_tutorials/aztecjs-getting-started.md) — deploy and interact with the reference token contract using Aztec.js
- [Counter Contract](../../tutorials/contract_tutorials/counter_contract.md) — introduces private state, notes, and balance management

For the canonical implementations and latest interface specifications, refer to the [aztec-standards repository](https://github.com/defi-wonderland/aztec-standards) maintained by DeFi Wonderland.
