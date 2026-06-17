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
  type BlockBuilderOptions,
  type BuildBlockInCheckpointResult,
  type FullNodeBlockBuilderConfig,
  FullNodeBlockBuilderConfigKeys,
  type ICheckpointBlockBuilder,
  type ICheckpointsBuilder,
  InsufficientValidTxsError,
  type MerkleTreeWriteOperations,
  type PublicProcessorLimits,
  type WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import { type DebugLogStore, NullDebugLogStore } from '@aztec/stdlib/logs';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import { type CheckpointGlobalVariables, GlobalVariables, StateReference, Tx } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';
import { ForkCheckpoint } from '@aztec/world-state';

// Re-export for backward compatibility
export type { BuildBlockInCheckpointResult } from '@aztec/stdlib/interfaces/server';

/**
 * Builder for a single checkpoint. Handles building blocks within the checkpoint
 * and completing it.
 */
export class CheckpointBuilder implements ICheckpointBlockBuilder {
  private log: Logger;

  /** Persistent contracts DB shared across all blocks in this checkpoint. */
  protected contractsDB: PublicContractsDB;

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
    this.contractsDB = new PublicContractsDB(this.contractDataSource, this.log.getBindings());
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
    opts: BlockBuilderOptions & { expectedEndState?: StateReference },
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

    // Create a block-level checkpoint on the contracts DB so we can roll back on failure
    this.contractsDB.createCheckpoint();
    // We execute all merkle tree operations on a world state fork checkpoint
    // This enables us to discard all modifications in the event that we fail to successfully process sufficient transactions
    const forkCheckpoint = await ForkCheckpoint.new(this.fork);

    try {
      const [publicProcessorDuration, [processedTxs, failedTxs, usedTxs]] = await elapsed(() =>
        processor.process(pendingTxs, cappedOpts, validator),
      );

      // Throw before updating state if we don't have enough valid txs
      const minValidTxs = opts.minValidTxs ?? 0;
      if (processedTxs.length < minValidTxs) {
        throw new InsufficientValidTxsError(processedTxs.length, minValidTxs, failedTxs);
      }

      // Commit the fork checkpoint
      await forkCheckpoint.commit();

      // Add block to checkpoint
      const { block } = await this.checkpointBuilder.addBlock(globalVariables, processedTxs, {
        expectedEndState: opts.expectedEndState,
      });

      this.contractsDB.commitCheckpoint();

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
    } catch (err) {
      // Revert all changes to contracts db
      this.contractsDB.revertCheckpoint();
      // If we reached the point of committing the checkpoint, this does nothing
      // Otherwise it reverts any changes made to the fork for this failed block
      await forkCheckpoint.revert();
      throw err;
    }
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
   * When building a proposal (isBuildingProposal=true), computes a fair share of remaining budget
   * across remaining blocks scaled by the multiplier. When validating, only caps by per-block limit
   * and remaining checkpoint budget (no redistribution or multiplier).
   */
  protected capLimitsByCheckpointBudgets(
    opts: BlockBuilderOptions,
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

    // Remaining txs
    const usedTxs = sum(existingBlocks.map(b => b.body.txEffects.length));
    const remainingTxs = Math.max(0, (this.config.maxTxsPerCheckpoint ?? Infinity) - usedTxs);

    // Cap by per-block limit + remaining checkpoint budget
    let cappedL2Gas = Math.min(opts.maxBlockGas?.l2Gas ?? Infinity, remainingMana);
    let cappedDAGas = Math.min(opts.maxBlockGas?.daGas ?? Infinity, remainingDAGas);
    let cappedBlobFields = Math.min(opts.maxBlobFields ?? Infinity, maxBlobFieldsForTxs);
    let cappedMaxTransactions = Math.min(opts.maxTransactions ?? Infinity, remainingTxs);

    // Proposer mode: further cap by fair share of remaining budget across remaining blocks
    if (opts.isBuildingProposal) {
      const remainingBlocks = Math.max(1, opts.maxBlocksPerCheckpoint - existingBlocks.length);
      const multiplier = opts.perBlockAllocationMultiplier;
      // DA gas and blob fields use a higher multiplier so the largest contract class deploy fits a block.
      const daMultiplier = opts.perBlockDAAllocationMultiplier ?? multiplier;

      cappedL2Gas = Math.min(cappedL2Gas, Math.ceil((remainingMana / remainingBlocks) * multiplier));
      cappedDAGas = Math.min(cappedDAGas, Math.ceil((remainingDAGas / remainingBlocks) * daMultiplier));
      cappedBlobFields = Math.min(cappedBlobFields, Math.ceil((maxBlobFieldsForTxs / remainingBlocks) * daMultiplier));
      cappedMaxTransactions = Math.min(cappedMaxTransactions, Math.ceil((remainingTxs / remainingBlocks) * multiplier));
    }

    return {
      maxBlockGas: new Gas(cappedDAGas, cappedL2Gas),
      maxBlobFields: cappedBlobFields,
      maxTransactions: Number.isFinite(cappedMaxTransactions) ? cappedMaxTransactions : undefined,
    };
  }

  protected async makeBlockBuilderDeps(globalVariables: GlobalVariables, fork: MerkleTreeWriteOperations) {
    const txPublicSetupAllowList = [
      ...(await getDefaultAllowedSetupFunctions()),
      ...(this.config.txPublicSetupAllowListExtend ?? []),
    ];
    const contractsDB = this.contractsDB;
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
