import { L1ToL2MessagesNotReadyError } from '@aztec/archiver';
import type { CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BadRequestError } from '@aztec/foundation/json-rpc';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { isErrorClass } from '@aztec/foundation/types';
import { PublicContractsDB, PublicProcessorFactory } from '@aztec/simulator/server';
import { CollectionLimitsConfig, PublicSimulatorConfig } from '@aztec/stdlib/avm';
import { BlockHash } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { type L1ToL2MessageSource, appendL1ToL2MessagesToTree } from '@aztec/stdlib/messaging';
import { type GlobalVariables, PublicSimulationOutput, type SimulationOverrides, type Tx } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';
import { WorldStateSynchronizerError } from '@aztec/world-state';

import type { NextBlockPlan, NextBlockPredictor } from './next_block/index.js';
import { applyPublicDataOverrides } from './public_data_overrides.js';

/** Attempts at planning the next block on a chain the world state agrees with, before giving up. */
const MAX_PREDICTION_ATTEMPTS = 2;

/** Config fields the simulator needs — a narrow subset of `AztecNodeConfig`. */
export interface NodePublicCallsSimulatorConfig {
  /** Maximum total gas limit accepted for an incoming simulation. */
  rpcSimulatePublicMaxGasLimit: number;
  /** Maximum number of debug-log memory reads collected during simulation. */
  rpcSimulatePublicMaxDebugLogMemoryReads: number;
}

/** Dependencies required to build a {@link NodePublicCallsSimulator}. */
export interface NodePublicCallsSimulatorDeps {
  worldStateSynchronizer: WorldStateSynchronizer;
  l1ToL2MessageSource: L1ToL2MessageSource;
  contractDataSource: ContractDataSource;
  predictor: NextBlockPredictor;
  config: NodePublicCallsSimulatorConfig;
  telemetry?: TelemetryClient;
  log?: Logger;
}

/** The next block, planned and priced, on a chain the world state has caught up with. */
type PreparedNextBlock = {
  plan: NextBlockPlan;
  globals: GlobalVariables;
  /** L1-to-L2 messages of the checkpoint the next block opens; undefined when it continues one. */
  messages: Fr[] | undefined;
};

/**
 * Simulates the public part of a transaction against a fresh world-state fork.
 *
 * Extracted from `AztecNodeService` so forking and execution can be unit-tested without standing up the whole
 * node, and to keep `server.ts` smaller. Which block is simulated, and the globals it carries, are decided by
 * the {@link NextBlockPredictor}: the simulator's job is to fork the chain that plan describes, insert the
 * L1-to-L2 messages a checkpoint-opening block would see, and run the processor.
 */
export class NodePublicCallsSimulator {
  private readonly worldStateSynchronizer: WorldStateSynchronizer;
  private readonly l1ToL2MessageSource: L1ToL2MessageSource;
  private readonly contractDataSource: ContractDataSource;
  private readonly predictor: NextBlockPredictor;
  private readonly config: NodePublicCallsSimulatorConfig;
  private readonly telemetry: TelemetryClient;
  private readonly log: Logger;

  constructor(deps: NodePublicCallsSimulatorDeps) {
    this.worldStateSynchronizer = deps.worldStateSynchronizer;
    this.l1ToL2MessageSource = deps.l1ToL2MessageSource;
    this.contractDataSource = deps.contractDataSource;
    this.predictor = deps.predictor;
    this.config = deps.config;
    this.telemetry = deps.telemetry ?? getTelemetryClient();
    this.log = deps.log ?? createLogger('node:public-calls-simulator');
  }

  /**
   * Simulates the public part of a transaction with the current state.
   * @param tx - The transaction to simulate.
   * @param skipFeeEnforcement - If true, fee enforcement is skipped.
   * @param overrides - Optional pre-simulation overrides applied to the ephemeral fork and contract DB.
   */
  public async simulate(
    tx: Tx,
    skipFeeEnforcement = false,
    overrides?: SimulationOverrides,
  ): Promise<PublicSimulationOutput> {
    // Check total gas limit for simulation
    const gasSettings = tx.data.constants.txContext.gasSettings;
    const txGasLimit = gasSettings.gasLimits.l2Gas;
    const teardownGasLimit = gasSettings.teardownGasLimits.l2Gas;
    if (txGasLimit + teardownGasLimit > this.config.rpcSimulatePublicMaxGasLimit) {
      throw new BadRequestError(
        `Transaction total gas limit ${
          txGasLimit + teardownGasLimit
        } (${txGasLimit} + ${teardownGasLimit}) exceeds maximum gas limit ${
          this.config.rpcSimulatePublicMaxGasLimit
        } for simulation`,
      );
    }

    const txHash = tx.getTxHash();
    const { plan, globals, messages } = await this.prepareNextBlock();

    const publicProcessorFactory = new PublicProcessorFactory(
      this.contractDataSource,
      new DateProvider(),
      this.telemetry,
      this.log.getBindings(),
    );

    this.log.verbose(`Simulating public calls for tx ${txHash}`, {
      globalVariables: globals.toInspect(),
      txHash,
      blockNumber: globals.blockNumber,
      atCheckpointBoundary: plan.newCheckpoint !== undefined,
    });

    // Request a new fork of the world state at the latest block number, and apply any overrides and next checkpoint messages to it before simulation
    await using merkleTreeFork = await this.worldStateSynchronizer.fork(plan.latestBlockNumber);

    if (messages !== undefined) {
      this.log.debug(`Appending ${messages.length} L1-to-L2 messages to the world state tree for the next checkpoint`, {
        checkpointNumber: plan.newCheckpoint?.targetCheckpoint,
      });
      await appendL1ToL2MessagesToTree(merkleTreeFork, messages);
    }

    await applyPublicDataOverrides(merkleTreeFork, overrides?.publicStorage);

    const config = PublicSimulatorConfig.from({
      skipFeeEnforcement,
      collectDebugLogs: true,
      collectHints: false,
      collectCallMetadata: true,
      collectStatistics: false,
      collectionLimits: CollectionLimitsConfig.from({
        maxDebugLogMemoryReads: this.config.rpcSimulatePublicMaxDebugLogMemoryReads,
      }),
    });

    const contractsDB = new PublicContractsDB(this.contractDataSource, this.log.getBindings());
    if (overrides?.contracts) {
      contractsDB.addContracts(Object.values(overrides.contracts).map(({ instance }) => instance));
    }
    const processor = publicProcessorFactory.create(merkleTreeFork, globals, config, contractsDB);

    // REFACTOR: Consider merging ProcessReturnValues into ProcessedTx
    const [processedTxs, failedTxs, _usedTxs, returns, debugLogs] = await processor.process([tx]);
    // REFACTOR: Consider returning the error rather than throwing
    if (failedTxs.length) {
      this.log.warn(`Simulated tx ${txHash} fails: ${failedTxs[0].error}`, { txHash });
      throw failedTxs[0].error;
    }

    const [processedTx] = processedTxs;
    return new PublicSimulationOutput(
      processedTx.revertReason,
      processedTx.globalVariables,
      processedTx.txEffect,
      returns,
      processedTx.gasUsed,
      debugLogs,
    );
  }

  /**
   * Plans and prices the next block, and brings the world state up to the block that plan builds on. Retries
   * once when the world state reaches the planned height with a different block: a prune between the archiver
   * read and the sync leaves the two disagreeing, and forking anyway would simulate against state the plan's
   * globals do not belong to. Any other sync failure propagates as is.
   */
  private async prepareNextBlock(): Promise<PreparedNextBlock> {
    for (let attempt = 0; attempt < MAX_PREDICTION_ATTEMPTS; attempt++) {
      const { plan, globals } = await this.predictor.predict();
      try {
        const [, messages] = await Promise.all([
          // Passing the hash makes the sync fork-aware: it waits for the block the plan builds on and throws if
          // the world state ended up with a different block at that height.
          this.worldStateSynchronizer.syncImmediate(plan.latestBlockNumber, BlockHash.fromString(plan.latestBlockHash)),
          this.getNextCheckpointMessages(plan.newCheckpoint?.targetCheckpoint),
        ]);
        return { plan, globals, messages };
      } catch (err) {
        if (!isBlockHashMismatch(err)) {
          throw err;
        }
        this.log.warn(`World state disagrees with the planned next block, replanning`, {
          blockNumber: plan.latestBlockNumber,
          blockHash: plan.latestBlockHash,
          error: err.message,
        });
      }
    }

    throw new Error(
      `Cannot simulate public calls: world state and archiver disagree on the latest block (prune race), retry`,
    );
  }

  /**
   * Fetches the next checkpoint's L1-to-L2 messages to insert into the fork before simulation. Only set
   * when opening a new checkpoint; when continuing an in-progress checkpoint the ongoing checkpoint's
   * messages were already applied when its first block synced, so inserting here would double-count them
   * — which is why a missing header for the latest proposed block throws rather than falling through to
   * this path. A not-ready or failed fetch degrades to simulating without the messages rather than
   * failing the request.
   */
  private async getNextCheckpointMessages(targetCheckpoint: CheckpointNumber | undefined): Promise<Fr[] | undefined> {
    if (targetCheckpoint === undefined) {
      return undefined;
    }
    try {
      return await this.l1ToL2MessageSource.getL1ToL2Messages(targetCheckpoint);
    } catch (err) {
      if (isErrorClass(err, L1ToL2MessagesNotReadyError)) {
        this.log.warn(
          `L1-to-L2 messages for checkpoint ${targetCheckpoint} are not ready yet (simulating without them)`,
          { checkpointNumber: targetCheckpoint },
        );
      } else {
        this.log.error(
          `Failed to get L1-to-L2 messages for checkpoint ${targetCheckpoint} (simulating without them)`,
          err,
          { checkpointNumber: targetCheckpoint },
        );
      }
      return undefined;
    }
  }
}

/** The sync reached the planned height but found a different block there, so the chain moved under the plan. */
function isBlockHashMismatch(err: unknown): err is WorldStateSynchronizerError {
  return (
    isErrorClass(err, WorldStateSynchronizerError) &&
    typeof err.cause === 'object' &&
    err.cause !== null &&
    'reason' in err.cause &&
    err.cause.reason === 'block_hash_mismatch'
  );
}
