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
aztec = { git = "https://github.com/AztecProtocol/aztec-nr/", tag = "v5.2.0", directory = "aztec" }
```
Replace the tag with your Aztec version.
:::

## GameRoundNote

Open `contracts/src/game_round_note.nr`. This is a private note that stores a player's point allocation for one round:

```rust title="game-round-note" showLineNumbers 
use aztec::{macros::notes::note, protocol::{traits::Packable, address::AztecAddress}};

/// A private note storing a player's point allocation for one round.
/// These notes remain private until the player calls finish_game to reveal totals.
#[derive(Eq, Packable)]
#[note]
pub struct GameRoundNote {
    pub track1: u8,
    pub track2: u8,
    pub track3: u8,
    pub track4: u8,
    pub track5: u8,
    pub round: u8,
    pub owner: AztecAddress,
}

impl GameRoundNote {
    pub fn new(track1: u8, track2: u8, track3: u8, track4: u8, track5: u8, round: u8, owner: AztecAddress) -> Self {
        Self { track1, track2, track3, track4, track5, round, owner }
    }

}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/webapp-tutorial/contracts/src/game_round_note.nr#L1-L24" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/contracts/src/game_round_note.nr#L1-L24</a></sub></sup>


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

```rust title="race" showLineNumbers 
use aztec::protocol::{
    address::AztecAddress,
    traits::{Deserialize, Serialize, Packable},
};

/// Public game state: player addresses, round progress, and final track scores.
#[derive(Deserialize, Serialize, Eq, Packable)]
pub struct Race {
    pub player1: AztecAddress,
    pub player2: AztecAddress,
    pub total_rounds: u8,
    pub player1_round: u8,
    pub player2_round: u8,
    pub player1_track1_final: u64,
    pub player1_track2_final: u64,
    pub player1_track3_final: u64,
    pub player1_track4_final: u64,
    pub player1_track5_final: u64,
    pub player2_track1_final: u64,
    pub player2_track2_final: u64,
    pub player2_track3_final: u64,
    pub player2_track4_final: u64,
    pub player2_track5_final: u64,
    pub end_block: u32,
}

impl Race {
    pub fn new(player1: AztecAddress, total_rounds: u8, end_block: u32) -> Race {
        Self {
            player1,
            player2: AztecAddress::zero(),
            total_rounds,
            player1_round: 0,
            player2_round: 0,
            player1_track1_final: 0,
            player1_track2_final: 0,
            player1_track3_final: 0,
            player1_track4_final: 0,
            player1_track5_final: 0,
            player2_track1_final: 0,
            player2_track2_final: 0,
            player2_track3_final: 0,
            player2_track4_final: 0,
            player2_track5_final: 0,
            end_block,
        }
    }

    pub fn join(self, player2: AztecAddress) -> Race {
        assert(!self.player1.eq(AztecAddress::zero()) & self.player2.eq(AztecAddress::zero()));
        assert(!self.player1.eq(player2));
        Self {
            player1: self.player1,
            player2,
            total_rounds: self.total_rounds,
            player1_round: self.player1_round,
            player2_round: self.player2_round,
            player1_track1_final: 0,
            player1_track2_final: 0,
            player1_track3_final: 0,
            player1_track4_final: 0,
            player1_track5_final: 0,
            player2_track1_final: 0,
            player2_track2_final: 0,
            player2_track3_final: 0,
            player2_track4_final: 0,
            player2_track5_final: 0,
            end_block: self.end_block,
        }
    }

    pub fn increment_player_round(self, player: AztecAddress, round: u8) -> Race {
        assert(round < self.total_rounds + 1);
        let ret = if player.eq(self.player1) {
            assert(round == self.player1_round + 1);
            Option::some(Self {
                player1: self.player1, player2: self.player2,
                total_rounds: self.total_rounds,
                player1_round: round, player2_round: self.player2_round,
                player1_track1_final: self.player1_track1_final, player1_track2_final: self.player1_track2_final,
                player1_track3_final: self.player1_track3_final, player1_track4_final: self.player1_track4_final,
                player1_track5_final: self.player1_track5_final,
                player2_track1_final: self.player2_track1_final, player2_track2_final: self.player2_track2_final,
                player2_track3_final: self.player2_track3_final, player2_track4_final: self.player2_track4_final,
                player2_track5_final: self.player2_track5_final,
                end_block: self.end_block,
            })
        } else if player.eq(self.player2) {
            assert(round == self.player2_round + 1);
            Option::some(Self {
                player1: self.player1, player2: self.player2,
                total_rounds: self.total_rounds,
                player1_round: self.player1_round, player2_round: round,
                player1_track1_final: self.player1_track1_final, player1_track2_final: self.player1_track2_final,
                player1_track3_final: self.player1_track3_final, player1_track4_final: self.player1_track4_final,
                player1_track5_final: self.player1_track5_final,
                player2_track1_final: self.player2_track1_final, player2_track2_final: self.player2_track2_final,
                player2_track3_final: self.player2_track3_final, player2_track4_final: self.player2_track4_final,
                player2_track5_final: self.player2_track5_final,
                end_block: self.end_block,
            })
        } else {
            Option::none()
        };
        ret.unwrap()
    }

    pub fn set_player_scores(self, player: AztecAddress, track1_final: u64, track2_final: u64, track3_final: u64, track4_final: u64, track5_final: u64) -> Race {
        let ret = if player.eq(self.player1) {
            assert(
                self.player1_track1_final + self.player1_track2_final +
                self.player1_track3_final + self.player1_track4_final +
                self.player1_track5_final == 0
            );
            Option::some(Self {
                player1: self.player1, player2: self.player2,
                total_rounds: self.total_rounds,
                player1_round: self.player1_round, player2_round: self.player2_round,
                player1_track1_final: track1_final, player1_track2_final: track2_final,
                player1_track3_final: track3_final, player1_track4_final: track4_final,
                player1_track5_final: track5_final,
                player2_track1_final: self.player2_track1_final, player2_track2_final: self.player2_track2_final,
                player2_track3_final: self.player2_track3_final, player2_track4_final: self.player2_track4_final,
                player2_track5_final: self.player2_track5_final,
                end_block: self.end_block,
            })
        } else if player.eq(self.player2) {
            assert(
                self.player2_track1_final + self.player2_track2_final +
                self.player2_track3_final + self.player2_track4_final +
                self.player2_track5_final == 0
            );
            Option::some(Self {
                player1: self.player1, player2: self.player2,
                total_rounds: self.total_rounds,
                player1_round: self.player1_round, player2_round: self.player2_round,
                player1_track1_final: self.player1_track1_final, player1_track2_final: self.player1_track2_final,
                player1_track3_final: self.player1_track3_final, player1_track4_final: self.player1_track4_final,
                player1_track5_final: self.player1_track5_final,
                player2_track1_final: track1_final, player2_track2_final: track2_final,
                player2_track3_final: track3_final, player2_track4_final: track4_final,
                player2_track5_final: track5_final,
                end_block: self.end_block,
            })
        } else {
            Option::none()
        };
        ret.unwrap()
    }

    pub fn calculate_winner(self, current_block_number: u32) -> AztecAddress {
        assert(current_block_number > self.end_block);
        let mut player1_wins = 0;
        let mut player2_wins = 0;

        if self.player1_track1_final > self.player2_track1_final { player1_wins += 1; } else { player2_wins += 1; };
        if self.player1_track2_final > self.player2_track2_final { player1_wins += 1; } else { player2_wins += 1; };
        if self.player1_track3_final > self.player2_track3_final { player1_wins += 1; } else { player2_wins += 1; };
        if self.player1_track4_final > self.player2_track4_final { player1_wins += 1; } else { player2_wins += 1; };
        if self.player1_track5_final > self.player2_track5_final { player1_wins += 1; } else { player2_wins += 1; };

        if (player1_wins > player2_wins) { self.player1 } else { self.player2 }
    }
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/webapp-tutorial/contracts/src/race.nr#L1-L166" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/contracts/src/race.nr#L1-L166</a></sub></sup>


The `Race` struct holds both player addresses, per-player round counters, the final aggregated scores for each track (filled in when a player calls `finish_game`), and a block deadline. The winner calculation compares track-by-track totals: whoever wins more of the 5 tracks wins the game.

## Main contract

Open `contracts/src/main.nr`. This is the main contract file that defines the game flow.

### Storage

```rust title="storage" showLineNumbers 
#[storage]
struct Storage<Context> {
    admin: PublicMutable<AztecAddress, Context>,
    races: Map<Field, PublicMutable<Race, Context>, Context>,
    progress: Map<Field, Owned<PrivateSet<GameRoundNote, Context>, Context>, Context>,
    win_history: Map<AztecAddress, PublicMutable<u64, Context>, Context>,
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/webapp-tutorial/contracts/src/main.nr#L37-L45" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/contracts/src/main.nr#L37-L45</a></sub></sup>


The storage maps directly to the overview above: `admin` for the deployer, `races` for game state, `progress` for private round notes, and `win_history` for tracking wins.

### Creating and joining a game

```rust title="create-game" showLineNumbers 
#[external("public")]
fn create_game(game_id: Field) {
    assert(self.storage.races.at(game_id).read().player1.eq(AztecAddress::zero()));
    let game = Race::new(
        self.msg_sender(),
        TOTAL_ROUNDS,
        self.context.block_number() + GAME_LENGTH,
    );
    self.storage.races.at(game_id).write(game);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/webapp-tutorial/contracts/src/main.nr#L53-L64" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/contracts/src/main.nr#L53-L64</a></sub></sup>


```rust title="join-game" showLineNumbers 
#[external("public")]
fn join_game(game_id: Field) {
    let maybe_existing_game = self.storage.races.at(game_id).read();
    let joined_game = maybe_existing_game.join(self.msg_sender());
    self.storage.races.at(game_id).write(joined_game);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/webapp-tutorial/contracts/src/main.nr#L66-L73" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/contracts/src/main.nr#L66-L73</a></sub></sup>


Both are public functions. `create_game` initializes a new `Race` with the caller as player 1 and sets a block deadline. `join_game` fills in player 2.

### Playing a round (private)

```rust title="play-round" showLineNumbers 
/// Allocates points across 5 tracks for a round.
/// This is a PRIVATE function - the allocation remains hidden from the opponent.
#[external("private")]
fn play_round(
    game_id: Field,
    round: u8,
    track1: u8,
    track2: u8,
    track3: u8,
    track4: u8,
    track5: u8,
) {
    assert(track1 + track2 + track3 + track4 + track5 < 10);

    let player = self.msg_sender();

    self
        .storage
        .progress
        .at(game_id)
        .at(player)
        .insert(GameRoundNote::new(track1, track2, track3, track4, track5, round, player))
        .deliver(MessageDelivery::onchain_unconstrained());

    self.enqueue(PodRacing::at(self.context.this_address()).validate_and_play_round(
        player,
        game_id,
        round,
    ));
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/webapp-tutorial/contracts/src/main.nr#L75-L106" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/contracts/src/main.nr#L75-L106</a></sub></sup>


This is a **private function** — the point allocation remains hidden from the opponent. It creates a `GameRoundNote`, then enqueues a public call to `validate_and_play_round` to increment the round counter without revealing points.

### Finishing the game (reveal)

```rust title="finish-game" showLineNumbers 
/// Reveals a player's total scores per track.
/// Reads private round notes and publishes aggregated totals.
#[external("private")]
fn finish_game(game_id: Field) {
    let player = self.msg_sender();
    let totals =
        self.storage.progress.at(game_id).at(player).get_notes(NoteGetterOptions::new());

    let mut total_track1: u64 = 0;
    let mut total_track2: u64 = 0;
    let mut total_track3: u64 = 0;
    let mut total_track4: u64 = 0;
    let mut total_track5: u64 = 0;

    for i in 0..TOTAL_ROUNDS {
        total_track1 += totals.get(i as u32).note.track1 as u64;
        total_track2 += totals.get(i as u32).note.track2 as u64;
        total_track3 += totals.get(i as u32).note.track3 as u64;
        total_track4 += totals.get(i as u32).note.track4 as u64;
        total_track5 += totals.get(i as u32).note.track5 as u64;
    }

    self.enqueue(PodRacing::at(self.context.this_address()).validate_finish_game_and_reveal(
        player,
        game_id,
        total_track1,
        total_track2,
        total_track3,
        total_track4,
        total_track5,
    ));
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/webapp-tutorial/contracts/src/main.nr#L115-L148" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/contracts/src/main.nr#L115-L148</a></sub></sup>


Another private function. It reads all your `GameRoundNote`s, sums up totals per track, and publishes the aggregated scores to public state. Your per-round choices stay hidden, but your final totals become visible.

### Finalizing the game

```rust title="finalize-game" showLineNumbers 
/// Determines the winner after both players have revealed and the game has expired.
#[external("public")]
fn finalize_game(game_id: Field) {
    let game_in_progress = self.storage.races.at(game_id).read();
    let winner = game_in_progress.calculate_winner(self.context.block_number());
    let previous_wins = self.storage.win_history.at(winner).read();
    self.storage.win_history.at(winner).write(previous_wins + 1);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/webapp-tutorial/contracts/src/main.nr#L172-L181" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/contracts/src/main.nr#L172-L181</a></sub></sup>


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

```typescript title="script-setup" showLineNumbers 
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
// @ts-ignore — generated artifact, may not exist until compiled
import { PodRacingContract } from "../src/artifacts/PodRacing.js";

const nodeUrl = process.env.AZTEC_NODE_URL ?? "http://localhost:8080";
const wallet = await EmbeddedWallet.create(nodeUrl, { ephemeral: true });

const [alice, bob] = await getInitialTestAccountsData();
await wallet.createSchnorrAccount(alice.secret, alice.salt, alice.signingKey);
await wallet.createSchnorrAccount(bob.secret, bob.salt, bob.signingKey);
console.log(
  "Accounts ready:",
  alice.address.toString(),
  bob.address.toString(),
);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/webapp-tutorial/scripts/deploy-and-interact.ts#L1-L18" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/scripts/deploy-and-interact.ts#L1-L18</a></sub></sup>


This uses `EmbeddedWallet` from `@aztec/wallets/embedded` — a ready-made embedded wallet that handles PXE creation and account management. `getInitialTestAccountsData` provides pre-deployed test accounts available on the local network. The `{ ephemeral: true }` option means PXE state is not persisted between runs.

### Deploy the contract

```typescript title="script-deploy" showLineNumbers 
const { contract } = await PodRacingContract.deploy(wallet, alice.address).send(
  {
    from: alice.address,
  },
);
console.log("Contract deployed at:", contract.address.toString());
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/webapp-tutorial/scripts/deploy-and-interact.ts#L20-L27" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/scripts/deploy-and-interact.ts#L20-L27</a></sub></sup>


### Create and join a game

```typescript title="script-create-join" showLineNumbers 
const gameId = 1n;
await contract.methods.create_game(gameId).send({ from: alice.address });
console.log("Game created");

await contract.methods.join_game(gameId).send({ from: bob.address });
console.log("Bob joined the game");
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/webapp-tutorial/scripts/deploy-and-interact.ts#L29-L36" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/scripts/deploy-and-interact.ts#L29-L36</a></sub></sup>


### Play rounds

```typescript title="script-play-rounds" showLineNumbers 
// Round 1
await contract.methods
  .play_round(gameId, 1, 3, 2, 1, 2, 1)
  .send({ from: alice.address });
await contract.methods
  .play_round(gameId, 1, 1, 1, 3, 2, 2)
  .send({ from: bob.address });

// Round 2
await contract.methods
  .play_round(gameId, 2, 2, 3, 1, 1, 2)
  .send({ from: alice.address });
await contract.methods
  .play_round(gameId, 2, 2, 2, 2, 2, 1)
  .send({ from: bob.address });

// Round 3
await contract.methods
  .play_round(gameId, 3, 1, 1, 2, 3, 2)
  .send({ from: alice.address });
await contract.methods
  .play_round(gameId, 3, 3, 1, 1, 1, 3)
  .send({ from: bob.address });
console.log("All rounds played");
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/webapp-tutorial/scripts/deploy-and-interact.ts#L38-L63" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/scripts/deploy-and-interact.ts#L38-L63</a></sub></sup>


Each `play_round` call is a private transaction — the point allocations are encrypted as notes. Alice and Bob each play 3 rounds.

### Finish and finalize

```typescript title="script-finish-finalize" showLineNumbers 
await contract.methods.finish_game(gameId).send({ from: alice.address });
await contract.methods.finish_game(gameId).send({ from: bob.address });
console.log("Both players revealed scores");

await contract.methods.finalize_game(gameId).send({ from: alice.address });
console.log("Game finalized! Winner determined.");
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/webapp-tutorial/scripts/deploy-and-interact.ts#L65-L72" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/scripts/deploy-and-interact.ts#L65-L72</a></sub></sup>


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
