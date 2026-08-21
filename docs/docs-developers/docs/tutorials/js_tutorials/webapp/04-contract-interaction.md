---
title: "4. Contract Interaction & Gameplay"
sidebar_position: 4
description: "Deploy and call the Pod Racing contract from the webapp, handle game lobby and private gameplay"
references: ["docs/examples/webapp-tutorial/src/components/GameLobby.tsx", "docs/examples/webapp-tutorial/src/components/GameBoard.tsx", "docs/examples/webapp-tutorial/src/components/GameStatus.tsx"]
---

# Contract Interaction & Gameplay

Now that you have a wallet, you can deploy the Pod Racing contract and interact with it. This section covers the contract helper functions, the game lobby, and the gameplay components that handle private state.

## Contract helpers

Before your PXE (Private eXecution Environment) can interact with a contract, it needs two pieces of information: the **artifact** (the compiled contract bytecode and ABI) and the **instance** (the deployed address and constructor parameters). Without these, PXE cannot construct proofs or route transactions to the correct contract.

Open [`src/contract.ts`](https://github.com/AztecProtocol/aztec-packages/tree/#include_aztec_version/docs/examples/webapp-tutorial/src/contract.ts). This file imports the generated `PodRacingContract` class from the compiled artifacts and wraps each contract method in a simple async function that the UI components call. The key functions are described below.

### Deploying a new contract

The `deployContract` function calls `PodRacingContract.deploy()` to construct a deployment request and `.send()` to submit it to the network, wait for it to be mined, and return a typed contract instance you can call methods on. The deploy flow handles artifact registration with PXE internally.

### Attaching to an existing contract

When joining someone else's game, you didn't deploy the contract, so your PXE doesn't know about it. `attachToContract` first registers the contract with your PXE by fetching the onchain instance from the node and providing the compiled artifact — this is required for private function execution, since PXE needs the contract bytecode locally to generate proofs. It then calls `PodRacingContract.at()` to create a typed contract handle bound to the existing contract address and wallet.

### Game actions

Each function maps to a step in the game lifecycle:

- `createGame(gameId)` — **public**. Creates a new `Race` struct in public storage with the caller as player 1 and sets a block deadline.
- `joinGame(gameId)` — **public**. Updates the `Race` to add the caller as player 2. The game is now active.
- `playRound(gameId, round, tracks)` — **private**. Creates a `GameRoundNote` storing your point allocation for this round. The note is encrypted and only you can read it. Enqueues a public call to increment your round counter so your opponent can see you've completed a round (without seeing your points).
- `finishGame(gameId)` — **private**. Reads all your `GameRoundNote`s, sums up totals per track, and publishes the aggregated scores to public state. This is the "reveal" phase.
- `finalizeGame(gameId)` — **public**. Compares both players' track totals, declares the winner (best of 5 tracks), and updates the win history.

## Game lobby component

The lobby handles two-player coordination. Player 1 deploys a new contract and creates a game, then shares the contract address with their opponent. Player 2 pastes that address, attaches to the existing contract, and joins the game.

Open `src/components/GameLobby.tsx`:

#include_code game-lobby-imports /docs/examples/webapp-tutorial/src/components/GameLobby.tsx typescript

### Creating a game

#include_code handle-create /docs/examples/webapp-tutorial/src/components/GameLobby.tsx typescript

This deploys a fresh contract and creates a game in a single flow. The contract address is displayed so the creator can copy and share it with an opponent.

### Joining a game

#include_code handle-join /docs/examples/webapp-tutorial/src/components/GameLobby.tsx typescript

The opponent pastes the contract address and game ID to join. Under the hood, this calls `attachToContract` to register the contract with the joiner's PXE, then sends a `join_game` transaction.

## The game board component

Open [`src/components/GameBoard.tsx`](https://github.com/AztecProtocol/aztec-packages/tree/#include_aztec_version/docs/examples/webapp-tutorial/src/components/GameBoard.tsx). The board lets you allocate points across 5 tracks each round. There is a constraint: your total points per round must sum to less than 10 (i.e., at most 9 points). This forces strategic trade-offs — you can't dominate every track.

### Submitting a round (private transaction)

#include_code submit-round /docs/examples/webapp-tutorial/src/components/GameBoard.tsx typescript

When the `playRound` helper sends the transaction (via `.send()`), the following happens under the hood:
1. PXE executes the private function locally, creating a `GameRoundNote`
2. A ZK proof is generated (proving validity without revealing inputs)
3. The proof and encrypted note are sent to the network
4. The network validates the proof and includes the transaction

### Finishing and finalizing

After all 3 rounds, the game has two more phases:

#include_code finish-and-finalize /docs/examples/webapp-tutorial/src/components/GameBoard.tsx typescript

- **`finish_game`**: A private function that reads all your `GameRoundNote`s, sums up totals per track, and publishes the aggregated scores. This is the "reveal" — your per-round choices stay hidden, but your final totals become public.
- **`finalize_game`**: A public function that compares both players' totals track by track and declares the winner (best of 5 tracks). Can only be called after the game's block deadline.

Why two separate phases? Both players must call `finish_game` before anyone can call `finalize_game`. This ensures neither player can see the other's totals before committing their own. The block deadline adds a time constraint: the game must reach a certain block number before finalization, preventing a player from waiting indefinitely.

## Game status display

Open `src/components/GameStatus.tsx`:

#include_code game-status-component /docs/examples/webapp-tutorial/src/components/GameStatus.tsx typescript

## Why opponents can't see your allocations

Private functions execute in **your** PXE using **your** decryption keys. Your opponent's PXE doesn't have your keys, so it can't decrypt your `GameRoundNote`s. This is Aztec's privacy model: private state is truly private by construction.

The only public information during gameplay is each player's round counter (which round they're on). The actual point allocations are only revealed when a player calls `finish_game`.

## Next steps

Continue to [how transactions and fee payment work](./05-transactions-and-fees.md).
