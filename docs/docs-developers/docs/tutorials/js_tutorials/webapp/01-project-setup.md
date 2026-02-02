---
title: "1. Project Setup"
sidebar_position: 1
description: "Scaffold a Vite + React project configured for Aztec WASM modules and compile the Pod Racing contract"
---

# Project Setup

In this section you'll create a Vite + React project, configure it for Aztec's WASM modules, and compile the Pod Racing smart contract.

## Create the project

```bash
mkdir pod-racing && cd pod-racing
```

Create `package.json`:

```json
{
  "name": "webapp-tutorial-pod-racing",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": {
    "node": ">=22.0.0"
  },
  "scripts": {
    "clean": "rm -rf contracts/target src/artifacts/*.json src/artifacts/*.ts dist",
    "compile": "cd contracts && ${AZTEC:-aztec} compile && mkdir -p ../src/artifacts && cp target/*.json ../src/artifacts",
    "codegen": "cd contracts && ${AZTEC:-aztec} codegen ./target -o ./target && cp target/*.ts ../src/artifacts",
    "prep": "yarn compile && yarn codegen",
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  }
}
```

## Install dependencies

```bash
# Aztec packages
npm install \
  @aztec/accounts@latest \
  @aztec/aztec.js@latest \
  @aztec/constants@latest \
  @aztec/entrypoints@latest \
  @aztec/foundation@latest \
  @aztec/kv-store@latest \
  @aztec/noir-contracts.js@latest \
  @aztec/pxe@latest \
  @aztec/stdlib@latest \
  @aztec/wallet-sdk@latest \
  react react-dom

# Dev dependencies
npm install -D \
  @types/react @types/react-dom \
  @vitejs/plugin-react-swc \
  typescript vite \
  vite-plugin-node-polyfills
```

## Vite configuration

Aztec uses WASM modules that require `SharedArrayBuffer`, which needs specific HTTP headers. Create `vite.config.ts`:

#include_code vite-config /docs/examples/webapp-tutorial/vite.config.ts typescript

Why each piece is needed:
- **COOP/COEP headers**: Enable `SharedArrayBuffer` for multithreaded WASM (barretenberg proving)
- **Node polyfills**: Aztec libraries use Node.js APIs that need polyfilling in the browser
- **optimizeDeps.exclude**: Prevents Vite from pre-bundling WASM-containing packages (`@aztec/bb.js`, `@aztec/noir-noirc_abi`, etc.) which would corrupt the WASM modules

## TypeScript configuration

Create `tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }]
}
```

Create `tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
```

## HTML entry point

Create `index.html` at the project root:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Pod Racing on Aztec</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

## The Pod Racing contract

Before looking at the code, here is an overview of how the contract is structured.

**Storage:**
- `admin` — the address that deployed the contract
- `races` — a public map from game ID to `Race` struct (the shared game state)
- `game_round_notes` — a private map storing each player's per-round point allocations as encrypted notes
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

The contract source lives in `contracts/`. Create the following files:

### `contracts/Nargo.toml`

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
aztec = { git = "https://github.com/AztecProtocol/aztec-nr/", tag = "v0.87.0", directory = "aztec" }
```
Replace the tag with your Aztec version.
:::

### `contracts/src/main.nr`

This is the main contract. It defines the game flow: create → join → play rounds (private) → finish (reveal) → finalize (determine winner).

#include_code pod-racing-contract /docs/examples/webapp-tutorial/contracts/src/main.nr rust

The contract's storage is declared at the top. The key functions map directly to the lifecycle described above: `create_game` and `join_game` are public, `play_round` and `finish_game` are private (annotated `#[private]`), and `finalize_game` is public. Private functions can enqueue public follow-up calls (e.g., `play_round` enqueues `validate_and_play_round`) to update shared state without revealing private inputs.

### `contracts/src/game_round_note.nr`

A private note that stores a player's point allocation for one round:

#include_code game-round-note /docs/examples/webapp-tutorial/contracts/src/game_round_note.nr rust

The fields `track1` through `track5` store the points allocated to each track for that round. `round` identifies which round (1, 2, or 3) the note belongs to. `owner` is the player's address — only the owner's PXE can decrypt and read this note.

### `contracts/src/race.nr`

The public game state struct:

#include_code race /docs/examples/webapp-tutorial/contracts/src/race.nr rust

The `Race` struct holds both player addresses, per-player round counters, the final aggregated scores for each track (filled in when a player calls `finish_game`), a block deadline (the game must reach this block number before finalization), and the winner address. The winner calculation compares track-by-track totals: whoever wins more of the 5 tracks wins the game.

## Compile the contract

With the Aztec CLI installed and the contract source in place:

```bash
# Compile the Noir contract
npm run compile

# Generate TypeScript bindings
npm run codegen
```

Or in one step:

```bash
npm run prep
```

This produces `src/artifacts/PodRacing.ts` (the typed contract class) and `src/artifacts/PodRacing.json` (the compiled artifact). You'll import from `PodRacing.ts` throughout the app.

## Create the source directory

```bash
mkdir -p src/components src/artifacts
```

## Environment variables

Create `.env`:

```
AZTEC_NODE_URL=http://localhost:8080
```

## Next steps

With the project scaffolded and contract compiled, let's [connect to the Aztec network and set up wallets](./02-network-and-wallet.md).
