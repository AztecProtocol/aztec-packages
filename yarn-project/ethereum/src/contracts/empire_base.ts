import type { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { EmpireBaseAbi } from '@aztec/l1-artifacts/EmpireBaseAbi';

import { type Hex, type TypedDataDefinition, encodeFunctionData } from 'viem';

import type { L1TxRequest } from '../l1_tx_utils/index.js';

export interface IEmpireBase {
  get address(): EthAddress;
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
    signer: (msg: TypedDataDefinition) => Promise<Hex>,
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
  signer: (msg: TypedDataDefinition) => Promise<Hex>,
  payload: Hex,
  slot: bigint,
  instance: Hex,
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
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    Signal: [
      { name: 'payload', type: 'address' },
      { name: 'slot', type: 'uint256' },
      { name: 'instance', type: 'address' },
    ],
  };

  const message = {
    payload,
    slot,
    instance,
  };

  const typedData = { domain, types, primaryType: 'Signal', message };
  return Signature.fromString(await signer(typedData));
}
