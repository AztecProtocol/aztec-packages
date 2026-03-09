---
title: "6. Putting It Together"
sidebar_position: 6
description: "Wire all components into a complete Pod Racing webapp and run it"
---

# Putting It Together

In this final section you wire all the components together into a working app and run it.

## Entry point

Create `src/main.tsx`:

#include_code main /docs/examples/webapp-tutorial/src/main.tsx typescript

## App component

Create `src/App.tsx`. The app is structured as a simple state machine with three phases:

- **connect**: The user picks a network (local or devnet) and connects a wallet. During this phase, PXE is initialized and an account is linked.
- **lobby**: The user creates a new game (deploying a contract) or joins an existing one (attaching to a contract). Once a game is active, the app transitions forward.
- **playing**: The user plays rounds, reveals scores, and determines the winner. All gameplay actions are contract calls.

### State

#include_code app-state /docs/examples/webapp-tutorial/src/App.tsx typescript

### Event handlers

Each handler transitions the app to the next phase:

- `handleWalletConnected` — receives the wallet instance from the `WalletConnect` component. For embedded wallets it reads the connected account directly; for extension wallets it fetches the account list. Then it transitions from `connect` to `lobby`.
- `handleGameJoined` — receives the typed contract instance and game ID from the `GameLobby` component, and transitions from `lobby` to `playing`.

#include_code app-handlers /docs/examples/webapp-tutorial/src/App.tsx typescript

### Render

The render function conditionally displays components based on the current phase. Props flow downward: `network` goes to `WalletConnect`, `wallet` and `account` go to `GameLobby`, `contract`, `gameId`, and `currentRound` go to `GameBoard`. Each child component calls back to the parent via the event handlers above when its phase is complete.

#include_code app-render /docs/examples/webapp-tutorial/src/App.tsx typescript

## Running the app

### Step-by-step from scratch

```bash
# 1. Start the Aztec sandbox (in a separate terminal)
aztec start --sandbox

# 2. Clone or create the project (if not already done)
# All files from this tutorial go in the pod-racing/ directory

# 3. Install dependencies
npm install

# 4. Compile the Pod Racing contract and generate TypeScript bindings
npm run prep

# 5. Start the dev server
npm run dev
```

Open `http://localhost:5173`.

### Playing a game (local, two browser tabs)

1. **Tab 1**: Select "Local" network → pick "Account 1" → click "Connect Test Account"
2. **Tab 1**: Enter a game ID (e.g., `1`) → click "Deploy Contract & Create Game"
3. **Tab 1**: Copy the contract address from the status message
4. **Tab 2**: Select "Local" network → pick "Account 2" → click "Connect Test Account"
5. **Tab 2**: Paste the contract address → enter game ID `1` → click "Join Game"
6. **Both tabs**: Allocate points across 5 tracks (sum must be < 10) and submit for rounds 1, 2, and 3
7. **Both tabs**: Click "Reveal Scores" to call `finish_game`
8. **Either tab**: Click "Determine Winner" to call `finalize_game` (only works after the game's block deadline)

### Against devnet

1. Install an Aztec wallet browser extension
2. Run `npm run dev`
3. Select "Devnet" → connect via the wallet extension → verify emojis match
4. Play the same flow as above (share the contract address with your opponent)

## Troubleshooting

### "SharedArrayBuffer is not defined"

`SharedArrayBuffer` is a browser API for shared memory between threads. Aztec's WASM proving engine (Barretenberg) uses it for multithreaded proof generation. It requires the `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers to be set, which our Vite config handles. Make sure you're using `npm run dev` (not opening the HTML file directly). Check `vite.config.ts`.

### PXE initialization is slow

The first load downloads and compiles WASM modules. Subsequent loads use the browser cache.

### "Account not found" errors

Make sure the sandbox is running (`aztec start --sandbox`) and that test accounts are deployed.

### Transaction fails with fee errors

Ensure SponsoredFPC is registered with PXE. The `EmbeddedWallet` does this automatically. If using the wallet SDK, the extension handles fees.

### Contract compilation fails

Make sure the `aztec` CLI is installed and matches your package versions. Run `aztec --version` to check. The `Nargo.toml` dependency path must point to a valid `aztec-nr` location.

## What's next

You now have a working Aztec webapp. From here you could:

- Add more game features (tournaments, betting, leaderboards)
- Deploy your own contract with custom game logic
- Integrate with a production wallet
- Add persistent storage for game history
