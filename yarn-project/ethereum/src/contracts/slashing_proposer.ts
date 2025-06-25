import { EthAddress } from '@aztec/foundation/eth-address';
import { retryUntil } from '@aztec/foundation/retry';
import { SlashingProposerAbi } from '@aztec/l1-artifacts/SlashingProposerAbi';

import EventEmitter from 'events';
import {
  type EncodeFunctionDataParameters,
  type GetContractReturnType,
  type Hex,
  encodeFunctionData,
  getContract,
} from 'viem';

import type { L1TxRequest, L1TxUtils } from '../l1_tx_utils.js';
import type { ExtendedViemWalletClient, ViemClient } from '../types.js';
import { FormattedViemError } from '../utils.js';
import { type IEmpireBase, encodeVote, encodeVoteWithSignature, signVoteWithSig } from './empire_base.js';

export class ProposalAlreadyExecutedError extends Error {
  constructor(round: bigint) {
    super(`Proposal already executed: ${round}`);
  }
}

export class SlashingProposerContract extends EventEmitter implements IEmpireBase {
  private readonly proposer: GetContractReturnType<typeof SlashingProposerAbi, ViemClient>;

  constructor(
    public readonly client: ViemClient,
    address: Hex,
  ) {
    super();
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

  public getNonce(proposer: Hex): Promise<bigint> {
    return this.proposer.read.nonces([proposer]);
  }

  public async getRoundInfo(
    rollupAddress: Hex,
    round: bigint,
  ): Promise<{ lastVote: bigint; leader: Hex; executed: boolean }> {
    return await this.proposer.read.getRoundData([rollupAddress, round]);
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

  public async createVoteRequestWithSignature(payload: Hex, wallet: ExtendedViemWalletClient): Promise<L1TxRequest> {
    const nonce = await this.getNonce(wallet.account.address);
    const signature = await signVoteWithSig(wallet, payload, nonce, this.address.toString(), wallet.chain.id);
    return {
      to: this.address.toString(),
      data: encodeVoteWithSignature(payload, signature),
    };
  }

  public listenToExecutableProposals(callback: (args: { proposal: `0x${string}`; round: bigint }) => unknown) {
    return this.proposer.watchEvent.ProposalExecutable(
      {},
      {
        onLogs: logs => {
          for (const payload of logs) {
            const args = payload.args;
            if (args.proposal && args.round) {
              // why compiler can't figure it out? no one knows
              callback(args as { proposal: `0x${string}`; round: bigint });
            }
          }
        },
      },
    );
  }

  public listenToProposalExecuted(callback: (args: { round: bigint; proposal: `0x${string}` }) => unknown) {
    return this.proposer.watchEvent.ProposalExecuted(
      {},
      {
        onLogs: logs => {
          for (const payload of logs) {
            const args = payload.args;
            if (args.round && args.proposal) {
              callback(args as { round: bigint; proposal: `0x${string}` });
            }
          }
        },
      },
    );
  }

  public waitForRound(round: bigint, pollingIntervalSeconds: number = 1) {
    return retryUntil(
      async () => {
        const currentRound = await this.proposer.read.getCurrentRound();
        return currentRound >= round;
      },
      `Waiting for round ${round} to be reached`,
      0, // no timeout
      pollingIntervalSeconds,
    );
  }

  public async executeRound(
    txUtils: L1TxUtils,
    round: bigint | number,
  ): ReturnType<typeof txUtils.sendAndMonitorTransaction> {
    if (typeof round === 'number') {
      round = BigInt(round);
    }
    const args: EncodeFunctionDataParameters<typeof SlashingProposerAbi, 'executeProposal'> = {
      abi: SlashingProposerAbi,
      functionName: 'executeProposal',
      args: [round],
    };
    const data = encodeFunctionData(args);
    const response = await txUtils
      .sendAndMonitorTransaction(
        {
          to: this.address.toString(),
          data,
        },
        {
          // Gas estimation is way off for this, likely because we are creating the contract/selector to call
          // for the actual slashing dynamically.
          gasLimitBufferPercentage: 1000,
        },
      )
      .catch(err => {
        if (err instanceof FormattedViemError && err.message.includes('ProposalAlreadyExecuted')) {
          throw new ProposalAlreadyExecutedError(round);
        }
        throw err;
      });

    if (response.receipt.status === 'reverted') {
      const error = await txUtils.tryGetErrorFromRevertedTx(
        data,
        {
          ...args,
          address: this.address.toString(),
        },
        undefined,
        [],
      );
      if (error?.includes('ProposalAlreadyExecuted')) {
        throw new ProposalAlreadyExecutedError(round);
      }
      const errorMessage = `Failed to execute round ${round}, TxHash: ${response.receipt.transactionHash}, Error: ${error ?? 'Unknown error'}`;
      throw new Error(errorMessage);
    }
    return response;
  }
}
