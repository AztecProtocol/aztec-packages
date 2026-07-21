import React, { useState, useEffect } from 'react';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Wallet } from '@aztec/aztec.js/wallet';
import type { PodRacingContract } from '../artifacts/PodRacing';
import { EmbeddedWallet } from '../embedded-wallet';
import { getNodeUrl } from '../config';
import {
  deployContract,
  createGame,
  joinGame,
  playRound,
  finishGame,
  finalizeGame,
  attachToContract,
} from '../contract';
import { TRACK_NAMES, MAX_POINTS_PER_ROUND, TOTAL_ROUNDS } from '../game-constants';
import { useTransactionLog } from './TransactionLog';

type GamePhase = 'setup' | 'playing' | 'reveal' | 'finished';

interface PlayerState {
  wallet: EmbeddedWallet | null;
  account: AztecAddress | null;
  contract: PodRacingContract | null;
  connected: boolean;
  currentRound: number;
  allocations: [number, number, number, number, number];
  roundsSubmitted: number[];
  hasRevealed: boolean;
  loading: boolean;
  status: string;
}

const initialPlayerState: PlayerState = {
  wallet: null,
  account: null,
  contract: null,
  connected: false,
  currentRound: 1,
  allocations: [2, 2, 2, 2, 1],
  roundsSubmitted: [],
  hasRevealed: false,
  loading: false,
  status: '',
};

export function TwoPlayerLocal() {
  const [player1, setPlayer1] = useState<PlayerState>({ ...initialPlayerState });
  const [player2, setPlayer2] = useState<PlayerState>({ ...initialPlayerState });
  const [contract, setContract] = useState<PodRacingContract | null>(null);
  const [gameId, setGameId] = useState<bigint>(BigInt(1));
  const [phase, setPhase] = useState<GamePhase>('setup');
  const [winner, setWinner] = useState<string | null>(null);
  const { addLog } = useTransactionLog();

  // Connect Player 1
  async function connectPlayer1() {
    setPlayer1(p => ({ ...p, loading: true, status: 'Initializing PXE...' }));
    addLog('[P1] Initializing PXE...', 'pending');
    try {
      const nodeUrl = getNodeUrl('local');
      const wallet = await EmbeddedWallet.initialize(nodeUrl);
      addLog('[P1] PXE initialized', 'success');

      setPlayer1(p => ({ ...p, status: 'Connecting test account #1...' }));
      addLog('[P1] Connecting test account #1...', 'pending');
      await wallet.connectTestAccount(0);
      const account = wallet.getConnectedAccount()!;
      addLog(`[P1] Connected: ${account.toString().slice(0, 10)}...`, 'success');

      setPlayer1(p => ({
        ...p,
        wallet,
        account,
        connected: true,
        loading: false,
        status: 'Connected!',
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPlayer1(p => ({ ...p, loading: false, status: `Error: ${msg}` }));
      addLog(`[P1] Error: ${msg}`, 'error');
    }
  }

  // Connect Player 2
  async function connectPlayer2() {
    setPlayer2(p => ({ ...p, loading: true, status: 'Initializing PXE...' }));
    addLog('[P2] Initializing PXE...', 'pending');
    try {
      const nodeUrl = getNodeUrl('local');
      const wallet = await EmbeddedWallet.initialize(nodeUrl);
      addLog('[P2] PXE initialized', 'success');

      setPlayer2(p => ({ ...p, status: 'Connecting test account #2...' }));
      addLog('[P2] Connecting test account #2...', 'pending');
      await wallet.connectTestAccount(1);
      const account = wallet.getConnectedAccount()!;
      addLog(`[P2] Connected: ${account.toString().slice(0, 10)}...`, 'success');

      setPlayer2(p => ({
        ...p,
        wallet,
        account,
        connected: true,
        loading: false,
        status: 'Connected!',
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPlayer2(p => ({ ...p, loading: false, status: `Error: ${msg}` }));
      addLog(`[P2] Error: ${msg}`, 'error');
    }
  }

  // Player 1 creates the game
  async function handleCreateGame() {
    if (!player1.wallet || !player1.account) return;

    setPlayer1(p => ({ ...p, loading: true, status: 'Deploying contract...' }));
    addLog('[P1] Deploying Pod Racing contract...', 'pending');

    try {
      const deployed = await deployContract(player1.wallet as Wallet, player1.account);
      addLog(`[P1] Contract deployed: ${deployed.address.toString().slice(0, 10)}...`, 'success');
      setContract(deployed);

      setPlayer1(p => ({ ...p, contract: deployed, status: 'Creating game...' }));
      addLog('[P1] Creating game...', 'pending');
      await createGame(deployed, player1.account!, gameId);
      addLog(`[P1] Game ${gameId} created`, 'success');

      setPlayer1(p => ({ ...p, loading: false, status: 'Game created! Waiting for Player 2...' }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPlayer1(p => ({ ...p, loading: false, status: `Error: ${msg}` }));
      addLog(`[P1] Error: ${msg}`, 'error');
    }
  }

  // Player 2 joins the game
  async function handleJoinGame() {
    if (!player2.wallet || !player2.account || !contract) return;

    setPlayer2(p => ({ ...p, loading: true, status: 'Registering contract...' }));
    addLog('[P2] Registering contract...', 'pending');

    try {
      // Player 2 needs to attach to the same contract
      const p2Contract = await attachToContract(
        player2.wallet as Wallet,
        contract.address
      );
      addLog('[P2] Contract registered', 'success');

      setPlayer2(p => ({ ...p, contract: p2Contract, status: 'Joining game...' }));
      addLog('[P2] Joining game...', 'pending');
      await joinGame(p2Contract, player2.account!, gameId);
      addLog(`[P2] Joined game ${gameId}`, 'success');

      setPlayer2(p => ({ ...p, loading: false, status: 'Joined! Ready to play.' }));
      setPhase('playing');
      addLog('Both players ready - game started!', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPlayer2(p => ({ ...p, loading: false, status: `Error: ${msg}` }));
      addLog(`[P2] Error: ${msg}`, 'error');
    }
  }

  // Update allocations
  function updateAllocation(player: 1 | 2, trackIndex: number, value: number) {
    const setter = player === 1 ? setPlayer1 : setPlayer2;
    setter(p => {
      const newAllocations = [...p.allocations] as [number, number, number, number, number];
      newAllocations[trackIndex] = value;
      return { ...p, allocations: newAllocations };
    });
  }

  // Submit round
  async function submitRound(player: 1 | 2) {
    const state = player === 1 ? player1 : player2;
    const setter = player === 1 ? setPlayer1 : setPlayer2;
    const tag = player === 1 ? '[P1]' : '[P2]';

    if (!state.wallet || !state.account || !state.contract) return;

    const total = state.allocations.reduce((sum, v) => sum + v, 0);
    if (total >= 10) {
      setter(p => ({ ...p, status: `Points must be < 10 (currently ${total})` }));
      return;
    }

    setter(p => ({ ...p, loading: true, status: `Submitting round ${state.currentRound}...` }));
    addLog(`${tag} Submitting round ${state.currentRound} [${state.allocations.join(', ')}]...`, 'pending');

    try {
      await playRound(
        state.contract,
        state.account!,
        gameId,
        state.currentRound,
        state.allocations
      );
      addLog(`${tag} Round ${state.currentRound} submitted`, 'success');

      const newRound = state.currentRound + 1;
      setter(p => ({
        ...p,
        loading: false,
        status: newRound > TOTAL_ROUNDS ? 'All rounds complete!' : `Round ${newRound}`,
        currentRound: newRound,
        roundsSubmitted: [...p.roundsSubmitted, state.currentRound],
        allocations: [2, 2, 2, 2, 1], // Reset for next round
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setter(p => ({ ...p, loading: false, status: `Error: ${msg}` }));
      addLog(`${tag} Error: ${msg}`, 'error');
    }
  }

  // Reveal scores
  async function revealScores(player: 1 | 2) {
    const state = player === 1 ? player1 : player2;
    const setter = player === 1 ? setPlayer1 : setPlayer2;
    const tag = player === 1 ? '[P1]' : '[P2]';

    if (!state.wallet || !state.account || !state.contract) return;

    setter(p => ({ ...p, loading: true, status: 'Revealing scores...' }));
    addLog(`${tag} Revealing scores...`, 'pending');

    try {
      await finishGame(state.contract, state.account!, gameId);
      addLog(`${tag} Scores revealed`, 'success');

      setter(p => ({
        ...p,
        loading: false,
        status: 'Scores revealed!',
        hasRevealed: true,
      }));

      // Check if both revealed
      const otherState = player === 1 ? player2 : player1;
      if (otherState.hasRevealed) {
        setPhase('finished');
        addLog('Both players revealed - ready to finalize!', 'info');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setter(p => ({ ...p, loading: false, status: `Error: ${msg}` }));
      addLog(`${tag} Error: ${msg}`, 'error');
    }
  }

  // Finalize game
  async function handleFinalize() {
    if (!player1.wallet || !player1.account || !player1.contract) return;

    setPlayer1(p => ({ ...p, loading: true, status: 'Finalizing game...' }));
    addLog('[P1] Finalizing game and determining winner...', 'pending');

    try {
      await finalizeGame(player1.contract, player1.account!, gameId);
      addLog('Game finalized!', 'success');
      setWinner('Check contract events for winner!');
      setPlayer1(p => ({ ...p, loading: false, status: 'Game complete!' }));
      setPlayer2(p => ({ ...p, status: 'Game complete!' }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPlayer1(p => ({ ...p, loading: false, status: `Error: ${msg}` }));
      addLog(`Error: ${msg}`, 'error');
    }
  }

  // Check for phase transitions when player state changes.
  // Uses functional setPhase to avoid a stale-closure on `phase`.
  useEffect(() => {
    const bothDone = player1.currentRound > TOTAL_ROUNDS && player2.currentRound > TOTAL_ROUNDS;
    const bothRevealed = player1.hasRevealed && player2.hasRevealed;

    setPhase(prev => {
      if (prev === 'playing' && bothDone) return 'reveal';
      if (prev === 'reveal' && bothRevealed) return 'finished';
      return prev;
    });
  }, [player1.currentRound, player2.currentRound, player1.hasRevealed, player2.hasRevealed]);

  return (
    <div className="two-player-local">
      <div className="game-header">
        <h2>Two-Player Local Mode</h2>
        {contract && (
          <div className="game-info">
            <span>Contract: {contract.address.toString().slice(0, 12)}...</span>
            <span>Game ID: {gameId.toString()}</span>
            <span className="phase-badge">{phase.toUpperCase()}</span>
          </div>
        )}
      </div>

      <div className="players-container">
        {/* Player 1 Panel */}
        <div className={`player-panel ${player1.loading ? 'loading' : ''}`}>
          <div className="player-header">
            <h3>Player 1</h3>
            {player1.account && (
              <span className="player-address">{player1.account.toString().slice(0, 10)}...</span>
            )}
          </div>

          {player1.status && <p className="player-status">{player1.status}</p>}

          {!player1.connected && (
            <button onClick={connectPlayer1} disabled={player1.loading}>
              {player1.loading ? 'Connecting...' : 'Connect Account #1'}
            </button>
          )}

          {player1.connected && phase === 'setup' && !contract && (
            <button onClick={handleCreateGame} disabled={player1.loading}>
              {player1.loading ? 'Creating...' : 'Deploy Contract & Create Game'}
            </button>
          )}

          {phase === 'playing' && player1.currentRound <= TOTAL_ROUNDS && (
            <PlayerGameBoard
              allocations={player1.allocations}
              currentRound={player1.currentRound}
              loading={player1.loading}
              onUpdateAllocation={(i, v) => updateAllocation(1, i, v)}
              onSubmit={() => submitRound(1)}
            />
          )}

          {phase === 'playing' && player1.currentRound > TOTAL_ROUNDS && (
            <div className="waiting-message">Waiting for Player 2 to finish...</div>
          )}

          {phase === 'reveal' && !player1.hasRevealed && (
            <button onClick={() => revealScores(1)} disabled={player1.loading}>
              {player1.loading ? 'Revealing...' : 'Reveal Scores'}
            </button>
          )}

          {phase === 'reveal' && player1.hasRevealed && (
            <div className="revealed-badge">Scores Revealed</div>
          )}

          {phase === 'finished' && !winner && (
            <button onClick={handleFinalize} disabled={player1.loading}>
              {player1.loading ? 'Finalizing...' : 'Finalize Game'}
            </button>
          )}

          {winner && <div className="winner-badge">{winner}</div>}
        </div>

        {/* Player 2 Panel */}
        <div className={`player-panel ${player2.loading ? 'loading' : ''}`}>
          <div className="player-header">
            <h3>Player 2</h3>
            {player2.account && (
              <span className="player-address">{player2.account.toString().slice(0, 10)}...</span>
            )}
          </div>

          {player2.status && <p className="player-status">{player2.status}</p>}

          {!player2.connected && (
            <button onClick={connectPlayer2} disabled={player2.loading || !player1.connected}>
              {player2.loading ? 'Connecting...' : 'Connect Account #2'}
            </button>
          )}

          {player2.connected && phase === 'setup' && contract && (
            <button onClick={handleJoinGame} disabled={player2.loading}>
              {player2.loading ? 'Joining...' : 'Join Game'}
            </button>
          )}

          {phase === 'playing' && player2.currentRound <= TOTAL_ROUNDS && (
            <PlayerGameBoard
              allocations={player2.allocations}
              currentRound={player2.currentRound}
              loading={player2.loading}
              onUpdateAllocation={(i, v) => updateAllocation(2, i, v)}
              onSubmit={() => submitRound(2)}
            />
          )}

          {phase === 'playing' && player2.currentRound > TOTAL_ROUNDS && (
            <div className="waiting-message">Waiting for Player 1 to finish...</div>
          )}

          {phase === 'reveal' && !player2.hasRevealed && (
            <button onClick={() => revealScores(2)} disabled={player2.loading}>
              {player2.loading ? 'Revealing...' : 'Reveal Scores'}
            </button>
          )}

          {phase === 'reveal' && player2.hasRevealed && (
            <div className="revealed-badge">Scores Revealed</div>
          )}

          {phase === 'finished' && (
            <div className="finished-message">
              {winner ? winner : 'Waiting for finalization...'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Sub-component for the game board
function PlayerGameBoard({
  allocations,
  currentRound,
  loading,
  onUpdateAllocation,
  onSubmit,
}: {
  allocations: [number, number, number, number, number];
  currentRound: number;
  loading: boolean;
  onUpdateAllocation: (index: number, value: number) => void;
  onSubmit: () => void;
}) {
  const total = allocations.reduce((sum, v) => sum + v, 0);

  return (
    <div className="player-game-board">
      <div className="round-indicator">Round {currentRound} of {TOTAL_ROUNDS}</div>
      <div className="tracks-compact">
        {TRACK_NAMES.map((name, i) => (
          <div key={i} className="track-row">
            <span className="track-name">{name}</span>
            <input
              type="range"
              min={0}
              max={MAX_POINTS_PER_ROUND}
              value={allocations[i]}
              onChange={(e) => onUpdateAllocation(i, Number(e.target.value))}
              disabled={loading}
            />
            <span className="track-value">{allocations[i]}</span>
          </div>
        ))}
      </div>
      <div className={`total-display ${total >= 10 ? 'over-limit' : ''}`}>
        Total: {total} / {MAX_POINTS_PER_ROUND}
      </div>
      <button onClick={onSubmit} disabled={loading || total >= 10}>
        {loading ? 'Submitting...' : 'Submit Round'}
      </button>
    </div>
  );
}
