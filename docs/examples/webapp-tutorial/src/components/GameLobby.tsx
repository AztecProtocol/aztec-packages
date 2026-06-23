// docs:start:game-lobby-imports
import React, { useState } from 'react';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Wallet } from '@aztec/aztec.js/wallet';
import type { PodRacingContract } from '../artifacts/PodRacing';
import { deployContract, createGame, joinGame, attachToContract } from '../contract';
import { useTransactionLog } from './TransactionLog';

interface GameLobbyProps {
  wallet: Wallet;
  account: AztecAddress;
  onGameJoined: (contract: PodRacingContract, gameId: bigint) => void;
}
// docs:end:game-lobby-imports

export function GameLobby({ wallet, account, onGameJoined }: GameLobbyProps) {
  const [status, setStatus] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [gameId, setGameId] = useState('1');
  const [joinGameIdInput, setJoinGameIdInput] = useState('');
  const [joinContractAddress, setJoinContractAddress] = useState('');
  const { addLog } = useTransactionLog();

  // docs:start:handle-create
  async function handleCreateGame() {
    setIsCreating(true);
    setStatus('Deploying Pod Racing contract...');
    addLog('Starting contract deployment...', 'pending');
    try {
      let gId: bigint;
      try {
        gId = BigInt(gameId);
        if (gId <= 0n) throw new Error('must be positive');
      } catch {
        setStatus('Invalid game ID — enter a positive integer');
        setIsCreating(false);
        return;
      }

      addLog('Compiling and sending deployment transaction...', 'pending');
      const contract = await deployContract(wallet, account);
      addLog(`Contract deployed at ${contract.address.toString()}`, 'success');

      setStatus('Creating game...');
      addLog('Creating game...', 'pending');
      const receipt = await createGame(contract, account, gId);
      addLog(`Game ${gId} created successfully`, 'success', receipt.receipt.txHash?.toString());

      setStatus(`Game created! Share contract address: ${contract.address}`);
      onGameJoined(contract, gId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${msg}`);
      addLog(`Error: ${msg}`, 'error');
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
    addLog('Attaching to existing contract...', 'pending');
    try {
      let gId: bigint;
      try {
        gId = BigInt(joinGameIdInput);
        if (gId <= 0n) throw new Error('must be positive');
      } catch {
        setStatus('Invalid game ID — enter a positive integer');
        setIsJoining(false);
        return;
      }

      const contractAddr = AztecAddress.fromStringUnsafe(joinContractAddress);
      const contract = await attachToContract(
        wallet,
        contractAddr
      );
      addLog(`Attached to contract ${contractAddr.toString()}`, 'info');
      addLog(`Joining game ${gId}...`, 'pending');
      const receipt = await joinGame(contract, account, gId);
      addLog(`Joined game ${gId} successfully`, 'success', receipt.receipt.txHash?.toString());

      setStatus('Joined game!');
      onGameJoined(contract, gId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${msg}`);
      addLog(`Error joining game: ${msg}`, 'error');
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
