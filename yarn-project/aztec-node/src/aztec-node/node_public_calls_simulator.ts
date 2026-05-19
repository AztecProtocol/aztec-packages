import { L1ToL2MessagesNotReadyError } from '@aztec/archiver';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { BadRequestError } from '@aztec/foundation/json-rpc';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { isErrorClass } from '@aztec/foundation/types';
import { buildCheckpointSimulationOverridesPlan } from '@aztec/sequencer-client/chain-state-overrides';
import { PublicContractsDB, PublicProcessorFactory } from '@aztec/simulator/server';
import { CollectionLimitsConfig, PublicSimulatorConfig } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { ProposedCheckpointData } from '@aztec/stdlib/checkpoint';
import type { ContractDataSource } from '@aztec/stdlib/contract';
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
  /** Address of the rollup contract on L1 (used as signature context for the overrides plan). */
  rollupAddress: EthAddress;
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
  l1ChainId: number;
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
 * - **Case B — opening a new checkpoint:** we compute fresh globals from
 *   `FeeProvider.getCurrentMinFeesSnapshot()` — the same triple the wallet
 *   observes via `getCurrentMinFees`, so slot, timestamp, and gas fees
 *   agree between simulator and wallet by construction.
 */
export class NodePublicCallsSimulator {
  private readonly blockSource: L2BlockSource;
  private readonly worldStateSynchronizer: WorldStateSynchronizer;
  private readonly l1ToL2MessageSource: L1ToL2MessageSource;
  private readonly contractDataSource: ContractDataSource;
  private readonly globalVariableBuilder: GlobalVariableBuilder;
  private readonly feeProvider: FeeProvider;
  private readonly telemetry: TelemetryClient;
  private readonly l1ChainId: number;
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
    this.l1ChainId = deps.l1ChainId;
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
      // Slot/timestamp/gasFees come from `FeeProvider.getCurrentMinFeesSnapshot()`, which is the
      // same triple `FeeProviderImpl.computeCurrentMinFeesSnapshot()` derives for the wallet's
      // `getCurrentMinFees`. Anchoring the simulator on that snapshot guarantees the three fields
      // agree between simulator and wallet — an archiver-anchored slot diverges whenever the
      // local archiver lags wall-clock by an L2 slot, which is routine in e2e tests with short
      // anvil intervals.
      const snapshot = await this.feeProvider.getCurrentMinFeesSnapshot();
      const targetSlot = snapshot.slotNumber;

      let proposedCheckpointData: ProposedCheckpointData | undefined;
      let checkpointNumber: CheckpointNumber;
      // We only build the overrides plan when extending a 1-deep proposed parent (i.e. the
      // proposed parent's checkpoint number is exactly `checkpointed + 1`). Beyond that depth,
      // the parent's grandparent has not landed on L1, so the helper would revert when reading
      // the grandparent feeHeader. Without a proposed parent (or with a deeper pipeline), we
      // omit the plan entirely so `getManaMinFeeAt` reads L1 state as-is — matching the fee
      // value wallets see via `getCurrentMinFees`.
      let buildOverridesForProposedParent = false;

      // Only consult getProposedCheckpointData when we are still in Case B by virtue of an
      // observed boundary (`atCheckpointBoundary` is true). When we fell through here from a
      // missing Case-A header, the latest proposed block is mid-checkpoint and there is no
      // sensible proposed parent to extend — treat it as idle.
      if (hasProposedCheckpoint && atCheckpointBoundary) {
        // Extend the proposed parent: target checkpoint is parent + 1, and the parent's data feeds
        // into the overrides plan so getManaMinFeeAt sees the chain state propose() will write.
        proposedCheckpointData = await this.blockSource.getProposedCheckpointData();
        const expectedNumber = l2Tips.proposedCheckpoint.checkpoint.number;
        // We only cross-check `checkpointNumber`; `buildCheckpointSimulationOverridesPlan` reads
        // that field alone and asserts it equals `target - 1`. The plan does not depend on the
        // parent's block count, so a mismatch there has no observable effect.
        if (!proposedCheckpointData || proposedCheckpointData.checkpointNumber !== expectedNumber) {
          // Surprising sync state: getL2Tips() and getProposedCheckpointData() disagree on the
          // proposed checkpoint's number. Fall back to an idle simulation anchored at the
          // L1-confirmed tip rather than failing the RPC.
          this.log.warn(
            `Falling back to L1-confirmed-tip simulation: torn L2 tips snapshot. getL2Tips() reported proposed checkpoint ${expectedNumber}, but getProposedCheckpointData() reported ${
              proposedCheckpointData?.checkpointNumber ?? 'undefined'
            }`,
            {
              expectedNumber,
              actualNumber: proposedCheckpointData?.checkpointNumber,
            },
          );
          proposedCheckpointData = undefined;
          checkpointNumber = CheckpointNumber(l2Tips.checkpointed.checkpoint.number + 1);
        } else {
          checkpointNumber = CheckpointNumber(proposedCheckpointData.checkpointNumber + 1);
          // Only build the overrides plan when the proposed parent is 1-deep. When the pipeline is
          // deeper (parent's checkpoint number > checkpointed + 1), the grandparent is not yet on
          // L1 and `computePipelinedParentFeeHeader` would revert with
          // `Rollup__UnavailableTempCheckpointLog`.
          buildOverridesForProposedParent =
            proposedCheckpointData.checkpointNumber === l2Tips.checkpointed.checkpoint.number + 1;
        }
      } else {
        proposedCheckpointData = undefined;
        checkpointNumber = CheckpointNumber(l2Tips.checkpointed.checkpoint.number + 1);
      }

      // Simulation always zeroes these regardless of whether a sequencer is configured on this
      // node — the simulator does not represent the proposer's payout addresses.
      const coinbase = EthAddress.ZERO;
      const feeRecipient = AztecAddress.ZERO;

      let checkpointGlobals;
      if (buildOverridesForProposedParent) {
        // Build the overrides plan when extending a 1-deep proposed parent so getManaMinFeeAt
        // sees the chain state propose() will write. Use the async builder so the rollup contract
        // can apply the override.
        const overridesPlan = await buildCheckpointSimulationOverridesPlan({
          checkpointNumber,
          proposedCheckpointData,
          invalidateToPendingCheckpointNumber: undefined,
          checkpointedCheckpointNumber: l2Tips.checkpointed.checkpoint.number,
          rollup: this.globalVariableBuilder.getRollupContract(),
          signatureContext: { chainId: this.l1ChainId, rollupAddress: this.config.rollupAddress },
          log: this.log,
        });
        checkpointGlobals = await this.globalVariableBuilder.buildCheckpointGlobalVariables(
          coinbase,
          feeRecipient,
          targetSlot,
          overridesPlan,
        );
      } else {
        // No overrides plan: the snapshot already carries the gas fees the wallet observed, so we
        // can compose the globals synchronously without re-reading L1.
        checkpointGlobals = this.globalVariableBuilder.buildCheckpointGlobalVariablesFromSnapshot(
          coinbase,
          feeRecipient,
          snapshot,
        );
      }
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
