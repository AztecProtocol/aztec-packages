import { EthAddress } from '@aztec/foundation/eth-address';
import { SlashingProposerAbi } from '@aztec/l1-artifacts/SlashingProposerAbi';

import { type GetContractReturnType, type Hex, getContract } from 'viem';

import type { L1TxRequest } from '../l1_tx_utils.js';
import type { ViemClient } from '../types.js';
import { type IEmpireBase, encodeVote } from './empire_base.js';

export class SlashingProposerContract implements IEmpireBase {
  private readonly proposer: GetContractReturnType<typeof SlashingProposerAbi, ViemClient>;

  constructor(
    public readonly client: ViemClient,
    address: Hex,
  ) {
    this.proposer = getContract({ address, abi: SlashingProposerAbi, client });
  }

  public get address() {
    return EthAddress.fromString(this.proposer.address);
  }

  public getQuorumSize() {
    return this.proposer.read.N();
  }

  public getRoundSize() {
    return this.proposer.read.M();
  }

  public computeRound(slot: bigint): Promise<bigint> {
    return this.proposer.read.computeRound([slot]);
  }

  public async getRoundInfo(
    rollupAddress: Hex,
    round: bigint,
  ): Promise<{ lastVote: bigint; leader: Hex; executed: boolean }> {
    const roundInfo = await this.proposer.read.rounds([rollupAddress, round]);
    return {
      lastVote: roundInfo[0],
      leader: roundInfo[1],
      executed: roundInfo[2],
    };
  }

  public createVoteRequest(payload: Hex): L1TxRequest {
    return {
      to: this.address.toString(),
      data: encodeVote(payload),
    };
  }
}
