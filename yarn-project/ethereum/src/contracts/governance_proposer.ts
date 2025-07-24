import { memoize } from '@aztec/foundation/decorators';
import { EthAddress } from '@aztec/foundation/eth-address';
import { GovernanceProposerAbi } from '@aztec/l1-artifacts/GovernanceProposerAbi';

import { type GetContractReturnType, type Hex, type TransactionReceipt, encodeFunctionData, getContract } from 'viem';

import type { GasPrice, L1TxRequest, L1TxUtils } from '../l1_tx_utils.js';
import type { ViemClient } from '../types.js';
import { type IEmpireBase, encodeSignal, encodeSignalWithSignature, signSignalWithSig } from './empire_base.js';
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
    return this.proposer.read.QUORUM_SIZE();
  }

  public getRoundSize(): Promise<bigint> {
    return this.proposer.read.ROUND_SIZE();
  }

  public computeRound(slot: bigint): Promise<bigint> {
    return this.proposer.read.computeRound([slot]);
  }

  public getNonce(proposer: Hex): Promise<bigint> {
    return this.proposer.read.nonces([proposer]);
  }

  public async getRoundInfo(
    rollupAddress: Hex,
    round: bigint,
  ): Promise<{ lastSignalSlot: bigint; payloadWithMostSignals: Hex; executed: boolean }> {
    return await this.proposer.read.getRoundData([rollupAddress, round]);
  }

  public getPayloadSignals(rollupAddress: Hex, round: bigint, payload: Hex): Promise<bigint> {
    return this.proposer.read.signalCount([rollupAddress, round, payload]);
  }

  public createSignalRequest(payload: Hex): L1TxRequest {
    return {
      to: this.address.toString(),
      data: encodeSignal(payload),
    };
  }

  public async createSignalRequestWithSignature(
    payload: Hex,
    round: bigint,
    chainId: number,
    signerAddress: Hex,
    signer: (msg: Hex) => Promise<Hex>,
  ): Promise<L1TxRequest> {
    const nonce = await this.getNonce(signerAddress);
    const signature = await signSignalWithSig(signer, payload, nonce, round, this.address.toString(), chainId);
    return {
      to: this.address.toString(),
      data: encodeSignalWithSignature(payload, signature),
    };
  }

  public async submitRoundWinner(
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
        functionName: 'submitRoundWinner',
        args: [round],
      }),
    });
    const proposalId = extractProposalIdFromLogs(receipt.logs);
    return { receipt, gasPrice, proposalId };
  }
}
