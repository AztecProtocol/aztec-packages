import { SlotNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { EmpireSlashingProposerAbi } from '@aztec/l1-artifacts/EmpireSlashingProposerAbi';

import EventEmitter from 'events';
import {
  type GetContractReturnType,
  type Hex,
  type Log,
  type TypedDataDefinition,
  encodeFunctionData,
  getContract,
} from 'viem';

import type { L1TxRequest, L1TxUtils } from '../l1_tx_utils/index.js';
import type { ViemClient } from '../types.js';
import { FormattedViemError, tryExtractEvent } from '../utils.js';
import { type IEmpireBase, encodeSignal, encodeSignalWithSignature, signSignalWithSig } from './empire_base.js';

export class ProposalAlreadyExecutedError extends Error {
  constructor(round: bigint) {
    super(`Proposal already executed: ${round}`);
  }
}

export class EmpireSlashingProposerContract extends EventEmitter implements IEmpireBase {
  private readonly logger = createLogger('ethereum:contracts:empire_slashing_proposer');
  private readonly proposer: GetContractReturnType<typeof EmpireSlashingProposerAbi, ViemClient>;

  public readonly type = 'empire' as const;

  constructor(
    public readonly client: ViemClient,
    address: Hex | EthAddress,
  ) {
    super();
    this.proposer = getContract({
      address: typeof address === 'string' ? address : address.toString(),
      abi: EmpireSlashingProposerAbi,
      client,
    });
  }

  public get address() {
    return EthAddress.fromString(this.proposer.address);
  }

  public getQuorumSize() {
    return this.proposer.read.QUORUM_SIZE();
  }

  public getRoundSize() {
    return this.proposer.read.ROUND_SIZE();
  }

  public getLifetimeInRounds() {
    return this.proposer.read.LIFETIME_IN_ROUNDS();
  }

  public getExecutionDelayInRounds() {
    return this.proposer.read.EXECUTION_DELAY_IN_ROUNDS();
  }

  public getCurrentRound() {
    return this.proposer.read.getCurrentRound();
  }

  public computeRound(slot: SlotNumber): Promise<bigint> {
    return this.proposer.read.computeRound([BigInt(slot)]);
  }

  public getInstance() {
    return this.proposer.read.getInstance();
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
      abi: EmpireSlashingProposerAbi,
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
      abi: EmpireSlashingProposerAbi,
      data: encodeSignalWithSignature(payload, signature),
    };
  }

  /** Checks if a payload was ever submitted to governance via submitRoundWinner. */
  public async hasPayloadBeenProposed(payload: Hex, fromBlock: bigint): Promise<boolean> {
    const events = await this.proposer.getEvents.PayloadSubmitted({ payload }, { fromBlock, strict: true });
    return events.length > 0;
  }

  public listenToSubmittablePayloads(callback: (args: { payload: `0x${string}`; round: bigint }) => unknown) {
    return this.proposer.watchEvent.PayloadSubmittable(
      {},
      {
        strict: true,
        onLogs: logs => {
          for (const log of logs) {
            const { payload, round } = log.args;
            if (payload && round) {
              callback({ payload, round });
            }
          }
        },
      },
    );
  }

  public listenToPayloadSubmitted(callback: (args: { round: bigint; payload: `0x${string}` }) => unknown) {
    return this.proposer.watchEvent.PayloadSubmitted(
      {},
      {
        onLogs: logs => {
          for (const log of logs) {
            const { payload, round } = log.args;
            if (round && payload) {
              callback({ round, payload });
            }
          }
        },
      },
    );
  }

  public listenToSignalCasted(
    callback: (args: { round: bigint; payload: `0x${string}`; signaler: `0x${string}` }) => unknown,
  ) {
    return this.proposer.watchEvent.SignalCast(
      {},
      {
        onLogs: logs => {
          for (const log of logs) {
            const { round, payload, signaler } = log.args;
            if (round && payload && signaler) {
              callback({ round, payload, signaler });
            }
          }
        },
      },
    );
  }

  /** Creates an L1TxRequest to submit the round winner for the given round. */
  public buildExecuteRoundRequest(round: bigint): L1TxRequest {
    return {
      to: this.address.toString(),
      abi: EmpireSlashingProposerAbi,
      data: encodeFunctionData({
        abi: EmpireSlashingProposerAbi,
        functionName: 'submitRoundWinner',
        args: [round],
      }),
    };
  }

  /** Tries to extract a PayloadSubmitted event from the given logs. */
  public tryExtractPayloadSubmittedEvent(logs: Log[]) {
    return tryExtractEvent(logs, this.address.toString(), EmpireSlashingProposerAbi, 'PayloadSubmitted');
  }

  /**
   * Wait for a round to be reached.
   *
   * @param round - The round to wait for.
   * @param pollingIntervalSeconds - The interval in seconds to poll for the round.
   * @returns True if the round was reached, false otherwise.
   */
  public waitForRound(round: bigint, pollingIntervalSeconds: number = 1): Promise<boolean> {
    return retryUntil(
      async () => {
        const currentRound = await this.proposer.read.getCurrentRound().catch(e => {
          this.logger.error('Error getting current round', e);
          return undefined;
        });
        return currentRound !== undefined && currentRound >= round;
      },
      `Waiting for round ${round} to be reached`,
      0, // no timeout
      pollingIntervalSeconds,
    ).catch(() => false);
  }

  public async executeRound(
    txUtils: L1TxUtils,
    round: bigint | number,
  ): ReturnType<typeof txUtils.sendAndMonitorTransaction> {
    if (typeof round === 'number') {
      round = BigInt(round);
    }
    const request = this.buildExecuteRoundRequest(round);
    const response = await txUtils
      .sendAndMonitorTransaction(request, {
        // Gas estimation is way off for this, likely because we are creating the contract/selector to call
        // for the actual slashing dynamically.
        gasLimitBufferPercentage: 50, // +50% gas
      })
      .catch(err => {
        if (err instanceof FormattedViemError && err.message.includes('ProposalAlreadyExecuted')) {
          throw new ProposalAlreadyExecutedError(round);
        }
        throw err;
      });

    if (response.receipt.status === 'reverted') {
      const args = {
        abi: EmpireSlashingProposerAbi,
        functionName: 'submitRoundWinner' as const,
        args: [round] as const,
        address: this.address.toString(),
      };
      const error = await txUtils.tryGetErrorFromRevertedTx(request.data!, args, undefined, []);
      if (error?.includes('ProposalAlreadyExecuted')) {
        throw new ProposalAlreadyExecutedError(round);
      }
      const errorMessage = `Failed to execute round ${round}, TxHash: ${response.receipt.transactionHash}, Error: ${
        error ?? 'Unknown error'
      }`;
      throw new Error(errorMessage);
    }
    return response;
  }
}
