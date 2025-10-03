import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { DateProvider, Timer } from '@aztec/foundation/timer';
import type { P2P, PeerId } from '@aztec/p2p';
import { TxProvider } from '@aztec/p2p';
import { BlockProposalValidator } from '@aztec/p2p/msg_validators';
import { computeInHashFromL1ToL2Messages } from '@aztec/prover-client/helpers';
import type { L2BlockSource } from '@aztec/stdlib/block';
import { getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import type { IFullNodeBlockBuilder, ValidatorClientFullConfig } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { type BlockProposal, ConsensusPayload } from '@aztec/stdlib/p2p';
import { type FailedTx, GlobalVariables, type Tx } from '@aztec/stdlib/tx';
import {
  ReExFailedTxsError,
  ReExStateMismatchError,
  ReExTimeoutError,
  TransactionsNotAvailableError,
} from '@aztec/stdlib/validators';
import { type TelemetryClient, type Tracer, getTelemetryClient } from '@aztec/telemetry-client';

import type { ValidatorMetrics } from './metrics.js';

export type BlockProposalValidationFailureReason =
  | 'invalid_proposal'
  | 'parent_block_not_found'
  | 'parent_block_does_not_match'
  | 'in_hash_mismatch'
  | 'block_number_already_exists'
  | 'txs_not_available'
  | 'state_mismatch'
  | 'failed_txs'
  | 'timeout'
  | 'unknown_error';

export interface BlockProposalValidationResult {
  isValid: boolean;
  reason?: BlockProposalValidationFailureReason;
  reexecutionResult?: {
    block: any;
    failedTxs: FailedTx[];
    reexecutionTimeMs: number;
    totalManaUsed: number;
  };
}

export class BlockProposalHandler {
  public readonly tracer: Tracer;

  constructor(
    private blockBuilder: IFullNodeBlockBuilder,
    private blockSource: L2BlockSource,
    private l1ToL2MessageSource: L1ToL2MessageSource,
    private txProvider: TxProvider,
    private blockProposalValidator: BlockProposalValidator,
    private config: ValidatorClientFullConfig,
    private metrics?: ValidatorMetrics,
    private dateProvider: DateProvider = new DateProvider(),
    telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('validator:block-proposal-handler'),
  ) {
    this.tracer = telemetry.getTracer('BlockProposalHandler');
  }

  registerForReexecution(p2pClient: P2P): BlockProposalHandler {
    const handler = async (proposal: BlockProposal, proposalSender: PeerId) => {
      try {
        const result = await this.handleBlockProposal(proposal, proposalSender, true);
        if (result.isValid && result.reexecutionResult) {
          this.log.info(`Non-validator reexecution completed for slot ${proposal.slotNumber.toBigInt()}`, {
            blockNumber: proposal.blockNumber,
            reexecutionTimeMs: result.reexecutionResult.reexecutionTimeMs,
            totalManaUsed: result.reexecutionResult.totalManaUsed,
            numTxs: result.reexecutionResult.block?.body?.txEffects?.length ?? 0,
          });
        } else {
          this.log.warn(`Non-validator reexecution failed for slot ${proposal.slotNumber.toBigInt()}`, {
            blockNumber: proposal.blockNumber,
            reason: result.reason,
          });
        }
      } catch (error) {
        this.log.error('Error processing block proposal in non-validator handler', error);
      }
      return undefined; // Non-validator nodes don't return attestations
    };

    p2pClient.registerBlockProposalHandler(handler);
    return this;
  }

  async handleBlockProposal(
    proposal: BlockProposal,
    proposalSender: PeerId,
    shouldReexecute: boolean,
  ): Promise<BlockProposalValidationResult> {
    const slotNumber = proposal.slotNumber.toBigInt();
    const blockNumber = proposal.blockNumber;
    const proposer = proposal.getSender();

    const proposalInfo = { ...proposal.toBlockInfo(), proposer: proposer.toString() };
    this.log.info(`Processing proposal for slot ${slotNumber}`, {
      ...proposalInfo,
      txHashes: proposal.txHashes.map(t => t.toString()),
    });

    // Check that the proposal is from the current proposer, or the next proposer
    // This should have been handled by the p2p layer, but we double check here out of caution
    const invalidProposal = await this.blockProposalValidator.validate(proposal);
    if (invalidProposal) {
      this.log.warn(`Proposal is not valid, skipping processing`, proposalInfo);
      return { isValid: false, reason: 'invalid_proposal' };
    }

    // Collect txs from the proposal. We start doing this as early as possible,
    // and we do it even if we don't plan to re-execute the txs, so that we have them
    // if another node needs them.
    const config = this.blockBuilder.getConfig();
    const { txs, missingTxs } = await this.txProvider.getTxsForBlockProposal(proposal, {
      pinnedPeer: proposalSender,
      deadline: this.getReexecutionDeadline(proposal, config),
    });

    // Check that the parent proposal is a block we know, otherwise reexecution would fail
    if (blockNumber > INITIAL_L2_BLOCK_NUM) {
      const deadline = this.getReexecutionDeadline(proposal, config);
      const currentTime = this.dateProvider.now();
      const timeoutDurationMs = deadline.getTime() - currentTime;
      const parentBlock =
        timeoutDurationMs <= 0
          ? undefined
          : await retryUntil(
              async () => {
                const block = await this.blockSource.getBlock(blockNumber - 1);
                if (block) {
                  return block;
                }
                await this.blockSource.syncImmediate();
                return await this.blockSource.getBlock(blockNumber - 1);
              },
              'Force Archiver Sync',
              timeoutDurationMs / 1000,
              0.5,
            );

      if (parentBlock === undefined) {
        this.log.warn(`Parent block for ${blockNumber} not found, skipping processing`, proposalInfo);
        return { isValid: false, reason: 'parent_block_not_found' };
      }

      if (!proposal.payload.header.lastArchiveRoot.equals(parentBlock.archive.root)) {
        this.log.warn(`Parent block archive root for proposal does not match, skipping processing`, {
          proposalLastArchiveRoot: proposal.payload.header.lastArchiveRoot.toString(),
          parentBlockArchiveRoot: parentBlock.archive.root.toString(),
          ...proposalInfo,
        });
        return { isValid: false, reason: 'parent_block_does_not_match' };
      }
    }

    // Check that I have the same set of l1ToL2Messages as the proposal
    const l1ToL2Messages = await this.l1ToL2MessageSource.getL1ToL2Messages(blockNumber);
    const computedInHash = await computeInHashFromL1ToL2Messages(l1ToL2Messages);
    const proposalInHash = proposal.payload.header.contentCommitment.inHash;
    if (!computedInHash.equals(proposalInHash)) {
      this.log.warn(`L1 to L2 messages in hash mismatch, skipping processing`, {
        proposalInHash: proposalInHash.toString(),
        computedInHash: computedInHash.toString(),
        ...proposalInfo,
      });
      return { isValid: false, reason: 'in_hash_mismatch' };
    }

    // Check that this block number does not exist already
    const existingBlock = await this.blockSource.getBlockHeader(blockNumber);
    if (existingBlock) {
      this.log.warn(`Block number ${blockNumber} already exists, skipping processing`, proposalInfo);
      return { isValid: false, reason: 'block_number_already_exists' };
    }

    // Check that all of the transactions in the proposal are available
    if (missingTxs.length > 0) {
      this.log.warn(`Missing ${missingTxs.length} txs to process proposal`, { ...proposalInfo, missingTxs });
      return { isValid: false, reason: 'txs_not_available' };
    }

    // Try re-executing the transactions in the proposal if needed
    let reexecutionResult;
    if (shouldReexecute) {
      try {
        this.log.verbose(`Re-executing transactions in the proposal`, proposalInfo);
        reexecutionResult = await this.reexecuteTransactions(proposal, txs, l1ToL2Messages);
      } catch (error) {
        this.log.error(`Error reexecuting txs while processing block proposal`, error, proposalInfo);
        const reason = this.getReexecuteFailureReason(error);
        return { isValid: false, reason, reexecutionResult };
      }
    }

    this.log.info(`Successfully processed proposal for slot ${slotNumber}`, proposalInfo);
    return { isValid: true, reexecutionResult };
  }

  private getReexecutionDeadline(
    proposal: BlockProposal,
    config: { l1GenesisTime: bigint; slotDuration: number },
  ): Date {
    const nextSlotTimestampSeconds = Number(getTimestampForSlot(proposal.slotNumber.toBigInt() + 1n, config));
    const msNeededForPropagationAndPublishing = this.config.validatorReexecuteDeadlineMs;
    return new Date(nextSlotTimestampSeconds * 1000 - msNeededForPropagationAndPublishing);
  }

  private getReexecuteFailureReason(err: any) {
    if (err instanceof ReExStateMismatchError) {
      return 'state_mismatch';
    } else if (err instanceof ReExFailedTxsError) {
      return 'failed_txs';
    } else if (err instanceof ReExTimeoutError) {
      return 'timeout';
    } else if (err instanceof Error) {
      return 'unknown_error';
    }
  }

  async reexecuteTransactions(
    proposal: BlockProposal,
    txs: Tx[],
    l1ToL2Messages: Fr[],
  ): Promise<{
    block: any;
    failedTxs: FailedTx[];
    reexecutionTimeMs: number;
    totalManaUsed: number;
  }> {
    const { header } = proposal.payload;
    const { txHashes } = proposal;

    // If we do not have all of the transactions, then we should fail
    if (txs.length !== txHashes.length) {
      const foundTxHashes = txs.map(tx => tx.getTxHash());
      const missingTxHashes = txHashes.filter(txHash => !foundTxHashes.includes(txHash));
      throw new TransactionsNotAvailableError(missingTxHashes);
    }

    // Use the sequencer's block building logic to re-execute the transactions
    const timer = new Timer();
    const config = this.blockBuilder.getConfig();

    // We source most global variables from the proposal
    const globalVariables = GlobalVariables.from({
      slotNumber: proposal.payload.header.slotNumber, // checked in the block proposal validator
      coinbase: proposal.payload.header.coinbase, // set arbitrarily by the proposer
      feeRecipient: proposal.payload.header.feeRecipient, // set arbitrarily by the proposer
      gasFees: proposal.payload.header.gasFees, // validated by the rollup contract
      blockNumber: proposal.blockNumber, // checked blockNumber-1 exists in archiver but blockNumber doesnt
      timestamp: header.timestamp, // checked in the rollup contract against the slot number
      chainId: new Fr(config.l1ChainId),
      version: new Fr(config.rollupVersion),
    });

    const { block, failedTxs } = await this.blockBuilder.buildBlock(txs, l1ToL2Messages, globalVariables, {
      deadline: this.getReexecutionDeadline(proposal, config),
    });

    const numFailedTxs = failedTxs.length;
    const slot = proposal.slotNumber.toBigInt();
    this.log.verbose(`Transaction re-execution complete for slot ${slot}`, {
      numFailedTxs,
      numProposalTxs: txHashes.length,
      numProcessedTxs: block.body.txEffects.length,
      slot,
    });

    if (numFailedTxs > 0) {
      this.metrics?.recordFailedReexecution(proposal);
      throw new ReExFailedTxsError(numFailedTxs);
    }

    if (block.body.txEffects.length !== txHashes.length) {
      this.metrics?.recordFailedReexecution(proposal);
      throw new ReExTimeoutError();
    }

    // Throw a ReExStateMismatchError error if state updates do not match
    const blockPayload = ConsensusPayload.fromBlock(block);
    if (!blockPayload.equals(proposal.payload)) {
      this.log.warn(`Re-execution state mismatch for slot ${slot}`, {
        expected: blockPayload.toInspect(),
        actual: proposal.payload.toInspect(),
      });
      this.metrics?.recordFailedReexecution(proposal);
      throw new ReExStateMismatchError(
        proposal.archive,
        block.archive.root,
        proposal.payload.stateReference,
        block.header.state,
      );
    }

    const reexecutionTimeMs = timer.ms();
    const totalManaUsed = block.header.totalManaUsed.toNumber() / 1e6;

    this.metrics?.recordReex(reexecutionTimeMs, txs.length, totalManaUsed);

    return {
      block,
      failedTxs,
      reexecutionTimeMs,
      totalManaUsed,
    };
  }
}
