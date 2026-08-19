---
title: "6. Putting It Together"
sidebar_position: 7
description: "Wire all components into a complete Pod Racing webapp and run it"
---

# Putting It Together

In this final section, you wire all the components together into a working app and run it.

## Entry point

Open `src/main.tsx`:

```typescript title="main" showLineNumbers 
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './App.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/webapp-tutorial/src/main.tsx#L1-L12" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/src/main.tsx#L1-L12</a></sub></sup>


## App component

Open `src/App.tsx`. The app is structured as a simple state machine with three phases:

- **connect**: The user picks a wallet mode (embedded or browser extension) and connects a wallet. During this phase, PXE (Private eXecution Environment) is initialized and an account is linked.
- **lobby**: The user creates a new game (deploying a contract) or joins an existing one (attaching to a contract). Once a game is active, the app transitions forward.
- **playing**: The user plays rounds, reveals scores, and determines the winner. All gameplay actions are contract calls.

### Imports

```typescript title="app-imports" showLineNumbers 
import React, { useState } from 'react';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { NetworkType } from './config';
import type { PodRacingContract } from './artifacts/PodRacing';
import { NetworkPicker } from './components/NetworkPicker';
import { WalletConnect } from './components/WalletConnect';
import { AccountInfo } from './components/AccountInfo';
import { GameLobby } from './components/GameLobby';
import { GameBoard } from './components/GameBoard';
import { GameStatus } from './components/GameStatus';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LogProvider, TransactionLog } from './components/TransactionLog';
import { TwoPlayerLocal } from './components/TwoPlayerLocal';
import { EmbeddedWallet } from './embedded-wallet';
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/webapp-tutorial/src/App.tsx#L1-L17" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/src/App.tsx#L1-L17</a></sub></sup>


### State

```typescript title="app-state" showLineNumbers 
type AppPhase = 'connect' | 'lobby' | 'playing';

function App() {
  const [network, setNetwork] = useState<NetworkType>('local');
  const [wallet, setWallet] = useState<Wallet | EmbeddedWallet | null>(null);
  const [account, setAccount] = useState<AztecAddress | null>(null);
  const [phase, setPhase] = useState<AppPhase>('connect');
  const [contract, setContract] = useState<PodRacingContract | null>(null);
  const [gameId, setGameId] = useState<bigint>(BigInt(0));
  const [currentRound, setCurrentRound] = useState(1);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/webapp-tutorial/src/App.tsx#L19-L30" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/src/App.tsx#L19-L30</a></sub></sup>


### Event handlers

Each handler transitions the app to the next phase:

- `handleWalletConnected` — receives the wallet instance from the `WalletConnect` component. For embedded wallets it reads the connected account directly; for extension wallets it fetches the account list. Then it transitions from `connect` to `lobby`.
- `handleGameJoined` — receives the typed contract instance and game ID from the `GameLobby` component, and transitions from `lobby` to `playing`.

```typescript title="app-handlers" showLineNumbers 
async function handleWalletConnected(w: Wallet | EmbeddedWallet) {
  setWallet(w);
  if (w instanceof EmbeddedWallet) {
    setAccount(w.getConnectedAccount());
    setPhase('lobby');
  } else {
    // Extension wallet — getAccounts returns the active account(s)
    try {
      const accounts = await w.getAccounts();
      console.log('Accounts received:', accounts);
      if (accounts && accounts.length > 0) {
        const addr = accounts[0].item;
        console.log('Setting account:', addr);
        setAccount(addr);
        setPhase('lobby');
      } else {
        alert('Please create an account in the wallet extension first, then refresh the page.');
      }
    } catch (err: unknown) {
      console.error('Error getting accounts:', err);
      alert(`Error connecting to wallet: ${err}`);
    }
  }
}

function handleGameJoined(c: PodRacingContract, gId: bigint) {
  setContract(c);
  setGameId(gId);
  setCurrentRound(1);
  setPhase('playing');
}

function handleRoundPlayed() {
  setCurrentRound((r) => r + 1);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/webapp-tutorial/src/App.tsx#L32-L68" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/src/App.tsx#L32-L68</a></sub></sup>


### Render

The render function conditionally displays components based on the current phase. Props flow downward: `network` goes to `WalletConnect`, `wallet` and `account` go to `GameLobby`, `contract`, `gameId`, and `currentRound` go to `GameBoard`. Each child component calls back to the parent via the event handlers above when its phase is complete.

```typescript title="app-render" showLineNumbers 
return (
  <ErrorBoundary>
  <LogProvider>
    <div className="app">
      <header>
        <h1>Pod Racing on Aztec</h1>
        <NetworkPicker
          network={network}
          onNetworkChange={setNetwork}
          disabled={wallet !== null}
        />
        {network === 'remote' && account && <AccountInfo address={account} />}
      </header>

      <main>
        {/* Local network: Two-player split-screen mode */}
        {network === 'local' && <TwoPlayerLocal />}

        {/* Remote: Single-player mode with wallet extension */}
        {network === 'remote' && phase === 'connect' && (
          <WalletConnect
            network={network}
            onWalletConnected={handleWalletConnected}
          />
        )}

        {network === 'remote' && phase === 'lobby' && wallet && account && (
          <GameLobby
            wallet={wallet as Wallet}
            account={account}
            onGameJoined={handleGameJoined}
          />
        )}

        {network === 'remote' && phase === 'playing' && wallet && account && contract && (
          <div className="game-area">
            <GameStatus
              account={account}
              gameId={gameId}
              currentRound={currentRound}
            />
            <GameBoard
              contract={contract}
              account={account}
              gameId={gameId}
              currentRound={currentRound}
              onRoundPlayed={handleRoundPlayed}
            />
          </div>
        )}

        <TransactionLog />
      </main>
    </div>
  </LogProvider>
  </ErrorBoundary>
);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/webapp-tutorial/src/App.tsx#L70-L128" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/src/App.tsx#L70-L128</a></sub></sup>


## Running the app

```bash
# Terminal 1: Start the local network
aztec start --local-network

# Terminal 2: Start the dev server
yarn dev
```

Open `http://localhost:5173`.

### Playing a game (local, split-screen)

When you select "Local" network, the app renders a two-player split-screen on a single page. Both players are side by side:

1. **Player 1 panel**: Click "Connect Account #1" — initializes a PXE and connects the first test account
2. **Player 2 panel**: Click "Connect Account #2" — initializes a separate PXE and connects the second test account
3. **Player 1 panel**: Click "Deploy Contract & Create Game" — deploys the Pod Racing contract and creates a game
4. **Player 2 panel**: Click "Join Game" — registers the contract with Player 2's PXE and joins the game
5. **Both panels**: Adjust the track sliders (total must be < 10) and click "Submit Round" — repeat for rounds 1, 2, and 3
6. **Both panels**: Click "Reveal Scores" to call `finish_game`
7. **Player 1 panel**: Click "Finalize Game" to call `finalize_game` and determine the winner

### With browser extension wallet

1. Build and install the tutorial wallet extension (see [`test-extension/README.md`](https://github.com/AztecProtocol/aztec-packages/tree/v5.2.0/docs/examples/webapp-tutorial/test-extension) for build and install instructions)
2. Run `yarn dev`
3. Select "Browser Wallet" → connect via the wallet extension → verify emojis match
4. Play the same flow as above (share the contract address with your opponent)

## Troubleshooting

### "SharedArrayBuffer is not defined"

`SharedArrayBuffer` is a browser API for shared memory between threads. Aztec's WASM proving engine (Barretenberg) uses it for multithreaded proof generation. It requires the `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers to be set, which the Vite config handles. Make sure you're using `yarn dev` (not opening the HTML file directly). Check `vite.config.ts`.

### PXE initialization is slow

The first load downloads and compiles WASM modules. Subsequent loads use the browser cache.

### "Account not found" errors

Make sure the local network is running (`aztec start --local-network`) and that test accounts are deployed.

### Transaction fails with fee errors

Ensure SponsoredFPC is registered with PXE. The `EmbeddedWallet` does this automatically. If using the wallet SDK, the extension handles fees.

### Contract compilation fails

Make sure the `aztec` CLI is installed and matches your package versions. Run `aztec --version` to check. The `Nargo.toml` dependency path must point to a valid `aztec-nr` location.

## Next steps

You now have a working Aztec webapp. From here you could:

- Add more game features (tournaments, betting, leaderboards)
- Deploy your own contract with custom game logic
- Integrate with a production wallet
- Add persistent storage for game history
