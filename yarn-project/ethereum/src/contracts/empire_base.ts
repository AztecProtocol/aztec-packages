import { Signature } from '@aztec/foundation/eth-signature';
import { EmpireBaseAbi } from '@aztec/l1-artifacts/EmpireBaseAbi';

import { type Hex, encodeFunctionData, hashTypedData } from 'viem';

import type { L1TxRequest } from '../l1_tx_utils.js';
import type { ExtendedViemWalletClient } from '../types.js';

export interface IEmpireBase {
  getRoundInfo(rollupAddress: Hex, round: bigint): Promise<{ lastVote: bigint; leader: Hex; executed: boolean }>;
  computeRound(slot: bigint): Promise<bigint>;
  createVoteRequest(payload: Hex): L1TxRequest;
  createVoteRequestWithSignature(
    payload: Hex,
    wallet: ExtendedViemWalletClient,
    signer: (msg: Hex) => Promise<Hex>,
  ): Promise<L1TxRequest>;
}

export function encodeVote(payload: Hex): Hex {
  return encodeFunctionData({
    abi: EmpireBaseAbi,
    functionName: 'vote',
    args: [payload],
  });
}

export function encodeVoteWithSignature(payload: Hex, signature: Signature) {
  return encodeFunctionData({
    abi: EmpireBaseAbi,
    functionName: 'voteWithSig',
    args: [payload, signature.toViemSignature()],
  });
}

/**
 * Signs a vote proposal using EIP-712 typed data for use with voteWithSig
 * @param walletClient - The viem wallet client to sign with
 * @param proposal - The proposal address to vote on
 * @param verifyingContract - The address of the EmpireBase contract
 * @param chainId - The chain ID where the contract is deployed
 * @param account - The account to sign with (optional if hoisted on wallet client)
 * @returns The EIP-712 signature
 */
export async function signVoteWithSig(
  signer: (msg: Hex) => Promise<Hex>,
  proposal: Hex,
  nonce: bigint,
  verifyingContract: Hex,
  chainId: number,
): Promise<Signature> {
  const domain = {
    name: 'EmpireBase',
    version: '1',
    chainId,
    verifyingContract,
  };

  const types = {
    Vote: [
      { name: 'proposal', type: 'address' },
      { name: 'nonce', type: 'uint256' },
    ],
  };

  const message = {
    proposal,
    nonce,
  };

  const msg = hashTypedData({ domain, types, primaryType: 'Vote', message });
  return Signature.fromString(await signer(msg));
}
