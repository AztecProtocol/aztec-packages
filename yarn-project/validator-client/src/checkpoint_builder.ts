import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { merge, pick } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { bufferToHex } from '@aztec/foundation/string';
import { DateProvider, Timer, elapsed } from '@aztec/foundation/timer';
import { getDefaultAllowedSetupFunctions } from '@aztec/p2p/msg_validators';
import { LightweightCheckpointBuilder } from '@aztec/prover-client/light';
import {
  GuardedMerkleTreeOperations,
  PublicContractsDB,
  PublicProcessor,
  createPublicTxSimulatorForBlockBuilding,
} from '@aztec/simulator/server';
import { L2BlockNew } from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { Gas } from '@aztec/stdlib/gas';
import {
  type FullNodeBlockBuilderConfig,
  FullNodeBlockBuilderConfigKeys,
  type MerkleTreeWriteOperations,
  type PublicProcessorLimits,
} from '@aztec/stdlib/interfaces/server';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import { type CheckpointGlobalVariables, type FailedTx, GlobalVariables, StateReference, Tx } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { createValidatorForBlockBuilding } from './tx_validator/tx_validator_factory.js';

const log = createLogger('checkpoint-builder');

export interface BuildBlockInCheckpointResult {
  block: L2BlockNew;
  publicGas: Gas;
  publicProcessorDuration: number;
  numTxs: number;
  failedTxs: FailedTx[];
  blockBuildingTimer: Timer;
  usedTxs: Tx[];
}

/**
 * Builder for a single checkpoint. Handles building blocks within the checkpoint
 * and completing it.
 */
export class CheckpointBuilder {
  constructor(
    private checkpointBuilder: LightweightCheckpointBuilder,
    private fork: MerkleTreeWriteOperations,
    private config: FullNodeBlockBuilderConfig,
    private contractDataSource: ContractDataSource,
    private dateProvider: DateProvider,
    private telemetryClient: TelemetryClient,
  ) {}

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
    opts: PublicProcessorLimits & { expectedEndState?: StateReference },
  ): Promise<BuildBlockInCheckpointResult> {
    const blockBuildingTimer = new Timer();
    const slot = this.checkpointBuilder.constants.slotNumber;

    log.verbose(`Building block ${blockNumber} for slot ${slot} within checkpoint`, {
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

    const [publicProcessorDuration, [processedTxs, failedTxs, usedTxs]] = await elapsed(() =>
      processor.process(pendingTxs, opts, validator),
    );

    // Add block to checkpoint
    const block = await this.checkpointBuilder.addBlock(globalVariables, processedTxs, {
      expectedEndState: opts.expectedEndState,
    });

    // How much public gas was processed
    const publicGas = processedTxs.reduce((acc, tx) => acc.add(tx.gasUsed.publicGas), Gas.empty());

    const res = {
      block,
      publicGas,
      publicProcessorDuration,
      numTxs: processedTxs.length,
      failedTxs,
      blockBuildingTimer,
      usedTxs,
    };
    log.debug('Built block within checkpoint', res.block.header);
    return res;
  }

  /** Completes the checkpoint and returns it. */
  async completeCheckpoint(): Promise<Checkpoint> {
    const checkpoint = await this.checkpointBuilder.completeCheckpoint();

    log.verbose(`Completed checkpoint ${checkpoint.number}`, {
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
    const contractsDB = new PublicContractsDB(this.contractDataSource);
    const guardedFork = new GuardedMerkleTreeOperations(fork);

    const publicTxSimulator = createPublicTxSimulatorForBlockBuilding(
      guardedFork,
      contractsDB,
      globalVariables,
      this.telemetryClient,
    );

    const processor = new PublicProcessor(
      globalVariables,
      guardedFork,
      contractsDB,
      publicTxSimulator,
      this.dateProvider,
      this.telemetryClient,
      undefined,
      this.config,
    );

    const validator = createValidatorForBlockBuilding(
      fork,
      this.contractDataSource,
      globalVariables,
      txPublicSetupAllowList,
    );

    return {
      processor,
      validator,
    };
  }
}

/**
 * Factory for creating checkpoint builders.
 */
export class FullNodeCheckpointsBuilder {
  constructor(
    private config: FullNodeBlockBuilderConfig,
    private contractDataSource: ContractDataSource,
    private dateProvider: DateProvider,
    private telemetryClient: TelemetryClient = getTelemetryClient(),
  ) {}

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
  ): Promise<CheckpointBuilder> {
    const stateReference = await fork.getStateReference();
    const archiveTree = await fork.getTreeInfo(MerkleTreeId.ARCHIVE);

    log.verbose(`Building new checkpoint ${checkpointNumber}`, {
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
    );

    return new CheckpointBuilder(
      lightweightBuilder,
      fork,
      this.config,
      this.contractDataSource,
      this.dateProvider,
      this.telemetryClient,
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
    existingBlocks: L2BlockNew[] = [],
  ): Promise<CheckpointBuilder> {
    const stateReference = await fork.getStateReference();
    const archiveTree = await fork.getTreeInfo(MerkleTreeId.ARCHIVE);

    if (existingBlocks.length === 0) {
      return this.startCheckpoint(checkpointNumber, constants, l1ToL2Messages, previousCheckpointOutHashes, fork);
    }

    log.verbose(`Resuming checkpoint ${checkpointNumber} with ${existingBlocks.length} existing blocks`, {
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
    );

    return new CheckpointBuilder(
      lightweightBuilder,
      fork,
      this.config,
      this.contractDataSource,
      this.dateProvider,
      this.telemetryClient,
    );
  }
}
