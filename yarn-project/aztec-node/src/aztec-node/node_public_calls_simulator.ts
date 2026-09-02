import { L1ToL2MessagesNotReadyError } from '@aztec/archiver';
import { PROPOSER_PIPELINING_SLOT_OFFSET } from '@aztec/epoch-cache';
import type { EpochCacheInterface } from '@aztec/epoch-cache';
import {
  type RollupContract,
  SimulationOverridesBuilder,
  type SimulationOverridesPlan,
} from '@aztec/ethereum/contracts';
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { compactArray } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { BadRequestError } from '@aztec/foundation/json-rpc';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { isErrorClass } from '@aztec/foundation/types';
import { PublicContractsDB, PublicProcessorFactory } from '@aztec/simulator/server';
import { CollectionLimitsConfig, PublicSimulatorConfig } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type L2BlockSource, type L2Frontier, getCheckpointedTipSlot } from '@aztec/stdlib/block';
import { type ProposedCheckpointData, buildCheckpointSimulationOverridesPlan } from '@aztec/stdlib/checkpoint';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { type L1ToL2MessageSource, appendL1ToL2MessagesToTree } from '@aztec/stdlib/messaging';
import type { CoordinationSignatureContext } from '@aztec/stdlib/p2p';
import {
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
  /**
   * Rollup contract used to build the fee-relevant L1 state overrides when opening a new checkpoint.
   * Only needed when a proposed parent checkpoint exists (pipelining) or the pending chain is invalid;
   * may be omitted in environments that never reach those states (e.g. TXE). When omitted, those paths
   * degrade to a pinned-tips plan (non-pipelined fees) instead.
   */
  rollupContract?: RollupContract;
  epochCache: EpochCacheInterface;
  signatureContext: CoordinationSignatureContext;
  config: NodePublicCallsSimulatorConfig;
  telemetry?: TelemetryClient;
  log?: Logger;
}

/**
 * Simulates the public part of a transaction against a fresh world-state fork.
 *
 * Extracted from `AztecNodeService` so the slot/globals selection can be unit-tested without
 * standing up the whole node, and to keep `server.ts` smaller.
 *
 * The simulator picks globals in one of two ways, mirroring how the sequencer builds the next block:
 * - **When the next block continues an in-progress checkpoint** (the latest proposed block is ahead of
 *   the proposed-checkpoint frontier): every block in a checkpoint shares the same
 *   `CheckpointGlobalVariables`, so we copy the latest proposed block's globals verbatim and only
 *   bump the block number. No L1 calls, no L1-to-L2 message insertion.
 * - **When the next block opens a new checkpoint** (the latest proposed block coincides with the
 *   proposed-checkpoint frontier): we compute fresh globals for the slot the next block will land in,
 *   applying the same `SimulationOverridesPlan` the sequencer applies so the simulated mana min fee
 *   matches what the sequencer will write into the block header.
 */
export class NodePublicCallsSimulator {
  private readonly blockSource: L2BlockSource;
  private readonly worldStateSynchronizer: WorldStateSynchronizer;
  private readonly l1ToL2MessageSource: L1ToL2MessageSource;
  private readonly contractDataSource: ContractDataSource;
  private readonly globalVariableBuilder: GlobalVariableBuilder;
  private readonly rollupContract: RollupContract | undefined;
  private readonly epochCache: EpochCacheInterface;
  private readonly signatureContext: CoordinationSignatureContext;
  private readonly config: NodePublicCallsSimulatorConfig;
  private readonly telemetry: TelemetryClient;
  private readonly log: Logger;

  constructor(deps: NodePublicCallsSimulatorDeps) {
    this.blockSource = deps.blockSource;
    this.worldStateSynchronizer = deps.worldStateSynchronizer;
    this.l1ToL2MessageSource = deps.l1ToL2MessageSource;
    this.contractDataSource = deps.contractDataSource;
    this.globalVariableBuilder = deps.globalVariableBuilder;
    this.rollupContract = deps.rollupContract;
    this.epochCache = deps.epochCache;
    this.signatureContext = deps.signatureContext;
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
    // One atomic read: the tips, the leading proposed checkpoint, the latest block header, the checkpointed
    // checkpoint and the pending-chain validation status all describe the same instant, so no two decisions
    // below can derive from different chain states.
    const frontier = await this.blockSource.getL2Frontier();
    const { tips: l2Tips, proposedCheckpoint: proposedCheckpointData } = frontier;
    const latestBlockNumber = l2Tips.proposed.number;
    const blockNumber = BlockNumber.add(latestBlockNumber, 1);

    // Terminating block of the proposed-checkpoint frontier: the leading proposed (not-yet-L1-confirmed)
    // checkpoint's last block is `startBlock + blockCount - 1`; with no proposed checkpoint the frontier
    // coincides with the checkpointed tip.
    const proposedCheckpointLastBlock = proposedCheckpointData
      ? BlockNumber.add(proposedCheckpointData.startBlock, proposedCheckpointData.blockCount - 1)
      : l2Tips.checkpointed.block.number;

    // The next block continues the in-progress checkpoint when the latest proposed block is ahead of
    // the proposed-checkpoint terminating block; it opens a new checkpoint when they coincide.
    const atCheckpointBoundary = proposedCheckpointLastBlock === l2Tips.proposed.number;

    // `targetCheckpoint` is the checkpoint whose L1-to-L2 messages must be inserted into the fork
    // before simulation. Only set when opening a new checkpoint, where the next block is its first block.
    const { globalVariables: newGlobalVariables, targetCheckpoint } = atCheckpointBoundary
      ? await this.buildGlobalVariablesForNewCheckpoint(frontier, blockNumber)
      : { globalVariables: this.copyGlobalVariablesFromLatestProposedBlock(frontier, blockNumber) };

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
    });

    // Ensure world-state has caught up with the latest block we loaded from the archiver
    await this.worldStateSynchronizer.syncImmediate(latestBlockNumber);

    const nextCheckpointMessages = await this.getNextCheckpointMessages(targetCheckpoint);

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

  /**
   * Continues an in-progress checkpoint: the next block extends the checkpoint the latest proposed
   * block belongs to. Every block in a checkpoint shares the same `CheckpointGlobalVariables`, so the
   * next block's globals are the latest proposed block's globals with only the block number bumped —
   * including the proposer's real coinbase/feeRecipient. No L1 reads and no L1-to-L2 message insertion
   * happen here.
   *
   * The header comes from the same snapshot as the tips, so it cannot describe a different block than the
   * proposed tip. A missing header at a non-genesis proposed tip is an invariant violation and throws rather
   * than falling through to the new-checkpoint path: the fork at `latestBlockNumber` already contains the
   * ongoing checkpoint's L1-to-L2 messages, so inserting the next checkpoint's messages would append them a
   * second time.
   */
  private copyGlobalVariablesFromLatestProposedBlock(frontier: L2Frontier, blockNumber: BlockNumber): GlobalVariables {
    const latestBlockNumber = frontier.tips.proposed.number;
    if (!frontier.latestBlockHeader) {
      throw new Error(
        `Cannot simulate public calls: frontier reports proposed tip ${latestBlockNumber} but carries no header`,
      );
    }
    return GlobalVariables.from({ ...frontier.latestBlockHeader.globalVariables, blockNumber });
  }

  /**
   * Opens a new checkpoint: the next block is the first of a fresh checkpoint. Picks the slot the next
   * block will land in, mirroring the sequencer, and builds the same `SimulationOverridesPlan` the
   * sequencer applies so the simulated mana min fee matches what the sequencer will write into the
   * block header. Coinbase and fee recipient stay zero (we cannot know the future proposer's payout
   * addresses), unlike continuing an in-progress checkpoint which inherits the real ones from the
   * proposed header. Returns the target checkpoint so the caller inserts that checkpoint's L1-to-L2
   * messages into the fork.
   */
  private async buildGlobalVariablesForNewCheckpoint(
    frontier: L2Frontier,
    blockNumber: BlockNumber,
  ): Promise<{ globalVariables: GlobalVariables; targetCheckpoint: CheckpointNumber }> {
    const proposedCheckpointData = frontier.proposedCheckpoint;
    const checkpointedCheckpointNumber = frontier.tips.checkpointed.checkpoint.number;
    // The new checkpoint sits on top of the proposed one when pipelining, otherwise on the
    // checkpointed tip. The target slot and the overrides plan both derive from the same frontier
    // snapshot, so they cannot disagree about the proposed parent.
    const proposedCheckpointNumber = proposedCheckpointData?.checkpointNumber ?? checkpointedCheckpointNumber;

    // Undefined before the first checkpoint lands: no slot is taken yet, so there is no floor.
    const checkpointedTipSlot = frontier.checkpointedCheckpoint ? getCheckpointedTipSlot(frontier) : undefined;
    const targetSlot = this.computeTargetSlot(proposedCheckpointData, checkpointedTipSlot);
    const plan = await this.buildSimulationOverridesPlan(frontier, checkpointedCheckpointNumber);

    const checkpointGlobalVariables = await this.globalVariableBuilder.buildCheckpointGlobalVariables(
      EthAddress.ZERO,
      AztecAddress.ZERO,
      targetSlot,
      plan,
    );

    return {
      globalVariables: GlobalVariables.from({ blockNumber, ...checkpointGlobalVariables }),
      targetCheckpoint: CheckpointNumber(proposedCheckpointNumber + 1),
    };
  }

  /**
   * Slot the next block will land in, the largest of three terms:
   *
   * - The sequencer's exact formula, `getEpochAndSlotInNextL1Slot().slot + PROPOSER_PIPELINING_SLOT_OFFSET`.
   * - `proposedCheckpointSlot + 1`, an RPC-side approximation of the next build: when a proposed checkpoint
   *   is gossiped before its L1 slot starts, the next build (once its wall clock arrives) will target
   *   `parentSlot + 1`. The sequencer never advances its own target past wall clock — it just declines to
   *   build — so this is a prediction of inclusion globals, not literal sequencer behavior. The parent slot
   *   comes from the proposed checkpoint header so the slot and the overrides plan cannot derive from
   *   different snapshots.
   * - `checkpointedTipSlot + 1`, a floor: the next block can never land in a slot already taken by a
   *   checkpointed checkpoint. The slot comes from the frontier's checkpointed checkpoint header, so it
   *   describes the same instant as the tips and the proposed checkpoint. This only binds when this node's
   *   clock is behind the chain, in which case the first term would otherwise price the next block in a slot
   *   L1 has already moved past — and the L1 gas oracle can step between the two, so wallet quotes and
   *   simulations would disagree on the fee.
   */
  private computeTargetSlot(
    proposedCheckpointData: ProposedCheckpointData | undefined,
    checkpointedTipSlot: SlotNumber | undefined,
  ): SlotNumber {
    const slotFromNextL1Timestamp =
      this.epochCache.getEpochAndSlotInNextL1Slot().slot + PROPOSER_PIPELINING_SLOT_OFFSET;
    const slotAfterProposedCheckpoint = proposedCheckpointData
      ? proposedCheckpointData.header.slotNumber + 1
      : undefined;
    const slotAfterCheckpointedTip = checkpointedTipSlot !== undefined ? checkpointedTipSlot + 1 : undefined;
    return SlotNumber(
      Math.max(...compactArray([slotFromNextL1Timestamp, slotAfterProposedCheckpoint, slotAfterCheckpointedTip])),
    );
  }

  /**
   * Builds the chain-state overrides plan the simulator passes to `buildCheckpointGlobalVariables`,
   * mirroring the sequencer (which always pins tips to neutralize prunes). When pipelining, the plan
   * carries the proposed parent's archive, temp-checkpoint-log cell, and locally-derived fee header.
   *
   * Both the pipelining and invalid-pending-chain paths need a rollup contract for the L1 fee reads.
   * Environments that omit it (e.g. TXE, which never has a proposed checkpoint and whose pending chain
   * is always valid) fall back to pinning both pending and proven tips to the checkpointed tip, which
   * neutralizes prunes in fee computation at the cost of non-pipelined fees.
   */
  private buildSimulationOverridesPlan(
    frontier: L2Frontier,
    checkpointedCheckpointNumber: CheckpointNumber,
  ): Promise<SimulationOverridesPlan | undefined> {
    const proposedCheckpointData = frontier.proposedCheckpoint;
    const rollup = this.rollupContract;
    if (rollup) {
      if (proposedCheckpointData) {
        return buildCheckpointSimulationOverridesPlan({
          checkpointNumber: CheckpointNumber(proposedCheckpointData.checkpointNumber + 1),
          proposedCheckpointData,
          checkpointedCheckpointNumber,
          rollup,
          signatureContext: this.signatureContext,
          log: this.log,
        });
      }

      const validationStatus = frontier.pendingChainValidationStatus;
      if (!validationStatus.valid) {
        return buildCheckpointSimulationOverridesPlan({
          checkpointNumber: CheckpointNumber(checkpointedCheckpointNumber + 1),
          invalidateToPendingCheckpointNumber: CheckpointNumber(validationStatus.checkpoint.checkpointNumber - 1),
          checkpointedCheckpointNumber,
          rollup,
          signatureContext: this.signatureContext,
          log: this.log,
        });
      }
    }

    return Promise.resolve(
      new SimulationOverridesBuilder()
        .withChainTips({ pending: checkpointedCheckpointNumber, proven: checkpointedCheckpointNumber })
        .build(),
    );
  }
}
