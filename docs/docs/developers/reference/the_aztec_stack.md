---
title: "The Aztec Stack"
sidebar_position: 1
---

This page covers all the tools for developing on Aztec. For a higher level summary, check out the [Aztec overview](../../index.mdx).

<img src="/img/aztec_tech_stack.png" />

## Network

| Component | Description | Key Commands | Dependencies | Notes |
|:----------|:------------|:-------------|:-------------|:------|
| Sandbox | Emulated Aztec Network | | Docker | Bundle of CLI tools: aztec, aztec-nargo, aztec-up, aztec-wallet |
| aztec | CLI to interact with Aztec Node | `aztec start --sandbox`<br/>`aztec start --node [options]`<br/>`aztec test`<br/>`aztec update`<br/>`aztec codegen`<br/>`aztec flamegraph`<br/>`aztec send/call/deploy/add-contract` | Varies based on commands | Similar to Ethereum's Geth |
| Anvil | Emulated Ethereum Node | | | Externally created & maintained, part of Sandbox |

## Tooling & Installation

| Component | Description | Usage | Notes |
|:----------|:------------|:------|:------|
| aztec-up | CLI to update the Sandbox | `aztec-up` | Updates Sandbox & aztec-nargo |
| aztec update | Update project's Aztec.nr packages | `aztec update` | Part of aztec CLI |
| Noir LSP | VSCode language server | aztec-nargo / nargo | Provides syntax highlighting, go-to-definition, compiler warnings, debugging, testing |

## Smart Contracts

| Component | Description | Usage | Dependencies | Notes |
|:----------|:------------|:------|:-------------|:------|
| Aztec.nr | Smart contract writing framework | | aztec-nargo, Noir LSP, Sandbox/TXE | Similar to Solidity or Anchor |
| aztec-nargo | CLI to compile Aztec Smart Contracts | `aztec-nargo compile` | | An Aztec-specific build of nargo, similar to solc |
| Tx Profiling Tool | Measures gate counts of transactions | `aztec-wallet simulate --profile` | aztec-wallet, aztec-nargo | Part of aztec-wallet |
| Flamegraph Tool | Visualizes gate counts of Noir circuits | `aztec flamegraph` | | Part of aztec command |
| Codegen Tool | Generates TypeScript wrappers for Aztec.nr contracts | `aztec codegen` | | Part of aztec command |
| TXE | Fast emulated Aztec Network for testing | `aztec test` | | Faster than Sandbox, similar to Foundry |

## Interacting with the network

| Component | Description | Usage | Dependencies | Notes |
|:----------|:------------|:-------------|:------|:------|
| aztec-wallet | Wallet management tool | `aztec-wallet import-test-accounts`<br/>`aztec-wallet create-account`<br/>`aztec-wallet deploy`<br/>`aztec-wallet send`<br/>`aztec-wallet simulate`<br/>`aztec-wallet simulate --profile` | Sandbox or Full Node | Contains Tx Profiling Tool |
| @aztec/aztec.js | JS library for managing accounts and contracts || PXE, Aztec Node | Updated via npm/yarn |
| NoirJS | TypeScript wrapper for Noir programs | || Often used for vanilla Noir programs |

## Proving

These tools are abstracted and it is not likely that you will use them when building on Aztec.

| Component | Description | Usage | Notes |
|:----------|:------------|:------|:------|
| bb | CLI for interacting with a barretenberg binary | See [subcommands](https://github.com/AztecProtocol/aztec-packages/blob/master/barretenberg/cpp/src/barretenberg/bb/main.cpp) | Primarily used to measure gate counts |

## Noir

Aztec.nr is a library on top of Noir, a universal ZK programming language. You can use Noir to write smart contracts on Aztec, or circuits that can be verified onchain. If you are using Aztec.nr, it is not likely that you will use these tools.

| Component | Description | Dependencies | Notes |
|:----------|:------------|:-------------|:------|
| nargo | CLI to compile non-Aztec Noir programs | | Incompatible with Aztec - use aztec-nargo instead |
| noirup | Noir version manager | | |
| NoirJS | TypeScript wrapper for Noir programs | | Often used for vanilla Noir programs |
| bbup | CLI installer for Barretenberg (bb) | `bbup -v 0.56.0`<br/>`bbup -nv 0.34.0` | For installing specific versions |
