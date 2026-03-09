// docs:start:game-board
import React, { useState } from 'react';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { playRound, finishGame, finalizeGame } from '../contract';

const TRACK_NAMES = ['Straight', 'Canyon', 'Asteroid Field', 'Nebula', 'Wormhole'];
const MAX_POINTS_PER_ROUND = 9;
const TOTAL_ROUNDS = 3;

interface GameBoardProps {
  contract: any;
  account: AztecAddress;
  gameId: bigint;
  currentRound: number;
  onRoundPlayed: () => void;
}

// docs:start:game-board-component
export function GameBoard({
  contract,
  account,
  gameId,
  currentRound,
  onRoundPlayed,
}: GameBoardProps) {
  const [allocations, setAllocations] = useState<[number, number, number, number, number]>([2, 2, 2, 2, 1]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  function updateAllocation(trackIndex: number, value: number) {
    const newAllocations: [number, number, number, number, number] = [...allocations] as any;
    newAllocations[trackIndex] = value;
    setAllocations(newAllocations);
  }

  const total = allocations.reduce((sum, v) => sum + v, 0);

  // docs:start:submit-round
  async function handleSubmitRound() {
    if (total >= 10) {
      setStatus(`Points must sum to less than 10 (currently ${total})`);
      return;
    }

    setLoading(true);
    setStatus('Submitting your allocation (private transaction)...');
    try {
      await playRound(contract, account, gameId, currentRound, allocations);
      setStatus('Round submitted!');
      onRoundPlayed();
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }
  // docs:end:submit-round

  // docs:start:finish-and-finalize
  async function handleFinishGame() {
    setLoading(true);
    setStatus('Revealing your total scores...');
    try {
      await finishGame(contract, account, gameId);
      setStatus('Scores revealed! Waiting for opponent to reveal, then finalize.');
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleFinalizeGame() {
    setLoading(true);
    setStatus('Determining winner...');
    try {
      await finalizeGame(contract, account, gameId);
      setStatus('Game finalized! Winner determined.');
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }
  // docs:end:finish-and-finalize

  const allRoundsPlayed = currentRound > TOTAL_ROUNDS;

  return (
    <div className="game-board">
      <h2>{allRoundsPlayed ? 'All Rounds Played' : `Round ${currentRound} of ${TOTAL_ROUNDS}`}</h2>
      {!allRoundsPlayed && (
        <p>Allocate up to {MAX_POINTS_PER_ROUND} points across 5 tracks. Your allocation is private.</p>
      )}
      {status && <p className="status">{status}</p>}

      {!allRoundsPlayed && (
        <>
          <div className="tracks">
            {TRACK_NAMES.map((name, i) => (
              <div key={i} className="track">
                <label>{name}</label>
                <input
                  type="range"
                  min={0}
                  max={MAX_POINTS_PER_ROUND}
                  value={allocations[i]}
                  onChange={(e) => updateAllocation(i, Number(e.target.value))}
                  disabled={loading}
                />
                <span>{allocations[i]} pts</span>
              </div>
            ))}
          </div>

          <p className={`total ${total >= 10 ? 'error' : ''}`}>
            Total: {total} / {MAX_POINTS_PER_ROUND} max
          </p>

          <button onClick={handleSubmitRound} disabled={loading || total >= 10}>
            {loading ? 'Submitting...' : 'Submit Allocation'}
          </button>
        </>
      )}

      {allRoundsPlayed && (
        <div className="post-game">
          <button onClick={handleFinishGame} disabled={loading}>
            {loading ? 'Revealing...' : 'Reveal Scores (finish_game)'}
          </button>
          <button onClick={handleFinalizeGame} disabled={loading}>
            {loading ? 'Finalizing...' : 'Determine Winner (finalize_game)'}
          </button>
        </div>
      )}
    </div>
  );
}
// docs:end:game-board-component
// docs:end:game-board
