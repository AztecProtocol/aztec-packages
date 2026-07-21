import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Wallet } from '@aztec/aztec.js/wallet';
// @ts-ignore — generated artifact, may not exist until compiled
import { PodRacingContract, PodRacingContractArtifact } from './artifacts/PodRacing';
import { createSponsoredFeePayment } from './fees';
import { EmbeddedWallet } from './embedded-wallet';

/**
 * Deploys a new Pod Racing contract.
 * The deployer becomes the game admin.
 */
export async function deployContract(wallet: Wallet, deployer: AztecAddress): Promise<PodRacingContract> {
  const paymentMethod = await createSponsoredFeePayment();
  const { contract } = await PodRacingContract.deploy(wallet, deployer)
    .send({ from: deployer, fee: { paymentMethod } });

  console.log('Pod Racing contract deployed at:', contract.address.toString());
  return contract;
}

/**
 * Attaches to an existing deployed Pod Racing contract.
 * Registers the contract with PXE so private functions can execute locally.
 */
export async function attachToContract(
  wallet: Wallet,
  contractAddress: AztecAddress
) {
  if (wallet instanceof EmbeddedWallet) {
    await wallet.registerContractFromNode(contractAddress, PodRacingContractArtifact);
  }
  return PodRacingContract.at(contractAddress, wallet);
}

/**
 * Creates a new game with the given game_id.
 */
export async function createGame(
  contract: PodRacingContract,
  from: AztecAddress,
  gameId: bigint
) {
  const paymentMethod = await createSponsoredFeePayment();
  const receipt = await contract.methods
    .create_game(gameId)
    .send({ from, fee: { paymentMethod } });

  console.log('Game created, tx hash:', receipt.receipt.txHash.toString());
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
  const paymentMethod = await createSponsoredFeePayment();
  const receipt = await contract.methods
    .join_game(gameId)
    .send({ from, fee: { paymentMethod } });

  console.log('Joined game, tx hash:', receipt.receipt.txHash.toString());
  return receipt;
}

/**
 * Allocates points to 5 tracks for a round (private transaction).
 */
export async function playRound(
  contract: PodRacingContract,
  from: AztecAddress,
  gameId: bigint,
  round: number,
  tracks: [number, number, number, number, number]
) {
  const paymentMethod = await createSponsoredFeePayment();
  const receipt = await contract.methods
    .play_round(gameId, round, tracks[0], tracks[1], tracks[2], tracks[3], tracks[4])
    .send({ from, fee: { paymentMethod } });

  console.log('Round played, tx hash:', receipt.receipt.txHash.toString());
  return receipt;
}

/**
 * Reveals your total scores per track after all rounds are played.
 */
export async function finishGame(
  contract: PodRacingContract,
  from: AztecAddress,
  gameId: bigint
) {
  const paymentMethod = await createSponsoredFeePayment();
  const receipt = await contract.methods
    .finish_game(gameId)
    .send({ from, fee: { paymentMethod } });

  console.log('Game finished (scores revealed), tx hash:', receipt.receipt.txHash.toString());
  return receipt;
}

/**
 * Determines the winner after both players have revealed.
 */
export async function finalizeGame(
  contract: PodRacingContract,
  from: AztecAddress,
  gameId: bigint
) {
  const paymentMethod = await createSponsoredFeePayment();
  const receipt = await contract.methods
    .finalize_game(gameId)
    .send({ from, fee: { paymentMethod } });

  console.log('Game finalized, tx hash:', receipt.receipt.txHash.toString());
  return receipt;
}
