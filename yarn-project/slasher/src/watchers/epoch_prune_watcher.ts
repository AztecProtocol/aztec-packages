import { EpochCache } from '@aztec/epoch-cache';
import { BlockNumber, CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { merge, pick } from '@aztec/foundation/collection';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import {
  EthAddress,
  L2Block,
  type L2BlockSourceEventEmitter,
  L2BlockSourceEvents,
  type L2PruneUnprovenEvent,
} from '@aztec/stdlib/block';
import { getEpochAtSlot } from '@aztec/stdlib/epoch-helpers';
import type {
  ICheckpointsBuilder,
  ITxProvider,
  MerkleTreeWriteOperations,
  SlasherConfig,
} from '@aztec/stdlib/interfaces/server';
import { type L1ToL2MessageSource, computeCheckpointOutHash } from '@aztec/stdlib/messaging';
import { OffenseType, getOffenseTypeName } from '@aztec/stdlib/slashing';
import type { CheckpointGlobalVariables } from '@aztec/stdlib/tx';
import {
  ReExFailedTxsError,
  ReExStateMismatchError,
  TransactionsNotAvailableError,
  ValidatorError,
} from '@aztec/stdlib/validators';

import EventEmitter from 'node:events';

import { WANT_TO_SLASH_EVENT, type WantToSlashArgs, type Watcher, type WatcherEmitter } from '../watcher.js';

const EpochPruneWatcherPenaltiesConfigKeys = ['slashPrunePenalty', 'slashDataWithholdingPenalty'] as const;

type EpochPruneWatcherPenalties = Pick<SlasherConfig, (typeof EpochPruneWatcherPenaltiesConfigKeys)[number]>;

/**
 * This watcher is responsible for detecting chain prunes and creating slashing arguments for the committee.
 * It only wants to slash if:
 * - the transactions are not available
 * - OR the archive roots match when re-building all the blocks in the epoch (i.e. the epoch *could* have been proven)
 */
export class EpochPruneWatcher extends (EventEmitter as new () => WatcherEmitter) implements Watcher {
  private log: Logger = createLogger('epoch-prune-watcher');

  // Store bound function reference for proper listener removal
  private boundHandlePruneL2Blocks = this.handlePruneL2Blocks.bind(this);

  private penalties: EpochPruneWatcherPenalties;

  constructor(
    private l2BlockSource: L2BlockSourceEventEmitter,
    private l1ToL2MessageSource: L1ToL2MessageSource,
    private epochCache: EpochCache,
    private txProvider: Pick<ITxProvider, 'getAvailableTxs'>,
    private checkpointsBuilder: ICheckpointsBuilder,
    penalties: EpochPruneWatcherPenalties,
  ) {
    super();
    this.penalties = pick(penalties, ...EpochPruneWatcherPenaltiesConfigKeys);
    this.log.verbose(
      `EpochPruneWatcher initialized with penalties: valid epoch pruned=${penalties.slashPrunePenalty} data withholding=${penalties.slashDataWithholdingPenalty}`,
    );
  }

  public start() {
    this.l2BlockSource.events.on(L2BlockSourceEvents.L2PruneUnproven, this.boundHandlePruneL2Blocks);
    return Promise.resolve();
  }

  public stop() {
    this.l2BlockSource.events.removeListener(L2BlockSourceEvents.L2PruneUnproven, this.boundHandlePruneL2Blocks);
    return Promise.resolve();
  }

  public updateConfig(config: Partial<SlasherConfig>): void {
    this.penalties = merge(this.penalties, pick(config, ...EpochPruneWatcherPenaltiesConfigKeys));
    this.log.verbose('EpochPruneWatcher config updated', this.penalties);
  }

  private handlePruneL2Blocks(event: L2PruneUnprovenEvent): void {
    const { blocks, epochNumber } = event;
    void this.processPruneL2Blocks(blocks, epochNumber).catch(err =>
      this.log.error('Error processing pruned L2 blocks', err, { epochNumber }),
    );
  }

  private async emitSlashForEpoch(offense: OffenseType, epochNumber: EpochNumber): Promise<void> {
    const validators = await this.getValidatorsForEpoch(epochNumber);
    if (validators.length === 0) {
      this.log.warn(`No validators found for epoch ${epochNumber} (cannot slash for ${getOffenseTypeName(offense)})`);
      return;
    }
    const args = this.validatorsToSlashingArgs(validators, offense, epochNumber);
    this.log.verbose(`Created slash for ${getOffenseTypeName(offense)} at epoch ${epochNumber}`, args);
    this.emit(WANT_TO_SLASH_EVENT, args);
  }

  private async processPruneL2Blocks(blocks: L2Block[], epochNumber: EpochNumber): Promise<void> {
    try {
      const l1Constants = this.epochCache.getL1Constants();
      const epochBlocks = blocks.filter(b => getEpochAtSlot(b.header.getSlot(), l1Constants) === epochNumber);
      this.log.info(
        `Detected chain prune. Validating epoch ${epochNumber} with blocks ${epochBlocks[0]?.number} to ${epochBlocks[epochBlocks.length - 1]?.number}.`,
        { blocks: epochBlocks.map(b => b.toBlockInfo()) },
      );

      await this.validateBlocks(epochBlocks);
      this.log.info(`Pruned epoch ${epochNumber} was valid. Want to slash committee for not having it proven.`);
      await this.emitSlashForEpoch(OffenseType.VALID_EPOCH_PRUNED, epochNumber);
    } catch (error) {
      if (error instanceof TransactionsNotAvailableError) {
        this.log.info(`Data for pruned epoch ${epochNumber} was not available. Will want to slash.`, {
          message: error.message,
        });
        await this.emitSlashForEpoch(OffenseType.DATA_WITHHOLDING, epochNumber);
      } else {
        this.log.error(`Error while validating pruned epoch ${epochNumber}. Will not want to slash.`, error);
      }
    }
  }

  public async validateBlocks(blocks: L2Block[]): Promise<void> {
    if (blocks.length === 0) {
      return;
    }

    let previousCheckpointOutHashes: Fr[] = [];
    const fork = await this.checkpointsBuilder.getFork(BlockNumber(blocks[0].header.globalVariables.blockNumber - 1));
    try {
      for (const block of blocks) {
        await this.validateBlock(block, previousCheckpointOutHashes, fork);

        // TODO(mbps): This assumes one block per checkpoint, which is only true for now.
        const checkpointOutHash = computeCheckpointOutHash([block.body.txEffects.map(tx => tx.l2ToL1Msgs)]);
        previousCheckpointOutHashes = [...previousCheckpointOutHashes, checkpointOutHash];
      }
    } finally {
      await fork.close();
    }
  }

  public async validateBlock(
    blockFromL1: L2Block,
    previousCheckpointOutHashes: Fr[],
    fork: MerkleTreeWriteOperations,
  ): Promise<void> {
    this.log.debug(`Validating pruned block ${blockFromL1.header.globalVariables.blockNumber}`);
    const txHashes = blockFromL1.body.txEffects.map(txEffect => txEffect.txHash);
    // We load txs from the mempool directly, since the TxCollector running in the background has already been
    // trying to fetch them from nodes or via reqresp. If we haven't managed to collect them by now,
    // it's likely that they are not available in the network at all.
    const { txs, missingTxs } = await this.txProvider.getAvailableTxs(txHashes);

    if (missingTxs && missingTxs.length > 0) {
      throw new TransactionsNotAvailableError(missingTxs);
    }

    const checkpointNumber = CheckpointNumber.fromBlockNumber(blockFromL1.number);
    const l1ToL2Messages = await this.l1ToL2MessageSource.getL1ToL2Messages(checkpointNumber);
    const gv = blockFromL1.header.globalVariables;
    const constants: CheckpointGlobalVariables = {
      chainId: gv.chainId,
      version: gv.version,
      slotNumber: gv.slotNumber,
      coinbase: gv.coinbase,
      feeRecipient: gv.feeRecipient,
      gasFees: gv.gasFees,
    };

    // Use checkpoint builder to validate the block
    const checkpointBuilder = await this.checkpointsBuilder.startCheckpoint(
      checkpointNumber,
      constants,
      l1ToL2Messages,
      previousCheckpointOutHashes,
      fork,
    );

    const { block, failedTxs, numTxs } = await checkpointBuilder.buildBlock(txs, gv.blockNumber, gv.timestamp, {});

    if (numTxs !== txs.length) {
      // This should be detected by state mismatch, but this makes it easier to debug.
      throw new ValidatorError(`Built block with ${numTxs} txs, expected ${txs.length}`);
    }
    if (failedTxs.length > 0) {
      throw new ReExFailedTxsError(failedTxs.length);
    }
    if (!block.archive.root.equals(blockFromL1.archive.root)) {
      throw new ReExStateMismatchError(blockFromL1.archive.root, block.archive.root);
    }
  }

  private async getValidatorsForEpoch(epochNumber: EpochNumber): Promise<EthAddress[]> {
    const { committee } = await this.epochCache.getCommitteeForEpoch(epochNumber);
    if (!committee) {
      this.log.trace(`No committee found for epoch ${epochNumber}`);
      return [];
    }
    return committee;
  }

  private validatorsToSlashingArgs(
    validators: EthAddress[],
    offenseType: OffenseType,
    epochOrSlot: EpochNumber,
  ): WantToSlashArgs[] {
    const penalty =
      offenseType === OffenseType.DATA_WITHHOLDING
        ? this.penalties.slashDataWithholdingPenalty
        : this.penalties.slashPrunePenalty;
    return validators.map(v => ({
      validator: v,
      amount: penalty,
      offenseType,
      epochOrSlot: BigInt(epochOrSlot),
    }));
  }
}
