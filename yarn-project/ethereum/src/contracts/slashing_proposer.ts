import type { L1TxRequest } from '@aztec/ethereum/l1-tx-utils';
import type { ViemClient } from '@aztec/ethereum/types';
import { mergeAbis, tryExtractEvent } from '@aztec/ethereum/utils';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { memoize } from '@aztec/foundation/decorators';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { createLogger } from '@aztec/foundation/log';
import { hexToBuffer } from '@aztec/foundation/string';
import { SlasherAbi } from '@aztec/l1-artifacts/SlasherAbi';
import { SlashingProposerAbi } from '@aztec/l1-artifacts/SlashingProposerAbi';

import {
  type GetContractReturnType,
  type Hex,
  type Log,
  type TypedDataDefinition,
  encodeFunctionData,
  getContract,
} from 'viem';

import { type WatchContractEventOptions, watchContractEvent } from './watch_event.js';

/**
 * Wrapper around the SlashingProposer contract that provides
 * a TypeScript interface for interacting with the consensus-based slashing system.
 */
export class SlashingProposerContract {
  private readonly contract: GetContractReturnType<typeof SlashingProposerAbi, ViemClient>;
  private readonly logger = createLogger('ethereum:slashing_proposer');

  /**
   * Slash target validators of the last round asked for. Safe to cache because a round's targets are the committees
   * of epochs that had already ended when the round opened (see SLASH_OFFSET_IN_ROUNDS), and those committees are
   * sampled from validator set and randao snapshots taken before the epoch started, so they cannot change while the
   * round is live. The promise is cached rather than the result, so concurrent callers share one in-flight read.
   */
  private slashTargetValidators: { round: bigint; validators: Promise<EthAddress[]> } | undefined;

  constructor(
    public readonly client: ViemClient,
    address: Hex | EthAddress,
  ) {
    this.contract = getContract({
      address: typeof address === 'string' ? address : address.toString(),
      abi: SlashingProposerAbi,
      client,
    });
  }

  public get address() {
    return EthAddress.fromString(this.contract.address);
  }

  public getQuorumSize(): Promise<bigint> {
    return this.contract.read.QUORUM();
  }

  public getRoundSize(): Promise<bigint> {
    return this.contract.read.ROUND_SIZE();
  }

  public getCommitteeSize(): Promise<bigint> {
    return this.contract.read.COMMITTEE_SIZE();
  }

  public getRoundSizeInEpochs(): Promise<bigint> {
    return this.contract.read.ROUND_SIZE_IN_EPOCHS();
  }

  public getLifetimeInRounds(): Promise<bigint> {
    return this.contract.read.LIFETIME_IN_ROUNDS();
  }

  public getExecutionDelayInRounds(): Promise<bigint> {
    return this.contract.read.EXECUTION_DELAY_IN_ROUNDS();
  }

  /** Returns the slash amounts for the three slash unit levels. Immutable on the contract, so memoized. */
  @memoize
  public getSlashingAmounts(): Promise<[bigint, bigint, bigint]> {
    return Promise.all([
      this.contract.read.SLASH_AMOUNT_SMALL(),
      this.contract.read.SLASH_AMOUNT_MEDIUM(),
      this.contract.read.SLASH_AMOUNT_LARGE(),
    ]);
  }

  public getSlashOffsetInRounds(): Promise<bigint> {
    return this.contract.read.SLASH_OFFSET_IN_ROUNDS();
  }

  public getCurrentRound(): Promise<bigint> {
    return this.contract.read.getCurrentRound();
  }

  /**
   * Get round information
   * @param round - The round number to query
   * @returns Round status information
   */
  public async getRound(round: bigint): Promise<{
    isExecuted: boolean;
    voteCount: bigint;
  }> {
    const [isExecuted, voteCount] = await this.contract.read.getRound([round]);
    return { isExecuted, voteCount };
  }

  /**
   * Check if a round is ready to execute at a given slot
   * @param round - The round number to check
   * @param slot - The slot number to check at
   * @returns Whether the round is ready to execute
   */
  public async isRoundReadyToExecute(round: bigint, slot: SlotNumber): Promise<boolean> {
    return await this.contract.read.isRoundReadyToExecute([round, BigInt(slot)]);
  }

  /** Returns the slash actions and payload address for a given round (zero if no slash actions) */
  public async getPayload(
    round: bigint,
  ): Promise<{ actions: { slashAmount: bigint; validator: EthAddress }[]; address: EthAddress }> {
    const { result: committees } = await this.contract.simulate.getSlashTargetCommittees([round]);
    const tally = await this.contract.read.getTally([round, committees]);
    const address = await this.contract.read.getPayloadAddress([round, tally]);
    const actions = this.mapSlashActions(tally);
    return { actions, address: EthAddress.fromString(address) };
  }

  /** Returns the slash actions to be executed for a given round based on votes */
  public async getTally(
    round: bigint,
  ): Promise<{ actions: { slashAmount: bigint; validator: EthAddress }[]; committees: EthAddress[][] }> {
    const { result: committees } = await this.contract.simulate.getSlashTargetCommittees([round]);
    const tally = await this.contract.read.getTally([round, committees]);
    return { actions: this.mapSlashActions(tally), committees: committees.map(c => c.map(EthAddress.fromString)) };
  }

  private mapSlashActions(
    actions: readonly { slashAmount: bigint; validator: Hex }[],
  ): { slashAmount: bigint; validator: EthAddress }[] {
    return actions.map(({ validator, slashAmount }) => ({
      validator: EthAddress.fromString(validator),
      slashAmount,
    }));
  }

  /** Tries to extract a VoteCast event from the given logs. */
  public tryExtractVoteCastEvent(logs: Log[]) {
    return tryExtractEvent(logs, this.address.toString(), SlashingProposerAbi, 'VoteCast');
  }

  /** Tries to extract a RoundExecuted event from the given logs. */
  public tryExtractRoundExecutedEvent(logs: Log[]) {
    return tryExtractEvent(logs, this.address.toString(), SlashingProposerAbi, 'RoundExecuted');
  }

  /**
   * Create a transaction to vote for slashing offenses
   * @param votes - The encoded votes for slashing
   * @param slot - The slot number for the vote
   * @param signer - The signer to produce the signature
   * @returns L1 transaction request
   */
  public async buildVoteRequestFromSigner(
    votes: Hex,
    slot: SlotNumber,
    signer: (msg: TypedDataDefinition) => Promise<Hex>,
  ): Promise<L1TxRequest> {
    const typedData = this.buildVoteTypedData(votes, slot);
    const signature = Signature.fromString(await signer(typedData));

    return {
      to: this.contract.address,
      abi: SlashingProposerAbi,
      data: encodeFunctionData({
        abi: SlashingProposerAbi,
        functionName: 'vote',
        args: [votes, signature.toViemSignature()],
      }),
    };
  }

  /** Returns the typed data definition to EIP712-sign for voting */
  public buildVoteTypedData(votes: Hex, slot: SlotNumber): TypedDataDefinition {
    const domain = {
      name: 'SlashingProposer',
      version: '1',
      chainId: this.client.chain.id,
      verifyingContract: this.contract.address,
    };

    const types = {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Vote: [
        { name: 'votes', type: 'bytes' },
        { name: 'slot', type: 'uint256' },
      ],
    };

    return { domain, types, primaryType: 'Vote', message: { votes, slot: BigInt(slot) } };
  }

  /** Gets the digest to sign for voting directly from the contract */
  public async getVoteDataDigest(votes: Hex, slot: SlotNumber): Promise<Buffer32> {
    return Buffer32.fromString(await this.contract.read.getVoteSignatureDigest([votes, BigInt(slot)]));
  }

  /**
   * Create a transaction to vote for slashing offenses
   * @param votes - The encoded votes for slashing
   * @param signature - The signature from the current proposer
   * @returns L1 transaction request
   */
  public buildVoteRequestWithSignature(votes: Hex, signature: { v: number; r: Hex; s: Hex }): L1TxRequest {
    return {
      to: this.contract.address,
      abi: SlashingProposerAbi,
      data: encodeFunctionData({
        abi: SlashingProposerAbi,
        functionName: 'vote',
        args: [votes, signature],
      }),
    };
  }

  /**
   * Create a transaction to execute a slashing round
   * @param round - The round number to execute
   * @param committees - The committees for each epoch in the round
   * @returns L1 transaction request
   */
  public buildExecuteRoundRequest(round: bigint, committees: EthAddress[][]): L1TxRequest {
    return {
      to: this.contract.address,
      abi: mergeAbis([SlashingProposerAbi, SlasherAbi]),
      data: encodeFunctionData({
        abi: SlashingProposerAbi,
        functionName: 'executeRound',
        args: [round, committees.map(c => c.map(addr => addr.toString()))],
      }),
    };
  }

  /**
   * Returns the validators eligible to be voted against in a round, in the order votes encode them. Cached for the
   * last round asked for: reading them runs a committee sampling simulation on L1, and every vote of a round decodes
   * against the same list, so a caller walking a round's votes would otherwise repeat that call per vote. Only the
   * last round is kept since callers move forward round by round.
   */
  public getSlashTargetValidators(round: bigint): Promise<EthAddress[]> {
    const cached = this.slashTargetValidators;
    if (cached?.round === round) {
      return cached.validators;
    }

    const entry = { round, validators: this.fetchSlashTargetValidators(round) };
    this.slashTargetValidators = entry;
    // A failed read must not stay cached, or every later vote of the round would replay the same rejection
    entry.validators.catch(() => {
      if (this.slashTargetValidators === entry) {
        this.slashTargetValidators = undefined;
      }
    });
    return entry.validators;
  }

  private async fetchSlashTargetValidators(round: bigint): Promise<EthAddress[]> {
    const { result } = await this.contract.simulate.getSlashTargetCommittees([round]);
    return result.flat().map(validator => EthAddress.fromString(validator));
  }

  /**
   * Returns the slash amount voted for each target validator by a single vote of a round.
   * @param index - Position of the vote within the round, from 0 (inclusive) to the round's vote count (exclusive)
   */
  public async getVoteAt(round: bigint, index: bigint): Promise<SlashVoteTarget[]> {
    const [validators, vote, slashAmounts] = await Promise.all([
      this.getSlashTargetValidators(round),
      this.contract.read.getVotes([round, index]),
      this.getSlashingAmounts(),
    ]);
    return decodeVote(vote, validators, slashAmounts);
  }

  /** Returns the last vote emitted for a given round  */
  public async getLastVote(round: bigint) {
    const { voteCount } = await this.getRound(round);
    return await this.getVoteAt(round, voteCount - 1n);
  }

  /**
   * Listen for VoteCast events. Events are delivered by polling `eth_getLogs`: a reorg may re-emit them and
   * removals are never reported, and events mined within roughly one polling interval of subscribing may be missed.
   * @param callback - Callback function to handle vote cast events
   * @returns Unwatch function
   */
  public listenToVoteCast(
    callback: (args: { round: bigint; proposer: string }) => unknown,
    options?: WatchContractEventOptions,
  ): () => void {
    return watchContractEvent(
      this.client,
      this.logger,
      {
        address: this.contract.address,
        abi: SlashingProposerAbi,
        eventName: 'VoteCast',
        onLog: log => {
          const { round, proposer } = log.args;
          if (round !== undefined && proposer) {
            return callback({ round, proposer });
          }
        },
      },
      options,
    );
  }

  /**
   * Listen for RoundExecuted events. Events are delivered by polling `eth_getLogs`: a reorg may re-emit them and
   * removals are never reported, and events mined within roughly one polling interval of subscribing may be missed.
   * @param callback - Callback function to handle round executed events
   * @returns Unwatch function
   */
  public listenToRoundExecuted(
    callback: (args: { round: bigint; slashCount: bigint; l1BlockHash: Hex }) => unknown,
    options?: WatchContractEventOptions,
  ): () => void {
    return watchContractEvent(
      this.client,
      this.logger,
      {
        address: this.contract.address,
        abi: SlashingProposerAbi,
        eventName: 'RoundExecuted',
        onLog: log => {
          const { round, slashCount } = log.args;
          if (round !== undefined && slashCount !== undefined) {
            return callback({ round, slashCount, l1BlockHash: log.blockHash });
          }
        },
      },
      options,
    );
  }
}

/**
 * A validator targeted by a slashing vote, with the amount voted. The position is the validator's index in the
 * round's flattened slash target committees — the unit the contract tallies quorum by. A validator sitting in
 * several of the round's committees holds several positions, each with its own tally.
 */
export type SlashVoteTarget = { validator: EthAddress; slashAmount: bigint; position: number };

function decodeVote(vote: Hex, validators: EthAddress[], slashAmounts: [bigint, bigint, bigint]): SlashVoteTarget[] {
  return decodeSlashConsensusVotes(hexToBuffer(vote))
    .map((units, position) => ({
      validator: validators[position],
      slashAmount: slashAmounts[units - 1] ?? 0n,
      position,
    }))
    .filter(v => v.slashAmount > 0n);
}

/**
 * Decodes a Buffer containing slash votes back into an array of numbers.
 * Each vote is represented as a 2-bit value (0, 1, 2, or 3) representing slashing units.
 * @dev This should live in stdlib next to encodeSlashConsensusVotes but is here since we
 * do not have a dependency to stdlib from the ethereum package. We need a larger refactor to fix this.
 * @param buffer - The Buffer containing encoded slash votes
 * @returns An array of numbers representing the slash votes
 */
export function decodeSlashConsensusVotes(buffer: Buffer): number[] {
  const votes: number[] = [];
  for (let i = 0; i < buffer.length; i++) {
    const voteByte = buffer.readUInt8(i);
    // Decode votes from Solidity's bit order (LSB to MSB)
    // Bits 0-1: validator at index i*4
    // Bits 2-3: validator at index i*4+1
    // Bits 4-5: validator at index i*4+2
    // Bits 6-7: validator at index i*4+3
    votes.push((voteByte >> 0) & 0x03);
    votes.push((voteByte >> 2) & 0x03);
    votes.push((voteByte >> 4) & 0x03);
    votes.push((voteByte >> 6) & 0x03);
  }
  return votes;
}
