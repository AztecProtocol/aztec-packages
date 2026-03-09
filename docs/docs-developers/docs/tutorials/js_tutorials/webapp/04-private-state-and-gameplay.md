---
title: "4. Private State & Gameplay"
sidebar_position: 4
description: "How private notes work in Pod Racing — hidden allocations and game rounds"
---

# Private State & Gameplay

This is where Aztec's privacy features come into play. Each player's point allocation is **private** — stored as encrypted notes only the owner can decrypt.

## How private notes work

In Aztec, private state is stored as **notes** — encrypted data objects that live in your PXE's local database. When a note is created, it is encrypted with the owner's public key so that only the owner's PXE can decrypt and read it. The note is also committed to the network as a hash (called a commitment). The network never sees the plaintext — it only stores the commitment, which proves the note exists without revealing its contents.

When you call `play_round`, the contract creates a `GameRoundNote`:

#include_code game-round-note /docs/examples/webapp-tutorial/contracts/src/game_round_note.nr rust

The fields `track1` through `track5` hold your point allocation for each track in this round. `round` identifies which round (1, 2, or 3). `owner` is your address — it determines whose encryption key is used, ensuring only you can read this note.

The flow:
1. You call `play_round(gameId, round, 3, 2, 1, 2, 1)` — a **private function**
2. The contract creates a `GameRoundNote` with your allocation, stored privately
3. It then enqueues a **public** call to `validate_and_play_round` which increments your round counter (visible) without revealing your points (hidden). "Enqueues" means the private function schedules a public function to run after the private execution completes — private functions cannot modify public state directly, so they use this mechanism to trigger public side effects.
4. Your opponent's PXE cannot decrypt your notes — they only see that you completed a round

This means:
- **You** know your own allocations
- **Your opponent** only sees that you've played a round (public round counter)
- **The network** only sees encrypted data

## The game board component

Create `src/components/GameBoard.tsx`. The board lets you allocate points across 5 tracks each round. There is a constraint: your total points per round must sum to less than 10 (i.e., at most 9 points). This forces strategic trade-offs — you can't dominate every track.

#include_code game-board-component /docs/examples/webapp-tutorial/src/components/GameBoard.tsx typescript

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

Why two separate phases? Both players must call `finish_game` before anyone can call `finalize_game`. This ensures neither player can see the other's totals before committing their own. The block deadline adds a time constraint: the game must reach a certain block number before finalization, preventing a player from waiting indefinitely to see if conditions change before revealing.

## Game status display

Create `src/components/GameStatus.tsx`:

#include_code game-status-component /docs/examples/webapp-tutorial/src/components/GameStatus.tsx typescript

## Why opponents can't see your allocations

Private functions execute in **your** PXE using **your** decryption keys. Your opponent's PXE doesn't have your keys, so it can't decrypt your `GameRoundNote`s. This is Aztec's privacy model: private state is truly private by construction.

The only public information during gameplay is each player's round counter (which round they're on). The actual point allocations are only revealed when a player calls `finish_game`.

## Next steps

Let's look at [how transactions and fee payment work](./05-transactions-and-fees.md).
