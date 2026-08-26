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
  type AvmSimulator,
  GuardedMerkleTreeOperations,
  PublicContractsDB,
  PublicProcessor,
  createPublicTxSimulatorForBlockBuilding,
} from '@aztec/simulator/server';
import { type BlockHash, L2Block } from '@aztec/stdlib/block';
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
import {
  type InboxMessageBundle,
  appendL1ToL2MessagesToTree,
  bundleLength,
  flattenBundle,
} from '@aztec/stdlib/messaging';
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
    private avmSimulator: AvmSimulator,
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
      // Insert this block's streaming L1-to-L2 message bundle before executing its txs. The prover node appends the
      // bundle to its fork before re-executing, and the block-root circuit pins each tx's L1-to-L2 tree snapshot to
      // the post-bundle root, so the AVM here must read the same tree or a tx consuming a message from this block's
      // bundle would revert at proposal time and succeed at proving time. Appending inside the fork checkpoint means
      // a failed block rolls the leaves back together with the tx effects.
      const l1ToL2Messages = opts.l1ToL2Messages ?? [];
      await appendL1ToL2MessagesToTree(this.fork, flattenBundle(l1ToL2Messages));

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

      // Add block to checkpoint. The bundle is already in the fork; addBlock only accumulates it into the
      // checkpoint's message list for the rolling hash.
      const { block } = await this.checkpointBuilder.addBlock(globalVariables, processedTxs, l1ToL2Messages, {
        expectedEndState: opts.expectedEndState,
        insertL1ToL2Messages: false,
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
    const blockEndOverhead = getNumBlockEndBlobFields();
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

    const bindings = this.log.getBindings();
    // Extract the WSDB fork ID so the C++ AVM can modify the same fork in-place; the simulator reads
    // contract data from `contractsDB`, scoped to this fork for the duration of each simulation.
    const wsdbForkId = fork.getRevision().forkId;
    const publicTxSimulator = createPublicTxSimulatorForBlockBuilding(
      this.avmSimulator,
      globalVariables,
      contractsDB,
      wsdbForkId,
      this.telemetryClient,
      bindings,
      this.debugLogStore?.isEnabled ?? false,
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
    private avmSimulator: AvmSimulator,
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
    previousCheckpointOutHashes: Fr[],
    previousInboxRollingHash: Fr,
    fork: MerkleTreeWriteOperations,
    bindings?: LoggerBindings,
  ): Promise<CheckpointBuilder> {
    const stateReference = await fork.getStateReference();
    const archiveTree = await fork.getTreeInfo(MerkleTreeId.ARCHIVE);

    this.log.verbose(`Building new checkpoint ${checkpointNumber}`, {
      checkpointNumber,
      initialStateReference: stateReference.toInspect(),
      initialArchiveRoot: bufferToHex(archiveTree.root),
      constants,
      feeAssetPriceModifier,
    });

    const lightweightBuilder = LightweightCheckpointBuilder.startNewCheckpoint(
      checkpointNumber,
      constants,
      previousCheckpointOutHashes,
      previousInboxRollingHash,
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
      this.avmSimulator,
      bindings,
      this.debugLogStore,
    );
  }

  /**
   * Opens a checkpoint, either starting fresh or resuming from existing blocks.
   * @param l1ToL2Messages - Messages the existing blocks already consumed, which seed the resumed checkpoint's
   * rolling hash. Must be empty when starting fresh: a fresh checkpoint takes its messages per block, via
   * `buildBlock`.
   */
  async openCheckpoint(
    checkpointNumber: CheckpointNumber,
    constants: CheckpointGlobalVariables,
    feeAssetPriceModifier: bigint,
    l1ToL2Messages: InboxMessageBundle,
    previousCheckpointOutHashes: Fr[],
    previousInboxRollingHash: Fr,
    fork: MerkleTreeWriteOperations,
    existingBlocks: L2Block[] = [],
    bindings?: LoggerBindings,
  ): Promise<CheckpointBuilder> {
    const stateReference = await fork.getStateReference();
    const archiveTree = await fork.getTreeInfo(MerkleTreeId.ARCHIVE);

    if (existingBlocks.length === 0) {
      if (bundleLength(l1ToL2Messages) > 0) {
        throw new Error(
          `Cannot open checkpoint ${checkpointNumber} with ${bundleLength(l1ToL2Messages)} messages and no existing blocks: ` +
            `a fresh checkpoint consumes its messages per block`,
        );
      }
      return this.startCheckpoint(
        checkpointNumber,
        constants,
        feeAssetPriceModifier,
        previousCheckpointOutHashes,
        previousInboxRollingHash,
        fork,
        bindings,
      );
    }

    this.log.verbose(`Resuming checkpoint ${checkpointNumber} with ${existingBlocks.length} existing blocks`, {
      checkpointNumber,
      msgCount: bundleLength(l1ToL2Messages),
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
      previousInboxRollingHash,
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
      this.avmSimulator,
      bindings,
      this.debugLogStore,
    );
  }

  /**
   * Syncs world state to the given block number and returns a fork of it at that block.
   *
   * Syncing first is required: the block source (archiver) can already hold a block while world state
   * still trails it, and forking a not-yet-applied block throws a raw "initialize from future block"
   * tree error. syncImmediate blocks until world state reaches the block, or throws a typed error if it
   * genuinely cannot. When `blockHash` is provided it is verified against the synced block, triggering a
   * resync on mismatch (reorg detection).
   */
  async getFork(blockNumber: BlockNumber, blockHash?: BlockHash): Promise<MerkleTreeWriteOperations> {
    await this.worldState.syncImmediate(blockNumber, blockHash);
    return this.worldState.fork(blockNumber);
  }
}
