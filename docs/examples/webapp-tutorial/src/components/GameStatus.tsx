// docs:start:game-status
import React from 'react';
import { AztecAddress } from '@aztec/aztec.js/addresses';

interface GameStatusProps {
  account: AztecAddress;
  gameId: bigint;
  currentRound: number;
}

// docs:start:game-status-component
/**
 * Displays the current game status.
 *
 * In the Pod Racing contract, round progress is tracked publicly
 * (which round each player is on), but point allocations are private.
 * The currentRound is tracked locally in React state and incremented
 * after each successful play_round transaction.
 */
export function GameStatus({ account, gameId, currentRound }: GameStatusProps) {
  const addr = account.toString();
  const display = `${addr.slice(0, 10)}...${addr.slice(-6)}`;

  return (
    <div className="game-status">
      <h3>Game Status</h3>
      <p>Game ID: {gameId.toString()}</p>
      <p>Playing as: {display}</p>
      <p>Current Round: {currentRound} / 3</p>
      <p className="privacy-note">
        Your point allocations are stored as private notes.
        Opponents cannot see your strategy until you reveal scores.
      </p>
    </div>
  );
}
// docs:end:game-status-component
// docs:end:game-status
