import { EmpireBaseAbi } from '@aztec/l1-artifacts/EmpireBaseAbi';

import { type Hex, encodeFunctionData } from 'viem';

import { type L1TxRequest } from '../l1_tx_utils.js';

export interface IEmpireBase {
  getRoundInfo(rollupAddress: Hex, round: bigint): Promise<{ lastVote: bigint; leader: Hex; executed: boolean }>;
  computeRound(slot: bigint): Promise<bigint>;
  createVoteRequest(payload: Hex): L1TxRequest;
}

export function encodeVote(payload: Hex): Hex {
  return encodeFunctionData({
    abi: EmpireBaseAbi,
    functionName: 'vote',
    args: [payload],
  });
}
