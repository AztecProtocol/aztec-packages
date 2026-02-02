---
title: "3. Contract Interaction"
sidebar_position: 3
description: "Deploy and call the Pod Racing smart contract from your webapp"
---

# Contract Interaction

Now that you have a wallet, you can deploy the Pod Racing contract and interact with it.

## Contract helpers

Before your PXE can interact with a contract, it needs two pieces of information: the **artifact** (the compiled contract bytecode and ABI) and the **instance** (the deployed address and constructor parameters). Without these, PXE cannot construct proofs or route transactions to the correct contract.

Create `src/contract.ts` with functions for deploying, attaching to, and calling the contract:

### Deploying a new contract

#include_code deploy-contract /docs/examples/webapp-tutorial/src/contract.ts typescript

`PodRacingContract.deploy()` constructs a deployment request and `.send()` submits it to the network, waits for it to be mined, and returns a typed contract instance you can call methods on. The deploy flow handles artifact registration with PXE internally.

### Attaching to an existing contract

When joining someone else's game, you didn't deploy the contract, so your PXE doesn't know about it. You need to reconstruct the contract instance from known parameters (artifact, deployer address, salt, constructor args) and register it with your PXE.

#include_code attach-contract /docs/examples/webapp-tutorial/src/contract.ts typescript

`getContractInstanceFromInstantiationParams` deterministically computes the contract address from these parameters — the same inputs always produce the same address. Once registered, your PXE can construct and send transactions to this contract.

### Game actions

#include_code game-actions /docs/examples/webapp-tutorial/src/contract.ts typescript

Each function maps to a step in the game lifecycle:

- `create_game(gameId)` — **public**. Creates a new `Race` struct in public storage with the caller as player 1 and sets a block deadline for the game.
- `join_game(gameId)` — **public**. Updates the `Race` to add the caller as player 2. The game is now active and both players can begin playing rounds.
- `play_round(gameId, round, t1, t2, t3, t4, t5)` — **private**. Creates a `GameRoundNote` storing your point allocation for this round. The note is encrypted and only you can read it. The function then enqueues a public call to increment your round counter so your opponent can see you've completed a round (without seeing your points).
- `finish_game(gameId)` — **private**. Reads all of your `GameRoundNote`s, sums up your totals per track, and publishes the aggregated scores to public state. This is the "reveal" phase — your per-round choices stay hidden, but your final totals become visible.
- `finalize_game(gameId)` — **public**. Compares both players' track totals, declares the winner (best of 5 tracks), and updates the win history. Can only be called after the game's block deadline has passed.

## Game lobby component

The lobby handles two-player coordination. Player 1 deploys a new contract and creates a game, then shares the contract address with their opponent. Player 2 pastes that address, attaches to the existing contract, and joins the game.

Create `src/components/GameLobby.tsx`:

#include_code game-lobby-component /docs/examples/webapp-tutorial/src/components/GameLobby.tsx typescript

### Creating a game

#include_code handle-create /docs/examples/webapp-tutorial/src/components/GameLobby.tsx typescript

This deploys a fresh contract and creates a game in a single flow. The contract address is displayed so the creator can copy and share it with an opponent.

### Joining a game

#include_code handle-join /docs/examples/webapp-tutorial/src/components/GameLobby.tsx typescript

The opponent pastes the contract address and game ID to join. Under the hood, this calls `attachToContract` to register the contract with the joiner's PXE, then sends a `join_game` transaction.

## Next steps

With the game set up, let's look at [how private state works during gameplay](./04-private-state-and-gameplay.md).
