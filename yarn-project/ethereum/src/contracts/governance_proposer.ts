import { memoize } from '@aztec/foundation/decorators';
import { EthAddress } from '@aztec/foundation/eth-address';
import { GovernanceProposerAbi } from '@aztec/l1-artifacts/GovernanceProposerAbi';

import { type GetContractReturnType, type Hex, type TransactionReceipt, encodeFunctionData, getContract } from 'viem';

import type { GasPrice, L1TxRequest, L1TxUtils } from '../l1_tx_utils.js';
import type { ViemClient } from '../types.js';
import { type IEmpireBase, encodeVote } from './empire_base.js';
import { extractProposalIdFromLogs } from './governance.js';

export class GovernanceProposerContract implements IEmpireBase {
  private readonly proposer: GetContractReturnType<typeof GovernanceProposerAbi, ViemClient>;

  constructor(
    public readonly client: ViemClient,
    address: Hex,
  ) {
    this.proposer = getContract({ address, abi: GovernanceProposerAbi, client });
  }

  public get address() {
    return EthAddress.fromString(this.proposer.address);
  }

  public async getRollupAddress() {
    return EthAddress.fromString(await this.proposer.read.getInstance());
  }

  @memoize
  public async getRegistryAddress() {
    return EthAddress.fromString(await this.proposer.read.REGISTRY());
  }

  public getQuorumSize(): Promise<bigint> {
    return this.proposer.read.N();
  }

  public getRoundSize(): Promise<bigint> {
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

  public getProposalVotes(rollupAddress: Hex, round: bigint, proposal: Hex): Promise<bigint> {
    return this.proposer.read.yeaCount([rollupAddress, round, proposal]);
  }

  public createVoteRequest(payload: Hex): L1TxRequest {
    return {
      to: this.address.toString(),
      data: encodeVote(payload),
    };
  }

  public async executeProposal(
    round: bigint,
    l1TxUtils: L1TxUtils,
  ): Promise<{
    receipt: TransactionReceipt;
    gasPrice: GasPrice;
    proposalId: bigint;
  }> {
    const { receipt, gasPrice } = await l1TxUtils.sendAndMonitorTransaction({
      to: this.address.toString(),
      data: encodeFunctionData({
        abi: this.proposer.abi,
        functionName: 'executeProposal',
        args: [round],
      }),
    });
    const proposalId = extractProposalIdFromLogs(receipt.logs);
    return { receipt, gasPrice, proposalId };
  }
}
