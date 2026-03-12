import { NUM_CHECKPOINT_END_MARKER_FIELDS, getNumBlockEndBlobFields } from '@aztec/blob-lib/encoding';
import { BLOBS_PER_CHECKPOINT, FIELDS_PER_BLOB, MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT } from '@aztec/constants';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { merge, pick, sum } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { bufferToHex } from '@aztec/foundation/string';
import { DateProvider, elapsed } from '@aztec/foundation/timer';
import { createTxValidatorForBlockBuilding, getDefaultAllowedSetupFunctions } from '@aztec/p2p/msg_validators';
import { LightweightCheckpointBuilder } from '@aztec/prover-client/light';
import {
  GuardedMerkleTreeOperations,
  PublicContractsDB,
  PublicProcessor,
  createPublicTxSimulatorForBlockBuilding,
} from '@aztec/simulator/server';
import { L2Block } from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { Gas } from '@aztec/stdlib/gas';
import {
  type BuildBlockInCheckpointResult,
  type FullNodeBlockBuilderConfig,
  FullNodeBlockBuilderConfigKeys,
  type ICheckpointBlockBuilder,
  type ICheckpointsBuilder,
  type MerkleTreeWriteOperations,
  NoValidTxsError,
  type PublicProcessorLimits,
  type WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import { type DebugLogStore, NullDebugLogStore } from '@aztec/stdlib/logs';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import { type CheckpointGlobalVariables, GlobalVariables, StateReference, Tx } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

// Re-export for backward compatibility
export type { BuildBlockInCheckpointResult } from '@aztec/stdlib/interfaces/server';

/**
 * Builder for a single checkpoint. Handles building blocks within the checkpoint
 * and completing it.
 */
export class CheckpointBuilder implements ICheckpointBlockBuilder {
  private log: Logger;

  constructor(
    private checkpointBuilder: LightweightCheckpointBuilder,
    private fork: MerkleTreeWriteOperations,
    private config: FullNodeBlockBuilderConfig,
    private contractDataSource: ContractDataSource,
    private dateProvider: DateProvider,
    private telemetryClient: TelemetryClient,
    bindings?: LoggerBindings,
    private debugLogStore: DebugLogStore = new NullDebugLogStore(),
  ) {
    this.log = createLogger('checkpoint-builder', {
      ...bindings,
      instanceId: `checkpoint-${checkpointBuilder.checkpointNumber}`,
    });
  }

  getConstantData(): CheckpointGlobalVariables {
    return this.checkpointBuilder.constants;
  }

  /**
   * Builds a single block within this checkpoint.
   * Automatically caps gas and blob field limits based on checkpoint-level budgets and prior blocks.
   */
  async buildBlock(
    pendingTxs: Iterable<Tx> | AsyncIterable<Tx>,
    blockNumber: BlockNumber,
    timestamp: bigint,
    opts: PublicProcessorLimits & { expectedEndState?: StateReference } = {},
  ): Promise<BuildBlockInCheckpointResult> {
    const slot = this.checkpointBuilder.constants.slotNumber;

    this.log.verbose(`Building block ${blockNumber} for slot ${slot} within checkpoint`, {
      slot,
      blockNumber,
      ...opts,
      currentTime: new Date(this.dateProvider.now()),
    });

    const constants = this.checkpointBuilder.constants;
    const globalVariables = GlobalVariables.from({
      chainId: constants.chainId,
      version: constants.version,
      blockNumber,
      slotNumber: constants.slotNumber,
      timestamp,
      coinbase: constants.coinbase,
      feeRecipient: constants.feeRecipient,
      gasFees: constants.gasFees,
    });
    const { processor, validator } = await this.makeBlockBuilderDeps(globalVariables, this.fork);

    // Cap gas limits amd available blob fields by remaining checkpoint-level budgets
    const cappedOpts: PublicProcessorLimits & { expectedEndState?: StateReference } = {
      ...opts,
      ...this.capLimitsByCheckpointBudgets(opts),
    };

    const [publicProcessorDuration, [processedTxs, failedTxs, usedTxs]] = await elapsed(() =>
      processor.process(pendingTxs, cappedOpts, validator),
    );

    // Throw if we didn't collect a single valid tx and we're not allowed to build empty blocks
    // (only the first block in a checkpoint can be empty)
    if (processedTxs.length === 0 && this.checkpointBuilder.getBlockCount() > 0) {
      throw new NoValidTxsError(failedTxs);
    }

    // Add block to checkpoint
    const { block } = await this.checkpointBuilder.addBlock(globalVariables, processedTxs, {
      expectedEndState: opts.expectedEndState,
    });

    this.log.debug('Built block within checkpoint', {
      header: block.header.toInspect(),
      processedTxs: processedTxs.map(tx => tx.hash.toString()),
      failedTxs: failedTxs.map(tx => tx.tx.txHash.toString()),
    });

    return {
      block,
      publicProcessorDuration,
      numTxs: processedTxs.length,
      failedTxs,
      usedTxs,
    };
  }

  /** Completes the checkpoint and returns it. */
  async completeCheckpoint(): Promise<Checkpoint> {
    const checkpoint = await this.checkpointBuilder.completeCheckpoint();

    this.log.verbose(`Completed checkpoint ${checkpoint.number}`, {
      checkpointNumber: checkpoint.number,
      numBlocks: checkpoint.blocks.length,
      archiveRoot: checkpoint.archive.root.toString(),
    });

    return checkpoint;
  }

  /** Gets the checkpoint currently in progress. */
  getCheckpoint(): Promise<Checkpoint> {
    return this.checkpointBuilder.clone().completeCheckpoint();
  }

  /**
   * Caps per-block gas and blob field limits by remaining checkpoint-level budgets.
   * Computes remaining L2 gas (mana), DA gas, and blob fields from blocks already added to the checkpoint,
   * then returns opts with maxBlockGas and maxBlobFields capped accordingly.
   */
  protected capLimitsByCheckpointBudgets(
    opts: PublicProcessorLimits,
  ): Pick<PublicProcessorLimits, 'maxBlockGas' | 'maxBlobFields' | 'maxTransactions'> {
    const existingBlocks = this.checkpointBuilder.getBlocks();

    // Remaining L2 gas (mana)
    // IMPORTANT: This assumes mana is computed solely based on L2 gas used in transactions.
    // This may change in the future.
    const usedMana = sum(existingBlocks.map(b => b.header.totalManaUsed.toNumber()));
    const remainingMana = this.config.rollupManaLimit - usedMana;

    // Remaining DA gas
    const usedDAGas = sum(existingBlocks.map(b => b.computeDAGasUsed())) ?? 0;
    const remainingDAGas = MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT - usedDAGas;

    // Remaining blob fields (block blob fields include both tx data and block-end overhead)
    const usedBlobFields = sum(existingBlocks.map(b => b.toBlobFields().length));
    const totalBlobCapacity = BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB - NUM_CHECKPOINT_END_MARKER_FIELDS;
    const isFirstBlock = existingBlocks.length === 0;
    const blockEndOverhead = getNumBlockEndBlobFields(isFirstBlock);
    const maxBlobFieldsForTxs = totalBlobCapacity - usedBlobFields - blockEndOverhead;

    // When redistributeCheckpointBudget is enabled (default), compute a fair share of remaining budget
    // across remaining blocks scaled by the multiplier, instead of letting one block consume it all.
    const redistribute = this.config.redistributeCheckpointBudget !== false;
    const remainingBlocks = Math.max(1, (this.config.maxBlocksPerCheckpoint ?? 1) - existingBlocks.length);
    const multiplier = this.config.perBlockAllocationMultiplier ?? 1.2;

    // Cap L2 gas by remaining checkpoint mana (with fair share when redistributing)
    const fairShareL2 = redistribute ? Math.ceil((remainingMana / remainingBlocks) * multiplier) : Infinity;
    const cappedL2Gas = Math.min(opts.maxBlockGas?.l2Gas ?? Infinity, fairShareL2, remainingMana);

    // Cap DA gas by remaining checkpoint DA gas budget (with fair share when redistributing)
    const fairShareDA = redistribute ? Math.ceil((remainingDAGas / remainingBlocks) * multiplier) : Infinity;
    const cappedDAGas = Math.min(opts.maxBlockGas?.daGas ?? remainingDAGas, fairShareDA, remainingDAGas);

    // Cap blob fields by remaining checkpoint blob capacity (with fair share when redistributing)
    const fairShareBlobs = redistribute ? Math.ceil((maxBlobFieldsForTxs / remainingBlocks) * multiplier) : Infinity;
    const cappedBlobFields = Math.min(opts.maxBlobFields ?? Infinity, fairShareBlobs, maxBlobFieldsForTxs);

    // Cap transaction count by remaining checkpoint tx budget (with fair share when redistributing)
    let cappedMaxTransactions: number | undefined;
    if (this.config.maxTxsPerCheckpoint !== undefined) {
      const usedTxs = sum(existingBlocks.map(b => b.body.txEffects.length));
      const remainingTxs = Math.max(0, this.config.maxTxsPerCheckpoint - usedTxs);
      const fairShareTxs = redistribute ? Math.ceil((remainingTxs / remainingBlocks) * multiplier) : Infinity;
      cappedMaxTransactions = Math.min(opts.maxTransactions ?? Infinity, fairShareTxs, remainingTxs);
    } else {
      cappedMaxTransactions = opts.maxTransactions;
    }

    return {
      maxBlockGas: new Gas(cappedDAGas, cappedL2Gas),
      maxBlobFields: cappedBlobFields,
      maxTransactions: cappedMaxTransactions,
    };
  }

  protected async makeBlockBuilderDeps(globalVariables: GlobalVariables, fork: MerkleTreeWriteOperations) {
    const txPublicSetupAllowList = [
      ...(await getDefaultAllowedSetupFunctions()),
      ...(this.config.txPublicSetupAllowListExtend ?? []),
    ];
    const contractsDB = new PublicContractsDB(this.contractDataSource, this.log.getBindings());
    const guardedFork = new GuardedMerkleTreeOperations(fork);

    const collectDebugLogs = this.debugLogStore.isEnabled;

    const bindings = this.log.getBindings();
    const publicTxSimulator = createPublicTxSimulatorForBlockBuilding(
      guardedFork,
      contractsDB,
      globalVariables,
      this.telemetryClient,
      bindings,
      collectDebugLogs,
    );

    const processor = new PublicProcessor(
      globalVariables,
      guardedFork,
      contractsDB,
      publicTxSimulator,
      this.dateProvider,
      this.telemetryClient,
      createLogger('simulator:public-processor', bindings),
      this.config,
      this.debugLogStore,
    );

    const validator = createTxValidatorForBlockBuilding(
      fork,
      this.contractDataSource,
      globalVariables,
      txPublicSetupAllowList,
      this.log.getBindings(),
    );

    return {
      processor,
      validator,
    };
  }
}

/** Factory for creating checkpoint builders. */
export class FullNodeCheckpointsBuilder implements ICheckpointsBuilder {
  private log: Logger;

  constructor(
    private config: FullNodeBlockBuilderConfig & Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration'>,
    private worldState: WorldStateSynchronizer,
    private contractDataSource: ContractDataSource,
    private dateProvider: DateProvider,
    private telemetryClient: TelemetryClient = getTelemetryClient(),
    private debugLogStore: DebugLogStore = new NullDebugLogStore(),
  ) {
    this.log = createLogger('checkpoint-builder');
  }

  public getConfig(): FullNodeBlockBuilderConfig {
    return this.config;
  }

  public updateConfig(config: Partial<FullNodeBlockBuilderConfig>) {
    this.config = merge(this.config, pick(config, ...FullNodeBlockBuilderConfigKeys));
  }

  /**
   * Starts a new checkpoint and returns a CheckpointBuilder to build blocks within it.
   */
  async startCheckpoint(
    checkpointNumber: CheckpointNumber,
    constants: CheckpointGlobalVariables,
    feeAssetPriceModifier: bigint,
    l1ToL2Messages: Fr[],
    previousCheckpointOutHashes: Fr[],
    fork: MerkleTreeWriteOperations,
    bindings?: LoggerBindings,
  ): Promise<CheckpointBuilder> {
    const stateReference = await fork.getStateReference();
    const archiveTree = await fork.getTreeInfo(MerkleTreeId.ARCHIVE);

    this.log.verbose(`Building new checkpoint ${checkpointNumber}`, {
      checkpointNumber,
      msgCount: l1ToL2Messages.length,
      initialStateReference: stateReference.toInspect(),
      initialArchiveRoot: bufferToHex(archiveTree.root),
      constants,
      feeAssetPriceModifier,
    });

    const lightweightBuilder = await LightweightCheckpointBuilder.startNewCheckpoint(
      checkpointNumber,
      constants,
      l1ToL2Messages,
      previousCheckpointOutHashes,
      fork,
      bindings,
      feeAssetPriceModifier,
    );

    return new CheckpointBuilder(
      lightweightBuilder,
      fork,
      this.config,
      this.contractDataSource,
      this.dateProvider,
      this.telemetryClient,
      bindings,
      this.debugLogStore,
    );
  }

  /**
   * Opens a checkpoint, either starting fresh or resuming from existing blocks.
   */
  async openCheckpoint(
    checkpointNumber: CheckpointNumber,
    constants: CheckpointGlobalVariables,
    feeAssetPriceModifier: bigint,
    l1ToL2Messages: Fr[],
    previousCheckpointOutHashes: Fr[],
    fork: MerkleTreeWriteOperations,
    existingBlocks: L2Block[] = [],
    bindings?: LoggerBindings,
  ): Promise<CheckpointBuilder> {
    const stateReference = await fork.getStateReference();
    const archiveTree = await fork.getTreeInfo(MerkleTreeId.ARCHIVE);

    if (existingBlocks.length === 0) {
      return this.startCheckpoint(
        checkpointNumber,
        constants,
        feeAssetPriceModifier,
        l1ToL2Messages,
        previousCheckpointOutHashes,
        fork,
        bindings,
      );
    }

    this.log.verbose(`Resuming checkpoint ${checkpointNumber} with ${existingBlocks.length} existing blocks`, {
      checkpointNumber,
      msgCount: l1ToL2Messages.length,
      existingBlockCount: existingBlocks.length,
      initialStateReference: stateReference.toInspect(),
      initialArchiveRoot: bufferToHex(archiveTree.root),
      constants,
      feeAssetPriceModifier,
    });

    const lightweightBuilder = await LightweightCheckpointBuilder.resumeCheckpoint(
      checkpointNumber,
      constants,
      feeAssetPriceModifier,
      l1ToL2Messages,
      previousCheckpointOutHashes,
      fork,
      existingBlocks,
      bindings,
    );

    return new CheckpointBuilder(
      lightweightBuilder,
      fork,
      this.config,
      this.contractDataSource,
      this.dateProvider,
      this.telemetryClient,
      bindings,
      this.debugLogStore,
    );
  }

  /** Returns a fork of the world state at the given block number. */
  getFork(blockNumber: BlockNumber): Promise<MerkleTreeWriteOperations> {
    return this.worldState.fork(blockNumber);
  }
}
