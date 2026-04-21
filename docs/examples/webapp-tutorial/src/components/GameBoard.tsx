import React, { useState } from 'react';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { PodRacingContract } from '../artifacts/PodRacing';
import { playRound, finishGame, finalizeGame } from '../contract';
import { TRACK_NAMES, MAX_POINTS_PER_ROUND, TOTAL_ROUNDS } from '../game-constants';
import { useTransactionLog } from './TransactionLog';

interface GameBoardProps {
  contract: PodRacingContract;
  account: AztecAddress;
  gameId: bigint;
  currentRound: number;
  onRoundPlayed: () => void;
}

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
  const { addLog } = useTransactionLog();

  function updateAllocation(trackIndex: number, value: number) {
    const newAllocations = [...allocations] as [number, number, number, number, number];
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
    addLog(`Round ${currentRound}: Submitting allocation [${allocations.join(', ')}]...`, 'pending');
    try {
      addLog('Building private transaction proof...', 'pending');
      const receipt = await playRound(contract, account, gameId, currentRound, allocations);
      addLog(`Round ${currentRound} submitted successfully`, 'success', receipt.receipt.txHash?.toString());
      setStatus('Round submitted!');
      setAllocations([2, 2, 2, 2, 1]);
      onRoundPlayed();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${msg}`);
      addLog(`Error submitting round: ${msg}`, 'error');
    } finally {
      setLoading(false);
    }
  }
  // docs:end:submit-round

  // docs:start:finish-and-finalize
  async function handleFinishGame() {
    setLoading(true);
    setStatus('Revealing your total scores...');
    addLog('Revealing scores (finish_game)...', 'pending');
    try {
      addLog('Reading private notes and computing totals...', 'pending');
      const receipt = await finishGame(contract, account, gameId);
      addLog('Scores revealed successfully', 'success', receipt.receipt.txHash?.toString());
      setStatus('Scores revealed! Waiting for opponent to reveal, then finalize.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${msg}`);
      addLog(`Error revealing scores: ${msg}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleFinalizeGame() {
    setLoading(true);
    setStatus('Determining winner...');
    addLog('Finalizing game and determining winner...', 'pending');
    try {
      const receipt = await finalizeGame(contract, account, gameId);
      addLog('Game finalized! Winner determined.', 'success', receipt.receipt.txHash?.toString());
      setStatus('Game finalized! Winner determined.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${msg}`);
      addLog(`Error finalizing game: ${msg}`, 'error');
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
