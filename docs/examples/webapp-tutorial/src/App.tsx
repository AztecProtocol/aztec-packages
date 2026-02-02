// docs:start:app
import React, { useState } from 'react';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { NetworkType } from './config';
import { NetworkPicker } from './components/NetworkPicker';
import { WalletConnect } from './components/WalletConnect';
import { AccountInfo } from './components/AccountInfo';
import { GameLobby } from './components/GameLobby';
import { GameBoard } from './components/GameBoard';
import { GameStatus } from './components/GameStatus';
import { EmbeddedWallet } from './embedded-wallet';

// docs:start:app-state
type AppPhase = 'connect' | 'lobby' | 'playing';

function App() {
  const [network, setNetwork] = useState<NetworkType>('local');
  const [wallet, setWallet] = useState<Wallet | EmbeddedWallet | null>(null);
  const [account, setAccount] = useState<AztecAddress | null>(null);
  const [phase, setPhase] = useState<AppPhase>('connect');
  const [contract, setContract] = useState<any>(null);
  const [gameId, setGameId] = useState<bigint>(BigInt(0));
  const [currentRound, setCurrentRound] = useState(1);
// docs:end:app-state

  // docs:start:app-handlers
  function handleWalletConnected(w: Wallet | EmbeddedWallet) {
    setWallet(w);
    if (w instanceof EmbeddedWallet) {
      setAccount(w.getConnectedAccount());
    } else {
      w.getAccounts().then((accounts: any) => {
        if (accounts.length > 0) {
          setAccount(accounts[0].item);
        }
      });
    }
    setPhase('lobby');
  }

  function handleGameJoined(c: any, gId: bigint) {
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
    <div className="app">
      <header>
        <h1>Pod Racing on Aztec</h1>
        <NetworkPicker
          network={network}
          onNetworkChange={setNetwork}
          disabled={wallet !== null}
        />
        {account && <AccountInfo address={account} />}
      </header>

      <main>
        {phase === 'connect' && (
          <WalletConnect
            network={network}
            onWalletConnected={handleWalletConnected}
          />
        )}

        {phase === 'lobby' && wallet && account && (
          <GameLobby
            wallet={wallet as Wallet}
            account={account}
            onGameJoined={handleGameJoined}
          />
        )}

        {phase === 'playing' && wallet && account && contract && (
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
      </main>
    </div>
  );
  // docs:end:app-render
}

export default App;
// docs:end:app
