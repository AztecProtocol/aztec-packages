import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { merge, pick } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { bufferToHex } from '@aztec/foundation/string';
import { DateProvider, elapsed } from '@aztec/foundation/timer';
import { getDefaultAllowedSetupFunctions } from '@aztec/p2p/msg_validators';
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
import { MerkleTreeId } from '@aztec/stdlib/trees';
import { type CheckpointGlobalVariables, GlobalVariables, StateReference, Tx } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { createValidatorForBlockBuilding } from './tx_validator/tx_validator_factory.js';

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

    const [publicProcessorDuration, [processedTxs, failedTxs, usedTxs, _, usedTxBlobFields]] = await elapsed(() =>
      processor.process(pendingTxs, opts, validator),
    );

    // Throw if we didn't collect a single valid tx and we're not allowed to build empty blocks
    // (only the first block in a checkpoint can be empty)
    if (processedTxs.length === 0 && this.checkpointBuilder.getBlockCount() > 0) {
      throw new NoValidTxsError(failedTxs);
    }

    // Add block to checkpoint
    const block = await this.checkpointBuilder.addBlock(globalVariables, processedTxs, {
      expectedEndState: opts.expectedEndState,
    });

    // How much public gas was processed
    const publicGas = processedTxs.reduce((acc, tx) => acc.add(tx.gasUsed.publicGas), Gas.empty());

    this.log.debug('Built block within checkpoint', {
      header: block.header.toInspect(),
      processedTxs: processedTxs.map(tx => tx.hash.toString()),
      failedTxs: failedTxs.map(tx => tx.tx.txHash.toString()),
    });

    return {
      block,
      publicGas,
      publicProcessorDuration,
      numTxs: processedTxs.length,
      failedTxs,
      usedTxs,
      usedTxBlobFields,
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

  protected async makeBlockBuilderDeps(globalVariables: GlobalVariables, fork: MerkleTreeWriteOperations) {
    const txPublicSetupAllowList = this.config.txPublicSetupAllowList ?? (await getDefaultAllowedSetupFunctions());
    const contractsDB = new PublicContractsDB(this.contractDataSource, this.log.getBindings());
    const guardedFork = new GuardedMerkleTreeOperations(fork);

    const bindings = this.log.getBindings();
    const publicTxSimulator = createPublicTxSimulatorForBlockBuilding(
      guardedFork,
      contractsDB,
      globalVariables,
      this.telemetryClient,
      bindings,
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
    );

    const validator = createValidatorForBlockBuilding(
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
    });

    const lightweightBuilder = await LightweightCheckpointBuilder.startNewCheckpoint(
      checkpointNumber,
      constants,
      l1ToL2Messages,
      previousCheckpointOutHashes,
      fork,
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
    );
  }

  /**
   * Opens a checkpoint, either starting fresh or resuming from existing blocks.
   */
  async openCheckpoint(
    checkpointNumber: CheckpointNumber,
    constants: CheckpointGlobalVariables,
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
    });

    const lightweightBuilder = await LightweightCheckpointBuilder.resumeCheckpoint(
      checkpointNumber,
      constants,
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
    );
  }

  /** Returns a fork of the world state at the given block number. */
  getFork(blockNumber: BlockNumber): Promise<MerkleTreeWriteOperations> {
    return this.worldState.fork(blockNumber);
  }
}
