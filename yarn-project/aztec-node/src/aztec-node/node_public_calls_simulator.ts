import { L1ToL2MessagesNotReadyError } from '@aztec/archiver';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { BadRequestError } from '@aztec/foundation/json-rpc';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { isErrorClass } from '@aztec/foundation/types';
import { PublicContractsDB, PublicProcessorFactory } from '@aztec/simulator/server';
import { CollectionLimitsConfig, PublicSimulatorConfig } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { ManaUsageEstimate } from '@aztec/stdlib/gas';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { type L1ToL2MessageSource, appendL1ToL2MessagesToTree } from '@aztec/stdlib/messaging';
import {
  type FeeProvider,
  type GlobalVariableBuilder,
  GlobalVariables,
  PublicSimulationOutput,
  type SimulationOverrides,
  type Tx,
} from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { applyPublicDataOverrides } from './public_data_overrides.js';

/** Config fields the simulator needs — a narrow subset of `AztecNodeConfig`. */
export interface NodePublicCallsSimulatorConfig {
  /** Maximum total gas limit accepted for an incoming simulation. */
  rpcSimulatePublicMaxGasLimit: number;
  /** Maximum number of debug-log memory reads collected during simulation. */
  rpcSimulatePublicMaxDebugLogMemoryReads: number;
}

/** Dependencies required to build a {@link NodePublicCallsSimulator}. */
export interface NodePublicCallsSimulatorDeps {
  blockSource: L2BlockSource;
  worldStateSynchronizer: WorldStateSynchronizer;
  l1ToL2MessageSource: L1ToL2MessageSource;
  contractDataSource: ContractDataSource;
  globalVariableBuilder: GlobalVariableBuilder;
  feeProvider: FeeProvider;
  telemetry?: TelemetryClient;
  config: NodePublicCallsSimulatorConfig;
  log?: Logger;
}

/**
 * Simulates the public part of a transaction against a fresh world-state fork.
 *
 * Extracted from {@link AztecNodeService} so the logic can be unit-tested
 * without standing up the whole node, and to keep `server.ts` smaller.
 *
 * The simulator picks globals in one of two ways:
 * - **Case A — mid-checkpoint continuation:** every block in a checkpoint
 *   shares the same `CheckpointGlobalVariables`, so we reuse the latest
 *   proposed block's globals and only bump the block number.
 * - **Case B — opening a new checkpoint:** we compute fresh globals.
 *   Timestamp and slot come from `FeeProvider.getCurrentMinFeesSnapshot()`;
 *   gas fees come from `FeeProvider.getPredictedMinFees()[0]` — the same
 *   prediction path the wallet uses via `getMinFees`, so simulator and
 *   wallet agree on per-block fees by construction.
 */
export class NodePublicCallsSimulator {
  private readonly blockSource: L2BlockSource;
  private readonly worldStateSynchronizer: WorldStateSynchronizer;
  private readonly l1ToL2MessageSource: L1ToL2MessageSource;
  private readonly contractDataSource: ContractDataSource;
  private readonly globalVariableBuilder: GlobalVariableBuilder;
  private readonly feeProvider: FeeProvider;
  private readonly telemetry: TelemetryClient;
  private readonly config: NodePublicCallsSimulatorConfig;
  private readonly log: Logger;

  constructor(deps: NodePublicCallsSimulatorDeps) {
    this.blockSource = deps.blockSource;
    this.worldStateSynchronizer = deps.worldStateSynchronizer;
    this.l1ToL2MessageSource = deps.l1ToL2MessageSource;
    this.contractDataSource = deps.contractDataSource;
    this.globalVariableBuilder = deps.globalVariableBuilder;
    this.feeProvider = deps.feeProvider;
    this.telemetry = deps.telemetry ?? getTelemetryClient();
    this.config = deps.config;
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
    const l2Tips = await this.blockSource.getL2Tips();
    const latestBlockNumber = l2Tips.proposed.number;
    const blockNumber = BlockNumber.add(latestBlockNumber, 1);

    const hasProposedCheckpoint = l2Tips.proposedCheckpoint.checkpoint.number > l2Tips.checkpointed.checkpoint.number;
    // True in two states: idle (no in-progress proposed checkpoint), or the latest proposed block is
    // also the terminating block of a pending proposed checkpoint. False mid-checkpoint when blocks
    // have been added past the last L1-confirmed boundary but no proposed-checkpoint entry exists yet.
    const atCheckpointBoundary = l2Tips.proposedCheckpoint.block.number === l2Tips.proposed.number;

    let newGlobalVariables: GlobalVariables | undefined;
    let nextCheckpointMessages: Fr[] | undefined;
    let targetCheckpoint: CheckpointNumber | undefined;

    if (!atCheckpointBoundary) {
      // Case A: continuation in an in-progress checkpoint. Every block in a checkpoint shares the
      // same CheckpointGlobalVariables (slot, timestamp, gasFees, coinbase, feeRecipient), so we
      // reuse the latest proposed block's globals verbatim and only bump the block number.
      const latestBlockData = await this.blockSource.getBlockData({ number: latestBlockNumber });
      if (!latestBlockData) {
        // Surprising sync state: archiver reports `latestBlockNumber` via getL2Tips() but does not
        // have its header. Rather than failing the RPC, fall through to the idle Case B path so
        // the wallet still gets a simulation result built against L1-confirmed state.
        this.log.warn(
          `Falling back to L1-confirmed-tip simulation: latest proposed block ${latestBlockNumber} has no header on this node`,
          { latestBlockNumber },
        );
      } else {
        newGlobalVariables = GlobalVariables.from({
          ...latestBlockData.header.globalVariables,
          blockNumber,
        });
        nextCheckpointMessages = undefined;
      }
    }

    if (newGlobalVariables === undefined) {
      // Case B: opening a new checkpoint. Compute fresh globals.
      // Slot/timestamp come from `FeeProvider.getCurrentMinFeesSnapshot()`. Gas fees come from
      // `FeeProvider.getPredictedMinFees()[0]` — the same prediction path the wallet uses via
      // `getMinFees` for its pre-tx fee quote. Anchoring on the predictor guarantees fee parity
      // between simulator and wallet for the next block, without needing to mirror any L1 state
      // overrides the sequencer applies internally when building a real block.
      const snapshot = await this.feeProvider.getCurrentMinFeesSnapshot();
      const predictedFees = await this.feeProvider.getPredictedMinFees(ManaUsageEstimate.Target);
      // Index 0 is the next available L2 slot after the L1-confirmed pending checkpoint — i.e. the
      // slot the next block will land in. The predictor anchors its `lastCheckpoint` on L1, so
      // index 0 also matches the wallet's view: parity is by construction.
      const gasFees = predictedFees[0] ?? snapshot.gasFees;

      const checkpointNumber = hasProposedCheckpoint
        ? CheckpointNumber(l2Tips.proposedCheckpoint.checkpoint.number + 1)
        : CheckpointNumber(l2Tips.checkpointed.checkpoint.number + 1);

      // Simulation always zeroes these regardless of whether a sequencer is configured on this
      // node — the simulator does not represent the proposer's payout addresses.
      const checkpointGlobals = this.globalVariableBuilder.buildCheckpointGlobalVariablesFromSnapshot(
        EthAddress.ZERO,
        AztecAddress.ZERO,
        { timestamp: snapshot.timestamp, slotNumber: snapshot.slotNumber, gasFees },
      );
      newGlobalVariables = GlobalVariables.from({ blockNumber, ...checkpointGlobals });
      targetCheckpoint = checkpointNumber;
    }

    const publicProcessorFactory = new PublicProcessorFactory(
      this.contractDataSource,
      new DateProvider(),
      this.telemetry,
      this.log.getBindings(),
    );

    this.log.verbose(`Simulating public calls for tx ${txHash}`, {
      globalVariables: newGlobalVariables.toInspect(),
      txHash,
      blockNumber,
      atCheckpointBoundary,
      hasProposedCheckpoint,
    });

    // Ensure world-state has caught up with the latest block we loaded from the archiver before
    // fetching L1-to-L2 messages or forking, so all reads observe a coherent view.
    await this.worldStateSynchronizer.syncImmediate(latestBlockNumber);

    // Fetch L1-to-L2 messages only when opening a new checkpoint, after sync so the archiver
    // has had a chance to advance to the tip we observed.
    if (targetCheckpoint !== undefined) {
      nextCheckpointMessages = await this.l1ToL2MessageSource.getL1ToL2Messages(targetCheckpoint).catch(err => {
        if (isErrorClass(err, L1ToL2MessagesNotReadyError)) {
          this.log.warn(
            `L1-to-L2 messages for checkpoint ${targetCheckpoint} are not ready yet (simulating without them)`,
          );
        } else {
          this.log.error(
            `Failed to get L1-to-L2 messages for checkpoint ${targetCheckpoint} (simulating without them)`,
            err,
          );
        }
        return undefined;
      });
    }

    // Request a new fork of the world state at the latest block number, and apply any overrides and next checkpoint messages to it before simulation
    await using merkleTreeFork = await this.worldStateSynchronizer.fork(latestBlockNumber);

    if (nextCheckpointMessages !== undefined) {
      this.log.debug(
        `Appending ${nextCheckpointMessages.length} L1-to-L2 messages to the world state tree for the next checkpoint`,
        { checkpointNumber: targetCheckpoint },
      );
      await appendL1ToL2MessagesToTree(merkleTreeFork, nextCheckpointMessages);
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
    const processor = publicProcessorFactory.create(merkleTreeFork, newGlobalVariables, config, contractsDB);

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
}
