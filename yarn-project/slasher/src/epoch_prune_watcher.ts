import type { Tx } from '@aztec/aztec.js';
import { EpochCache } from '@aztec/epoch-cache';
import { type Logger, createLogger } from '@aztec/foundation/log';
import {
  EthAddress,
  L2Block,
  type L2BlockPruneEvent,
  type L2BlockSourceEventEmitter,
  L2BlockSourceEvents,
} from '@aztec/stdlib/block';
import type { IFullNodeBlockBuilder, ITxProvider, MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import {
  ReExFailedTxsError,
  ReExStateMismatchError,
  TransactionsNotAvailableError,
  ValidatorError,
} from '@aztec/stdlib/validators';

import EventEmitter from 'node:events';

import { Offense, WANT_TO_SLASH_EVENT, type WantToSlashArgs, type Watcher, type WatcherEmitter } from './config.js';

/**
 * This watcher is responsible for detecting chain prunes and creating slashing arguments for the committee.
 * It only wants to slash if:
 * - the transactions are not available
 * - OR the archive roots match when re-building all the blocks in the epoch (i.e. the epoch *could* have been proven)
 */
export class EpochPruneWatcher extends (EventEmitter as new () => WatcherEmitter) implements Watcher {
  private log: Logger = createLogger('epoch-prune-watcher');

  // Keep track of slashable epochs we've seen to their committee
  private slashableCommittees: Map<bigint, EthAddress[]> = new Map();
  // Only keep track of the last N slashable epochs
  private maxSlashableEpochs = 100;

  // Store bound function reference for proper listener removal
  private boundHandlePruneL2Blocks = this.handlePruneL2Blocks.bind(this);

  constructor(
    private l2BlockSource: L2BlockSourceEventEmitter,
    private l1ToL2MessageSource: L1ToL2MessageSource,
    private epochCache: EpochCache,
    private txProvider: Pick<ITxProvider, 'getAvailableTxs'>,
    private blockBuilder: IFullNodeBlockBuilder,
    private penalty: bigint,
    private maxPenalty: bigint,
  ) {
    super();
    this.log.info('EpochPruneWatcher initialized');
  }

  public start() {
    this.l2BlockSource.on(L2BlockSourceEvents.L2PruneDetected, this.boundHandlePruneL2Blocks);
    return Promise.resolve();
  }

  public stop() {
    this.l2BlockSource.removeListener(L2BlockSourceEvents.L2PruneDetected, this.boundHandlePruneL2Blocks);
    return Promise.resolve();
  }

  private handlePruneL2Blocks(event: L2BlockPruneEvent): void {
    const { blocks, epochNumber } = event;
    this.log.info(`Detected chain prune. Validating epoch ${epochNumber}`);

    this.validateBlocks(blocks)
      .then(async () => {
        this.log.info(`Pruned epoch ${epochNumber} was valid. Want to slash committee for not having it proven.`);
        const validators = await this.getValidatorsForEpoch(epochNumber);
        // need to specify return type to be able to return offense as undefined later on
        const result: { validators: EthAddress[]; offense: Offense | undefined } = {
          validators,
          offense: Offense.VALID_EPOCH_PRUNED,
        };
        return result;
      })
      .catch(async error => {
        if (error instanceof TransactionsNotAvailableError) {
          this.log.info(`Data for pruned epoch ${epochNumber} was not available. Will want to slash.`, error);
          const validators = await this.getValidatorsForEpoch(epochNumber);
          return {
            validators,
            offense: Offense.DATA_WITHHOLDING,
          };
        } else {
          this.log.error(`Error while validating pruned epoch ${epochNumber}. Will not want to slash.`, error);
          return {
            validators: [],
            offense: undefined,
          };
        }
      })
      .then(({ validators, offense }) => {
        if (validators.length === 0 || offense === undefined) {
          return;
        }
        this.addToSlashableEpochs(epochNumber, validators);
        const args = this.validatorsToSlashingArgs(validators, offense);
        this.log.info(`Slash for epoch ${epochNumber} created.`, args);
        this.emit(WANT_TO_SLASH_EVENT, args);
      })
      .catch(error => {
        // This can happen if we fail to get the validators for the epoch.
        this.log.error('Error while creating slash for epoch', error);
      });
  }

  public async validateBlocks(blocks: L2Block[]): Promise<void> {
    if (blocks.length === 0) {
      return;
    }
    const fork = await this.blockBuilder.getFork(blocks[0].header.globalVariables.blockNumber - 1);
    try {
      for (const block of blocks) {
        await this.validateBlock(block, fork);
      }
    } finally {
      await fork.close();
    }
  }

  public async validateBlock(blockFromL1: L2Block, fork: MerkleTreeWriteOperations): Promise<void> {
    this.log.debug(`Validating pruned block ${blockFromL1.header.globalVariables.blockNumber}`);
    const txHashes = blockFromL1.body.txEffects.map(txEffect => txEffect.txHash);
    // We load txs from the mempool directly, since the TxCollector running in the background has already been
    // trying to fetch them from nodes or via reqresp. If we haven't managed to collect them by now,
    // it's likely that they are not available in the network at all.
    const { txs, missingTxs } = await this.txProvider.getAvailableTxs(txHashes);

    if (missingTxs && missingTxs.length > 0) {
      throw new TransactionsNotAvailableError(missingTxs);
    }

    const l1ToL2Messages = await this.l1ToL2MessageSource.getL1ToL2Messages(blockFromL1.number);
    const { block, failedTxs, numTxs } = await this.blockBuilder.buildBlock(
      txs as Tx[],
      l1ToL2Messages,
      blockFromL1.header.globalVariables,
      {},
      fork,
    );
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

  private addToSlashableEpochs(epochNumber: bigint, validators: EthAddress[] | undefined) {
    if (!validators) {
      return;
    }
    this.slashableCommittees.set(epochNumber, validators);
    if (this.slashableCommittees.size > this.maxSlashableEpochs) {
      this.slashableCommittees.delete(this.slashableCommittees.keys().next().value!);
    }
  }

  private async getValidatorsForEpoch(epochNumber: bigint): Promise<EthAddress[]> {
    const { committee } = await this.epochCache.getCommitteeForEpoch(epochNumber);
    if (!committee) {
      this.log.trace(`No committee found for epoch ${epochNumber}`);
      return [];
    }
    return committee;
  }

  private validatorsToSlashingArgs(validators: EthAddress[], offense: Offense): WantToSlashArgs[] {
    return validators.map(v => ({
      validator: v,
      amount: this.penalty,
      offense,
    }));
  }

  private wantToSlashForEpoch(validator: EthAddress, _amount: bigint, epochNumber: bigint): boolean {
    return this.slashableCommittees.get(epochNumber)?.some(v => v.equals(validator)) ?? false;
  }

  public shouldSlash({ validator, amount }: WantToSlashArgs): Promise<boolean> {
    for (const epoch of this.slashableCommittees.keys()) {
      if (this.wantToSlashForEpoch(validator, amount, epoch) && amount <= this.maxPenalty) {
        return Promise.resolve(true);
      }
    }

    return Promise.resolve(false);
  }
}
