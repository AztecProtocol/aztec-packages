---
title: "Building a Webapp on Aztec"
sidebar_position: 0
description: "Build a Pod Racing game webapp with Vite, React, and Aztec — featuring private state, wallet connections, and zero-knowledge proofs."
---

# Building a Webapp on Aztec

In this tutorial you'll build a **Pod Racing** game webapp — a fully functional application where players privately allocate points across racing tracks, with their strategies hidden from opponents using Aztec's privacy features.

## What you'll build

A two-player competitive game where:
- Each player distributes up to 9 points across 5 racing tracks per round (3 rounds total)
- Point allocations are **private** — stored as encrypted notes only you can read
- After all rounds, players reveal their totals and a winner is determined (best of 5 tracks)
- The app connects to a local Aztec sandbox or devnet via browser extension wallet

### How the game works

Each round, you distribute up to 9 points across 5 tracks (think of each track as an independent race). After 3 rounds, each player's per-track totals are compared: whoever allocated more points to a track wins that track. The overall winner is the player who wins the majority of the 5 tracks (best of 5).

### Why privacy matters

Without privacy, your opponent could see your point allocations as you play and adjust their strategy to counter yours. Aztec keeps each player's allocations encrypted as private notes — your opponent only learns that you submitted a round, not how you distributed your points. Strategies are revealed only after both players finish, making the game fair.

## What you'll learn

- Setting up a Vite + React project that runs Aztec's WASM modules in-browser
- Connecting to Aztec via an **embedded wallet** (local dev) or the **wallet SDK** (devnet)
- Compiling and deploying a Noir smart contract from JavaScript
- Sending **private transactions** and reading **private state**
- Paying transaction fees with the **SponsoredFPC** contract

## Prerequisites

- [Node.js](https://nodejs.org/) v22 or later
- The [Aztec CLI](../../getting_started/quickstart.md) installed (`aztec` command available)
- A local Aztec network running (`aztec start --sandbox`), **or** access to the Aztec devnet
- Basic familiarity with React and TypeScript

## Architecture

```
┌─────────────────────────────────────────────┐
│                Browser                       │
│                                              │
│  ┌──────────┐   ┌──────┐   ┌─────────────┐ │
│  │ React UI │──▸│Wallet│──▸│ PXE (WASM)  │ │
│  └──────────┘   └──────┘   └──────┬──────┘ │
│                                    │        │
└────────────────────────────────────┼────────┘
                                     │
                              ┌──────▼──────┐
                              │ Aztec Node  │
                              │ (local or   │
                              │  devnet)    │
                              └─────────────┘
```

**PXE** (Private eXecution Environment) runs in the browser as WASM. It handles private state, note discovery, and proof generation — your secrets never leave the browser.

## Tutorial sections

1. [Project Setup](./01-project-setup.md) — scaffolding, Vite config, contract compilation
2. [Network & Wallet](./02-network-and-wallet.md) — connecting to Aztec, embedded wallet, wallet SDK
3. [Contract Interaction](./03-contract-interaction.md) — deploying and calling contracts
4. [Private State & Gameplay](./04-private-state-and-gameplay.md) — privacy, game rounds, reading notes
5. [Transactions & Fees](./05-transactions-and-fees.md) — tx lifecycle, SponsoredFPC
6. [Putting It Together](./06-putting-it-together.md) — full App component, running the app

## Completed example

The full working example including the contract source is available at [`docs/examples/webapp-tutorial/`](https://github.com/AztecProtocol/aztec-packages/tree/master/docs/examples/webapp-tutorial).

The example also includes a **test wallet extension** (`test-extension/`) for testing the wallet SDK connection flow without needing a real wallet. See the [Network & Wallet](./02-network-and-wallet.md#testing-with-the-test-wallet-extension) section for setup instructions.
