// docs:start:contract
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { getContractInstanceFromInstantiationParams } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Wallet } from '@aztec/aztec.js/wallet';
// @ts-ignore — generated artifact, may not exist until compiled
import { PodRacingContract } from './artifacts/PodRacing';

// docs:start:deploy-contract
/**
 * Deploys a new Pod Racing contract.
 * The deployer becomes the game admin.
 */
export async function deployContract(wallet: Wallet, deployer: AztecAddress) {
  const contract = await PodRacingContract.deploy(wallet, deployer)
    .send({ from: deployer });

  console.log('Pod Racing contract deployed at:', contract.address.toString());
  return contract;
}
// docs:end:deploy-contract

// docs:start:attach-contract
/**
 * Attaches to an existing deployed Pod Racing contract.
 * Use this when you know the contract address (e.g., from a friend's game).
 */
export async function attachToContract(
  wallet: Wallet,
  contractAddress: AztecAddress,
  deployerAddress: AztecAddress,
  salt: Fr
) {
  const instance = await getContractInstanceFromInstantiationParams(
    PodRacingContract.artifact,
    {
      deployer: deployerAddress,
      salt,
      constructorArgs: [deployerAddress],
    }
  );
  await wallet.registerContract(instance, PodRacingContract.artifact);

  return PodRacingContract.at(contractAddress, wallet);
}
// docs:end:attach-contract

// docs:start:game-actions
/**
 * Creates a new game with the given game_id.
 * The caller becomes player1.
 */
export async function createGame(
  contract: PodRacingContract,
  from: AztecAddress,
  gameId: bigint
) {
  const receipt = await contract.methods
    .create_game(gameId)
    .send({ from });

  console.log('Game created, tx hash:', receipt.txHash.toString());
  return receipt;
}

/**
 * Joins an existing game as player2.
 */
export async function joinGame(
  contract: PodRacingContract,
  from: AztecAddress,
  gameId: bigint
) {
  const receipt = await contract.methods
    .join_game(gameId)
    .send({ from });

  console.log('Joined game, tx hash:', receipt.txHash.toString());
  return receipt;
}

/**
 * Allocates points to 5 tracks for a round (private transaction).
 * Points must sum to less than 10. Opponents cannot see your allocation.
 *
 * @param round - Which round (1, 2, or 3)
 * @param tracks - Array of 5 point values [track1, track2, track3, track4, track5]
 */
export async function playRound(
  contract: PodRacingContract,
  from: AztecAddress,
  gameId: bigint,
  round: number,
  tracks: [number, number, number, number, number]
) {
  const receipt = await contract.methods
    .play_round(gameId, round, tracks[0], tracks[1], tracks[2], tracks[3], tracks[4])
    .send({ from });

  console.log('Round played, tx hash:', receipt.txHash.toString());
  return receipt;
}

/**
 * Reveals your total scores per track after all rounds are played.
 * This reads your private round notes and publishes aggregated totals.
 */
export async function finishGame(
  contract: PodRacingContract,
  from: AztecAddress,
  gameId: bigint
) {
  const receipt = await contract.methods
    .finish_game(gameId)
    .send({ from });

  console.log('Game finished (scores revealed), tx hash:', receipt.txHash.toString());
  return receipt;
}

/**
 * Determines the winner after both players have revealed and the game has expired.
 */
export async function finalizeGame(
  contract: PodRacingContract,
  from: AztecAddress,
  gameId: bigint
) {
  const receipt = await contract.methods
    .finalize_game(gameId)
    .send({ from });

  console.log('Game finalized, tx hash:', receipt.txHash.toString());
  return receipt;
}
// docs:end:game-actions
// docs:end:contract
