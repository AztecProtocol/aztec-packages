---
title: "The Aztec Stack"
sidebar_position: 0
---

This page covers all the tools for developing on Aztec. For a higher level summary, check out the [Aztec overview](../../index.mdx).

<img src="/img/aztec_tech_stack.png" />

## Sandbox

| Component | Description | Key Commands | Notes |
|:----------|:------------|:-------------|:------|
| Sandbox | Emulated Aztec Network | | Requires Docker. A local Aztec node and bundle of CLI tools: aztec, aztec-nargo, aztec-up, aztec-wallet |
| aztec | CLI to interact with Aztec Node | `aztec start --sandbox`<br/>`aztec start --node [options]`<br/>`aztec test`<br/>`aztec update`<br/>`aztec codegen`<br/>`aztec send/call/deploy/add-contract` | Similar to Ethereum's Geth |
| aztec-nargo | CLI for compiling Noir contracts | `aztec-nargo compile` | |
| aztec-up | CLI to install and update sandbox and its components | `aztec-up 0.86.0` | |
| Anvil | Emulated Ethereum Node | | Externally created & maintained, part of Sandbox |
| Private Execution Environment (PXE) | A package that runs locally, simulates private transactions, and generates proofs. It can be run as part of the sandbox or independently (recommended)| | There can be multiple PXE implementations, it is not enshrined in the Aztec protocol |

## Tooling

| Component | Description | Notes |
|:----------|:------------|:------|
| Noir LSP | VSCode language server | Plugs into aztec-nargo / nargo. Provides syntax highlighting, go-to-definition, compiler warnings, debugging, testing |

## Smart Contracts

| Component | Description | Usage | Notes |
|:----------|:------------|:------|:------|
| Aztec.nr | Smart contract writing framework | | Similar to Solidity |
| Tx Profiling Tool | Measures gate counts of transactions | `aztec-wallet simulate --profile` | Part of `aztec-wallet` |
| Flamegraph Tool | Visualizes gate counts of Noir circuits | `aztec flamegraph` | Part of `aztec` command |
| Codegen Tool | Generates TypeScript wrappers for Aztec.nr contracts | `aztec codegen` | Part of `aztec` command |
| TXE | Fast emulated PXE for testing | `aztec test` | Faster than PXE, similar to Foundry |

## Interacting with the network

| Component | Description | Usage | Notes |
|:----------|:------------|:------|:------|
| aztec-wallet | Wallet management tool | `aztec-wallet import-test-accounts`<br/>`aztec-wallet create-account`<br/>`aztec-wallet deploy`<br/>`aztec-wallet send`<br/>`aztec-wallet simulate`<br/>`aztec-wallet simulate --profile` | |
| @aztec/aztec.js | JS library for managing accounts and contracts | | Updated via npm/yarn |

## Noir

Aztec.nr is a library on top of Noir, a universal ZK programming language. You can use Noir to write smart contracts on Aztec, or circuits that can be verified onchain. If you are using Aztec.nr, it is not likely that you will use these tools.

| Component | Description | Usage example | Notes |
|:----------|:------------|:-------------|:------|
| nargo | CLI to compile non-Aztec Noir programs | | Incompatible with Aztec - use aztec-nargo instead |
| noirup | Noir version manager | | |
| NoirJS | TypeScript wrapper for Noir programs | | Often used for vanilla Noir programs |
| bb | CLI for interacting with a barretenberg binary | | Primarily used to measure gate counts |
| bbup | CLI installer for Barretenberg (bb) | `bbup -v 0.56.0`<br/>`bbup -nv 0.34.0` | For installing specific versions |
