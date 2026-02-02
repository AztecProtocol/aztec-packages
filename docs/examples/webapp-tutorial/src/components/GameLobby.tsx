// docs:start:game-lobby
import React, { useState } from 'react';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { Fr } from '@aztec/aztec.js/fields';
import { deployContract, createGame, joinGame, attachToContract } from '../contract';

interface GameLobbyProps {
  wallet: Wallet;
  account: AztecAddress;
  onGameJoined: (contract: any, gameId: bigint) => void;
}

// docs:start:game-lobby-component
export function GameLobby({ wallet, account, onGameJoined }: GameLobbyProps) {
  const [status, setStatus] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [gameId, setGameId] = useState('1');
  const [joinGameIdInput, setJoinGameIdInput] = useState('');
  const [joinContractAddress, setJoinContractAddress] = useState('');

  // docs:start:handle-create
  async function handleCreateGame() {
    setIsCreating(true);
    setStatus('Deploying Pod Racing contract...');
    try {
      const contract = await deployContract(wallet, account);

      setStatus('Creating game...');
      const gId = BigInt(gameId);
      await createGame(contract, account, gId);

      setStatus(`Game created! Share contract address: ${contract.address}`);
      onGameJoined(contract, gId);
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setIsCreating(false);
    }
  }
  // docs:end:handle-create

  // docs:start:handle-join
  async function handleJoinGame() {
    if (!joinContractAddress || !joinGameIdInput) {
      setStatus('Enter contract address and game ID');
      return;
    }
    setIsJoining(true);
    setStatus('Joining game...');
    try {
      const contractAddr = AztecAddress.fromString(joinContractAddress);
      const contract = await attachToContract(
        wallet,
        contractAddr,
        AztecAddress.ZERO,
        Fr.ZERO
      );

      const gId = BigInt(joinGameIdInput);
      await joinGame(contract, account, gId);

      setStatus('Joined game!');
      onGameJoined(contract, gId);
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setIsJoining(false);
    }
  }
  // docs:end:handle-join

  return (
    <div className="game-lobby">
      <h2>Game Lobby</h2>
      {status && <p className="status">{status}</p>}

      <div className="lobby-section">
        <h3>Create New Game</h3>
        <label>
          Game ID:
          <input
            type="text"
            value={gameId}
            onChange={(e) => setGameId(e.target.value)}
            placeholder="1"
            disabled={isCreating}
          />
        </label>
        <button onClick={handleCreateGame} disabled={isCreating}>
          {isCreating ? 'Creating...' : 'Deploy Contract & Create Game'}
        </button>
      </div>

      <div className="lobby-section">
        <h3>Join Existing Game</h3>
        <label>
          Contract Address:
          <input
            type="text"
            value={joinContractAddress}
            onChange={(e) => setJoinContractAddress(e.target.value)}
            placeholder="0x..."
            disabled={isJoining}
          />
        </label>
        <label>
          Game ID:
          <input
            type="text"
            value={joinGameIdInput}
            onChange={(e) => setJoinGameIdInput(e.target.value)}
            placeholder="1"
            disabled={isJoining}
          />
        </label>
        <button onClick={handleJoinGame} disabled={isJoining}>
          {isJoining ? 'Joining...' : 'Join Game'}
        </button>
      </div>
    </div>
  );
}
// docs:end:game-lobby-component
// docs:end:game-lobby
