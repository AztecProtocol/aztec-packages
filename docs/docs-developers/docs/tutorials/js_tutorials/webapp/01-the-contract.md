---
title: "1. The Contract"
sidebar_position: 1
description: "Walk through the Pod Racing smart contract, compile it, and deploy and interact with it via a TypeScript script"
---

# The Contract

:::note Prerequisites
Make sure you've completed the [setup steps](./index.md#clone-the-example) before continuing.
:::

In this section, you walk through the Pod Racing smart contract, compile it, and run a standalone script that deploys and plays a full game against a local network.

## Overview

Before looking at code, here is how the contract is structured.

**Storage:**
- `admin` — the address that deployed the contract
- `races` — a public map from game ID to `Race` struct (the shared game state)
- `progress` — a private map storing each player's per-round point allocations as encrypted notes
- `win_history` — a public map tracking each player's lifetime win count

**Game lifecycle:**
1. `create_game` — player 1 calls this to create a new `Race` in public storage, setting a block deadline
2. `join_game` — player 2 joins, filling the second slot in the `Race`
3. `play_round` (private) — each player submits a `GameRoundNote` containing their point allocation for one round; a public follow-up increments the round counter without revealing points
4. `finish_game` (private) — reads all of your `GameRoundNote`s, sums totals per track, and publishes the aggregated scores publicly
5. `finalize_game` (public) — compares both players' track totals, declares the winner (best of 5), and updates win history

**Key types:**
- `GameRoundNote` — a private note storing one round's point allocation (5 track values), the round number, and the owner
- `Race` — the public game state: both player addresses, round counters, final per-track scores, block deadline, and winner

The core design principle is that **private functions** (`play_round`, `finish_game`) hide your strategy, while **public functions** (`create_game`, `join_game`, `finalize_game`) coordinate shared state that both players can see.

## Nargo.toml

Open `contracts/Nargo.toml`. This configures the Noir compiler for the contract:

```toml
[package]
name = "pod_racing_contract"
authors = [""]
compiler_version = ">=0.25.0"
type = "contract"

[dependencies]
aztec = { path = "../../../../noir-projects/aztec-nr/aztec" }
```

:::note
The `aztec` dependency path assumes you're working within the `aztec-packages` monorepo. If you're working outside the monorepo, use the git dependency instead:
```toml
aztec = { git = "https://github.com/AztecProtocol/aztec-nr/", tag = "#include_aztec_version", directory = "aztec" }
```
Replace the tag with your Aztec version.
:::

## GameRoundNote

Open `contracts/src/game_round_note.nr`. This is a private note that stores a player's point allocation for one round:

#include_code game-round-note /docs/examples/webapp-tutorial/contracts/src/game_round_note.nr rust

The fields `track1` through `track5` store the points allocated to each track for that round. `round` identifies which round (1, 2, or 3) the note belongs to. `owner` is the player's address — only the owner's PXE (Private eXecution Environment) can decrypt and read this note.

### How private notes work

In Aztec, private state is stored as **notes** — encrypted data objects that live in your PXE local database. When a note is created, it is encrypted with the owner's public key so that only the owner's PXE can decrypt and read it. The note is also committed to the network as a hash (called a commitment), which allows for proving the note exists without revealing its contents.

When you call `play_round`, the contract creates a `GameRoundNote` with your allocation. The flow:
1. You call `play_round(gameId, round, 3, 2, 1, 2, 1)` — a **private function**
2. The contract creates a `GameRoundNote` with your allocation, stored privately
3. It then enqueues a **public** call to `validate_and_play_round` which increments your round counter (visible) without revealing your points (hidden). "Enqueues" means the private function schedules a public function to run after the private execution completes. Private functions cannot modify public state directly, so they use this mechanism to trigger public side effects (e.g., state changes or emitting logs).
4. Your opponent's PXE cannot decrypt your notes — they only see that you completed a round

This means:
- **You** know your own allocations
- **Your opponent** only sees that you've played a round (public round counter)
- **The network** only sees encrypted data

## Race struct

Open `contracts/src/race.nr`. This is the public game state:

#include_code race /docs/examples/webapp-tutorial/contracts/src/race.nr rust

The `Race` struct holds both player addresses, per-player round counters, the final aggregated scores for each track (filled in when a player calls `finish_game`), and a block deadline. The winner calculation compares track-by-track totals: whoever wins more of the 5 tracks wins the game.

## Main contract

Open `contracts/src/main.nr`. This is the main contract file that defines the game flow.

### Storage

#include_code storage /docs/examples/webapp-tutorial/contracts/src/main.nr rust

The storage maps directly to the overview above: `admin` for the deployer, `races` for game state, `progress` for private round notes, and `win_history` for tracking wins.

### Creating and joining a game

#include_code create-game /docs/examples/webapp-tutorial/contracts/src/main.nr rust

#include_code join-game /docs/examples/webapp-tutorial/contracts/src/main.nr rust

Both are public functions. `create_game` initializes a new `Race` with the caller as player 1 and sets a block deadline. `join_game` fills in player 2.

### Playing a round (private)

#include_code play-round /docs/examples/webapp-tutorial/contracts/src/main.nr rust

This is a **private function** — the point allocation remains hidden from the opponent. It creates a `GameRoundNote`, then enqueues a public call to `validate_and_play_round` to increment the round counter without revealing points.

### Finishing the game (reveal)

#include_code finish-game /docs/examples/webapp-tutorial/contracts/src/main.nr rust

Another private function. It reads all your `GameRoundNote`s, sums up totals per track, and publishes the aggregated scores to public state. Your per-round choices stay hidden, but your final totals become visible.

### Finalizing the game

#include_code finalize-game /docs/examples/webapp-tutorial/contracts/src/main.nr rust

A public function that compares both players' track totals, declares the winner (best of 5 tracks), and updates the win history. Can only be called after the game's block deadline has passed.

## Compile the contract

With the Aztec CLI installed and the contract source in place:

```bash
# Compile the Noir contract and generate TypeScript bindings
yarn prep
```

This runs `yarn compile && yarn codegen`, producing `src/artifacts/PodRacing.ts` (the typed contract class) and `src/artifacts/PodRacing.json` (the compiled artifact). You'll import from `PodRacing.ts` throughout the app.

## Deploy and interact via script

To verify everything works, run a standalone TypeScript script that deploys the contract and plays a full game against a local network.

Open `scripts/deploy-and-interact.ts`. It follows the same pattern as the [aztec.js Getting Started](../aztecjs-getting-started.md) guide.

### Setup

#include_code script-setup /docs/examples/webapp-tutorial/scripts/deploy-and-interact.ts typescript

This uses `EmbeddedWallet` from `@aztec/wallets/embedded` — a ready-made embedded wallet that handles PXE creation and account management. `getInitialTestAccountsData` provides pre-deployed test accounts available on the local network. The `{ ephemeral: true }` option means PXE state is not persisted between runs.

### Deploy the contract

#include_code script-deploy /docs/examples/webapp-tutorial/scripts/deploy-and-interact.ts typescript

### Create and join a game

#include_code script-create-join /docs/examples/webapp-tutorial/scripts/deploy-and-interact.ts typescript

### Play rounds

#include_code script-play-rounds /docs/examples/webapp-tutorial/scripts/deploy-and-interact.ts typescript

Each `play_round` call is a private transaction — the point allocations are encrypted as notes. Alice and Bob each play 3 rounds.

### Finish and finalize

#include_code script-finish-finalize /docs/examples/webapp-tutorial/scripts/deploy-and-interact.ts typescript

Both players call `finish_game` to reveal their aggregated scores, then either player calls `finalize_game` to determine the winner.

### Run it

Make sure you have a local network running first:

```bash
# Terminal 1: Start the local network
aztec start --local-network
```

Once the network is ready (you can check with `curl http://localhost:8080/status`), run the script in a separate terminal:

```bash
# Terminal 2: Run the script
yarn interact
```

You should see output showing the contract deployment, game creation, rounds being played, and the winner being determined. The script takes a few minutes to complete as each transaction requires proof generation.

## Next steps

With the contract understood and verified, continue to [project setup](./02-project-setup.md) to see how the webapp is structured.
