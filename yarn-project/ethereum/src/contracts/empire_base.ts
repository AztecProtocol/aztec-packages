import { Signature } from '@aztec/foundation/eth-signature';
import { EmpireBaseAbi } from '@aztec/l1-artifacts/EmpireBaseAbi';

import { type Hex, encodeFunctionData, hashTypedData } from 'viem';

import type { L1TxRequest } from '../l1_tx_utils.js';

export interface IEmpireBase {
  getRoundInfo(
    rollupAddress: Hex,
    round: bigint,
  ): Promise<{ lastSignalSlot: bigint; payloadWithMostSignals: Hex; executed: boolean }>;
  computeRound(slot: bigint): Promise<bigint>;
  createSignalRequest(payload: Hex): L1TxRequest;
  createSignalRequestWithSignature(
    payload: Hex,
    round: bigint,
    chainId: number,
    signerAddress: Hex,
    signer: (msg: Hex) => Promise<Hex>,
  ): Promise<L1TxRequest>;
}

export function encodeSignal(payload: Hex): Hex {
  return encodeFunctionData({
    abi: EmpireBaseAbi,
    functionName: 'signal',
    args: [payload],
  });
}

export function encodeSignalWithSignature(payload: Hex, signature: Signature) {
  return encodeFunctionData({
    abi: EmpireBaseAbi,
    functionName: 'signalWithSig',
    args: [payload, signature.toViemSignature()],
  });
}

/**
 * Signs a signal proposal using EIP-712 typed data for use with signalWithSig
 * @param walletClient - The viem wallet client to sign with
 * @param payload - The payload address to signal
 * @param verifyingContract - The address of the EmpireBase contract
 * @param chainId - The chain ID where the contract is deployed
 * @param account - The account to sign with (optional if hoisted on wallet client)
 * @returns The EIP-712 signature
 */
export async function signSignalWithSig(
  signer: (msg: Hex) => Promise<Hex>,
  payload: Hex,
  nonce: bigint,
  round: bigint,
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
    Signal: [
      { name: 'payload', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'round', type: 'uint256' },
    ],
  };

  const message = {
    payload,
    nonce,
    round,
  };

  const msg = hashTypedData({ domain, types, primaryType: 'Signal', message });
  return Signature.fromString(await signer(msg));
}
