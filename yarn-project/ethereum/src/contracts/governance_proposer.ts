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
import { type PayloadProposalStatus, ReadOnlyGovernanceContract, extractProposalIdFromLogs } from './governance.js';

export class GovernanceProposerContract implements IEmpireBase {
  private readonly proposer: GetContractReturnType<typeof GovernanceProposerAbi, ViemClient>;

  /**
   * Cache of bytecode-existence checks keyed by payload address. The check is stable for a
   * contract's lifetime -- a contract either has code or it does not, and code cannot be removed
   * after deployment (selfdestruct aside, which is not relevant here). Safe to memoize
   * indefinitely for the lifetime of this instance.
   */
  private readonly emptyPayloadCache: Map<Hex, boolean> = new Map();

  constructor(
    public readonly client: ViemClient,
    address: Hex | EthAddress,
  ) {
    if (address instanceof EthAddress) {
      address = address.toString();
    }
    this.proposer = getContract({ address, abi: GovernanceProposerAbi, client });
  }

  public get address(): EthAddress {
    return EthAddress.fromString(this.proposer.address);
  }

  public async getRollupAddress(): Promise<EthAddress> {
    return EthAddress.fromString(await this.proposer.read.getInstance());
  }

  @memoize
  public async getRegistryAddress(): Promise<EthAddress> {
    return EthAddress.fromString(await this.proposer.read.REGISTRY());
  }

  public getQuorumSize(): Promise<bigint> {
    return this.proposer.read.QUORUM_SIZE();
  }

  public getRoundSize(): Promise<bigint> {
    return this.proposer.read.ROUND_SIZE();
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
      (await this.getRollupAddress()).toString(),
      this.address.toString(),
      chainId,
    );
    return {
      to: this.address.toString(),
      abi: GovernanceProposerAbi,
      data: encodeSignalWithSignature(payload, signature),
    };
  }

  /**
   * Resolves the Governance contract this proposer submits winners to. Lazily reads
   * `GovernanceProposer.getGovernance()` (which itself looks the address up via the registry) and
   * memoizes the resulting wrapper.
   */
  @memoize
  public async getGovernance(): Promise<ReadOnlyGovernanceContract> {
    const address = await this.proposer.read.getGovernance();
    return new ReadOnlyGovernanceContract(address, this.client);
  }

  /**
   * Classifies the given original payload against the Governance proposal history (`'live'` /
   * `'executed'` / `'none'`). Delegates to `ReadOnlyGovernanceContract.getPayloadProposalStatus`,
   * which implements the actual sweep against the Governance contract -- this method exists only as
   * a convenience wrapper so callers that already hold a GovernanceProposer reference don't have to
   * resolve the Governance address themselves.
   */
  public async getPayloadProposalStatus(payload: Hex): Promise<PayloadProposalStatus> {
    const governance = await this.getGovernance();
    return governance.getPayloadProposalStatus(payload);
  }

  /**
   * Returns true if the given payload address has no deployed bytecode. Used as a cheap
   * pre-flight check before casting a governance signal — voting for a zero-code address
   * is unrecoverable.
   *
   * We only cache the `false` result (address has bytecode). The `true` result is NOT
   * cached because a CREATE2-redeployed address could go from empty to populated, and
   * caching `true` would make us keep skipping a payload that later becomes valid.
   */
  public async isPayloadEmpty(payload: EthAddress): Promise<boolean> {
    const key = payload.toString() as Hex;
    if (this.emptyPayloadCache.get(key) === false) {
      return false;
    }
    const code = await this.client.getCode({ address: key });
    const isEmpty = !code || code === '0x';
    if (!isEmpty) {
      this.emptyPayloadCache.set(key, false);
    }
    return isEmpty;
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
