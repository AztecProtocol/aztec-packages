import { SlotNumber } from '@aztec/foundation/branded-types';
import { memoize } from '@aztec/foundation/decorators';
import { EthAddress } from '@aztec/foundation/eth-address';
import { GovernanceProposerAbi } from '@aztec/l1-artifacts/GovernanceProposerAbi';

import {
  type GetContractReturnType,
  type Hex,
  type TransactionReceipt,
  type TypedDataDefinition,
  encodeFunctionData,
  getContract,
} from 'viem';

import type { L1TxRequest, L1TxUtils } from '../l1_tx_utils/index.js';
import type { ViemClient } from '../types.js';
import { type IEmpireBase, encodeSignal, encodeSignalWithSignature, signSignalWithSig } from './empire_base.js';
import { extractProposalIdFromLogs } from './governance.js';

export class GovernanceProposerContract implements IEmpireBase {
  private readonly proposer: GetContractReturnType<typeof GovernanceProposerAbi, ViemClient>;

  constructor(
    public readonly client: ViemClient,
    address: Hex | EthAddress,
  ) {
    if (address instanceof EthAddress) {
      address = address.toString();
    }
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

  public getInstance() {
    return this.proposer.read.getInstance();
  }

  public computeRound(slot: SlotNumber): Promise<bigint> {
    return this.proposer.read.computeRound([BigInt(slot)]);
  }

  public async getRoundInfo(
    rollupAddress: Hex,
    round: bigint,
  ): Promise<{ lastSignalSlot: SlotNumber; payloadWithMostSignals: Hex; quorumReached: boolean; executed: boolean }> {
    const result = await this.proposer.read.getRoundData([rollupAddress, round]);
    const [signalCount, quorum] = await Promise.all([
      this.proposer.read.signalCount([rollupAddress, round, result.payloadWithMostSignals]),
      this.getQuorumSize(),
    ]);
    return {
      lastSignalSlot: SlotNumber.fromBigInt(result.lastSignalSlot),
      payloadWithMostSignals: result.payloadWithMostSignals,
      quorumReached: signalCount >= quorum,
      executed: result.executed,
    };
  }

  public getPayloadSignals(rollupAddress: Hex, round: bigint, payload: Hex): Promise<bigint> {
    return this.proposer.read.signalCount([rollupAddress, round, payload]);
  }

  public createSignalRequest(payload: Hex): L1TxRequest {
    return {
      to: this.address.toString(),
      abi: GovernanceProposerAbi,
      data: encodeSignal(payload),
    };
  }

  public async createSignalRequestWithSignature(
    payload: Hex,
    slot: SlotNumber,
    chainId: number,
    signerAddress: Hex,
    signer: (msg: TypedDataDefinition) => Promise<Hex>,
  ): Promise<L1TxRequest> {
    const signature = await signSignalWithSig(
      signer,
      payload,
      slot,
      await this.getInstance(),
      this.address.toString(),
      chainId,
    );
    return {
      to: this.address.toString(),
      abi: GovernanceProposerAbi,
      data: encodeSignalWithSignature(payload, signature),
    };
  }

  /** Checks if a payload was ever submitted to governance via submitRoundWinner. */
  public async hasPayloadBeenProposed(payload: Hex, fromBlock: bigint): Promise<boolean> {
    const events = await this.proposer.getEvents.PayloadSubmitted({ payload }, { fromBlock, strict: true });
    return events.length > 0;
  }

  public async submitRoundWinner(
    round: bigint,
    l1TxUtils: L1TxUtils,
  ): Promise<{
    receipt: TransactionReceipt;
    proposalId: bigint;
  }> {
    const { receipt } = await l1TxUtils.sendAndMonitorTransaction({
      to: this.address.toString(),
      abi: GovernanceProposerAbi,
      data: encodeFunctionData({
        abi: GovernanceProposerAbi,
        functionName: 'submitRoundWinner',
        args: [round],
      }),
    });
    const proposalId = extractProposalIdFromLogs(receipt.logs);
    return { receipt, proposalId };
  }
}
