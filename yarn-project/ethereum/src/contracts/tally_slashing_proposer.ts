import { type L1TxRequest, type ViemClient, tryExtractEvent } from '@aztec/ethereum';
import { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { TallySlashingProposerAbi } from '@aztec/l1-artifacts/TallySlashingProposerAbi';

import EventEmitter from 'events';
import {
  type GetContractReturnType,
  type Hex,
  type Log,
  type TypedDataDefinition,
  encodeFunctionData,
  getContract,
} from 'viem';

/**
 * Wrapper around the TallySlashingProposer contract that provides
 * a TypeScript interface for interacting with the consensus-based slashing system.
 */
export class TallySlashingProposerContract extends EventEmitter {
  private readonly contract: GetContractReturnType<typeof TallySlashingProposerAbi, ViemClient>;

  public readonly type = 'tally' as const;

  constructor(
    public readonly client: ViemClient,
    address: Hex | EthAddress,
  ) {
    super();
    this.contract = getContract({
      address: typeof address === 'string' ? address : address.toString(),
      abi: TallySlashingProposerAbi,
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
    readyToExecute: boolean;
    voteCount: bigint;
  }> {
    const [isExecuted, readyToExecute, voteCount] = await this.contract.read.getRound([round]);
    return { isExecuted, readyToExecute, voteCount };
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
    return tryExtractEvent(logs, this.address.toString(), TallySlashingProposerAbi, 'VoteCast');
  }

  /** Tries to extract a RoundExecuted event from the given logs. */
  public tryExtractRoundExecutedEvent(logs: Log[]) {
    return tryExtractEvent(logs, this.address.toString(), TallySlashingProposerAbi, 'RoundExecuted');
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
    slot: bigint,
    signer: (msg: TypedDataDefinition) => Promise<Hex>,
  ): Promise<L1TxRequest> {
    const typedData = this.buildVoteTypedData(votes, slot);
    const signature = Signature.fromString(await signer(typedData));

    return {
      to: this.contract.address,
      data: encodeFunctionData({
        abi: TallySlashingProposerAbi,
        functionName: 'vote',
        args: [votes, signature.toViemSignature()],
      }),
    };
  }

  /** Returns the typed data definition to EIP712-sign for voting */
  public buildVoteTypedData(votes: Hex, slot: bigint): TypedDataDefinition {
    const domain = {
      name: 'TallySlashingProposer',
      version: '1',
      chainId: this.client.chain.id,
      verifyingContract: this.contract.address,
    };

    const types = {
      Vote: [
        { name: 'votes', type: 'bytes' },
        { name: 'slot', type: 'uint256' },
      ],
    };

    return { domain, types, primaryType: 'Vote', message: { votes, slot } };
  }

  /** Gets the digest to sign for voting directly from the contract */
  public async getVoteDataDigest(votes: Hex, slot: bigint): Promise<Buffer32> {
    return Buffer32.fromString(await this.contract.read.getVoteSignatureDigest([votes, slot]));
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
      data: encodeFunctionData({
        abi: TallySlashingProposerAbi,
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
      data: encodeFunctionData({
        abi: TallySlashingProposerAbi,
        functionName: 'executeRound',
        args: [round, committees.map(c => c.map(addr => addr.toString()))],
      }),
    };
  }

  /**
   * Listen for VoteCast events
   * @param callback - Callback function to handle vote cast events
   * @returns Unwatch function
   */
  public listenToVoteCast(callback: (args: { round: bigint; proposer: string }) => void): () => void {
    return this.contract.watchEvent.VoteCast(
      {},
      {
        onLogs: logs => {
          for (const log of logs) {
            const { round, proposer } = log.args;
            if (round !== undefined && proposer) {
              callback({ round, proposer });
            }
          }
        },
      },
    );
  }

  /**
   * Listen for RoundExecuted events
   * @param callback - Callback function to handle round executed events
   * @returns Unwatch function
   */
  public listenToRoundExecuted(
    callback: (args: { round: bigint; slashCount: bigint; l1BlockHash: Hex }) => void,
  ): () => void {
    return this.contract.watchEvent.RoundExecuted(
      {},
      {
        onLogs: logs => {
          for (const log of logs) {
            const { round, slashCount } = log.args;
            if (round !== undefined && slashCount !== undefined) {
              callback({ round, slashCount, l1BlockHash: log.blockHash });
            }
          }
        },
      },
    );
  }
}
