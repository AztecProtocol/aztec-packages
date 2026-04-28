// docs:start:app-imports
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
// docs:end:app-imports

// docs:start:app-state
type AppPhase = 'connect' | 'lobby' | 'playing';

function App() {
  const [network, setNetwork] = useState<NetworkType>('local');
  const [wallet, setWallet] = useState<Wallet | EmbeddedWallet | null>(null);
  const [account, setAccount] = useState<AztecAddress | null>(null);
  const [phase, setPhase] = useState<AppPhase>('connect');
  const [contract, setContract] = useState<PodRacingContract | null>(null);
  const [gameId, setGameId] = useState<bigint>(BigInt(0));
  const [currentRound, setCurrentRound] = useState(1);
// docs:end:app-state

  // docs:start:app-handlers
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
  // docs:end:app-handlers

  // docs:start:app-render
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
  // docs:end:app-render
}

export { App };
