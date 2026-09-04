import { MAX_L1_TO_L2_MSGS_PER_BLOCK, MAX_L1_TO_L2_MSGS_PER_CHECKPOINT } from '@aztec/constants';
import { PROPOSER_PIPELINING_SLOT_OFFSET } from '@aztec/epoch-cache';
import type { EpochCacheInterface } from '@aztec/epoch-cache';
import {
  type RollupContract,
  SimulationOverridesBuilder,
  type SimulationOverridesPlan,
} from '@aztec/ethereum/contracts';
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { compact, compactArray } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { BadRequestError } from '@aztec/foundation/json-rpc';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import {
  DEFAULT_INBOX_L1_CONFIRMATIONS,
  InboxBucketConfirmationTracker,
  type InboxBucketEligibility,
  type InboxBucketSource,
  type L1BlockReader,
  immediateEligibility,
  selectInboxBucketForBlock,
} from '@aztec/sequencer-client';
import { type AvmSimulator, PublicContractsDB, PublicProcessorFactory } from '@aztec/simulator/server';
import { CollectionLimitsConfig, PublicSimulatorConfig } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2BlockSource, L2Tips } from '@aztec/stdlib/block';
import { type ProposedCheckpointData, buildCheckpointSimulationOverridesPlan } from '@aztec/stdlib/checkpoint';
import type { InboxL1Confirmations } from '@aztec/stdlib/config';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import type { MerkleTreeWriteOperations, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { type L1ToL2MessageSource, appendL1ToL2MessagesToTree, getInboxCutoffTimestamp } from '@aztec/stdlib/messaging';
import type { CoordinationSignatureContext } from '@aztec/stdlib/p2p';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import {
  type GlobalVariableBuilder,
  GlobalVariables,
  PublicSimulationOutput,
  type SimulationOverrides,
  type Tx,
} from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { applyPublicDataOverrides } from './public_data_overrides.js';

/** Inbox queries the simulator needs to predict the message bundle the next block would consume. */
type SimulatorInboxSource = InboxBucketSource & Pick<L1ToL2MessageSource, 'getInboxBucketByTotalMsgCount'>;

/** Config fields the simulator needs — a narrow subset of `AztecNodeConfig`. */
export interface NodePublicCallsSimulatorConfig {
  /** Maximum total gas limit accepted for an incoming simulation. */
  rpcSimulatePublicMaxGasLimit: number;
  /** Maximum number of debug-log memory reads collected during simulation. */
  rpcSimulatePublicMaxDebugLogMemoryReads: number;
  /**
   * Whether this node runs the automine sequencer. Automine consumes Inbox buckets the moment it sees them, so the
   * next-block prediction must not wait for an L1 confirmation the local chain will never produce on its own.
   */
  useAutomineSequencer?: boolean;
  /**
   * How many L1 confirmations the proposer waits for before consuming an Inbox bucket. The prediction has to apply
   * the same rule, so it reads the sequencer's own setting.
   */
  inboxL1Confirmations?: InboxL1Confirmations;
}

/** Dependencies required to build a {@link NodePublicCallsSimulator}. */
export interface NodePublicCallsSimulatorDeps {
  blockSource: L2BlockSource;
  worldStateSynchronizer: WorldStateSynchronizer;
  /** Inbox bucket queries, used to predict the L1-to-L2 messages the next block will consume. */
  l1ToL2MessageSource: SimulatorInboxSource;
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
  /**
   * L1 client used to tell which Inbox buckets a proposer would consider confirmed. Optional: without one the
   * prediction assumes every synced bucket is consumable, which is what automine and TXE nodes do anyway.
   */
  l1Client?: L1BlockReader;
  config: NodePublicCallsSimulatorConfig;
  /**
   * AVM execution backend the public processor drives to run public calls. Optional because unit/TXE nodes
   * that never call {@link simulate} are constructed without one; asserted at the simulation call site.
   */
  avmSimulator?: AvmSimulator;
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
 *   bump the block number. No L1 calls.
 * - **When the next block opens a new checkpoint** (the latest proposed block coincides with the
 *   proposed-checkpoint frontier): we compute fresh globals for the slot the next block will land in,
 *   applying the same `SimulationOverridesPlan` the sequencer applies so the simulated mana min fee
 *   matches what the sequencer will write into the block header.
 *
 * Either way it also predicts the L1-to-L2 message bundle the next block would consume and appends it
 * to the fork, so a transaction consuming a message that is in the Inbox but not yet in a block
 * simulates against the state it will actually run in.
 */
export class NodePublicCallsSimulator {
  private readonly blockSource: L2BlockSource;
  private readonly worldStateSynchronizer: WorldStateSynchronizer;
  private readonly l1ToL2MessageSource: SimulatorInboxSource;
  private readonly contractDataSource: ContractDataSource;
  private readonly globalVariableBuilder: GlobalVariableBuilder;
  private readonly rollupContract: RollupContract | undefined;
  private readonly epochCache: EpochCacheInterface;
  private readonly signatureContext: CoordinationSignatureContext;
  private readonly l1Client: L1BlockReader | undefined;
  private config: NodePublicCallsSimulatorConfig;
  /**
   * Shared by every simulation on this node. Its confirmations are permanent facts about L1, so a node-lifetime
   * cache is correct and keeps the RPC cost of the prediction near zero; its rejections expire every second.
   */
  private inboxBucketConfirmations: InboxBucketConfirmationTracker | undefined;
  private readonly avmSimulator?: AvmSimulator;
  private readonly telemetry: TelemetryClient;
  private readonly log: Logger;
  private readonly dateProvider = new DateProvider();

  constructor(deps: NodePublicCallsSimulatorDeps) {
    this.blockSource = deps.blockSource;
    this.worldStateSynchronizer = deps.worldStateSynchronizer;
    this.l1ToL2MessageSource = deps.l1ToL2MessageSource;
    this.contractDataSource = deps.contractDataSource;
    this.globalVariableBuilder = deps.globalVariableBuilder;
    this.rollupContract = deps.rollupContract;
    this.epochCache = deps.epochCache;
    this.signatureContext = deps.signatureContext;
    this.l1Client = deps.l1Client;
    this.config = deps.config;
    this.avmSimulator = deps.avmSimulator;
    this.telemetry = deps.telemetry ?? getTelemetryClient();
    this.log = deps.log ?? createLogger('node:public-calls-simulator');
  }

  /**
   * Applies a runtime config update. The node replaces its own config object wholesale when an operator changes a
   * setting, so the simulator is told about the change rather than reading through to it; otherwise a new
   * `inboxL1Confirmations` would move the sequencer to a different consumption rule while the next-block prediction
   * kept applying the old one. Keys absent from the update keep their current value.
   */
  public updateConfig(config: Partial<NodePublicCallsSimulatorConfig>): void {
    this.config = { ...this.config, ...compact(config) };
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
    const [l2Tips, proposedCheckpointData] = await Promise.all([
      this.blockSource.getL2Tips(),
      this.blockSource.getProposedCheckpointData(),
    ]);
    const latestBlockNumber = l2Tips.proposed.number;
    const blockNumber = BlockNumber.add(latestBlockNumber, 1);

    // Terminating block of the proposed-checkpoint frontier. `getProposedCheckpointData()` returns the
    // leading proposed (not-yet-L1-confirmed) checkpoint, whose last block is `startBlock + blockCount
    // - 1`; with no proposed checkpoint the frontier coincides with the checkpointed tip.
    const proposedCheckpointLastBlock = proposedCheckpointData
      ? BlockNumber.add(proposedCheckpointData.startBlock, proposedCheckpointData.blockCount - 1)
      : l2Tips.checkpointed.block.number;

    // The next block continues the in-progress checkpoint when the latest proposed block is ahead of
    // the proposed-checkpoint terminating block; it opens a new checkpoint when they coincide.
    const atCheckpointBoundary = proposedCheckpointLastBlock === l2Tips.proposed.number;

    const { globalVariables: newGlobalVariables } = atCheckpointBoundary
      ? await this.buildGlobalVariablesForNewCheckpoint(l2Tips, proposedCheckpointData, blockNumber)
      : { globalVariables: await this.copyGlobalVariablesFromLatestProposedBlock(latestBlockNumber, blockNumber) };

    if (!this.avmSimulator) {
      throw new Error('NodePublicCallsSimulator.simulate requires an AVM simulator, but none was configured');
    }
    const publicProcessorFactory = new PublicProcessorFactory(
      this.contractDataSource,
      this.avmSimulator,
      this.dateProvider,
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

    // Request a new fork of the world state at the latest block number, then apply the next block's predicted
    // L1-to-L2 message bundle and any caller overrides to it before simulation.
    await using merkleTreeFork = await this.worldStateSynchronizer.fork(latestBlockNumber);

    await this.appendPredictedL1ToL2Messages(merkleTreeFork, {
      slotNumber: newGlobalVariables.slotNumber,
      checkpointStartBlock: atCheckpointBoundary ? undefined : proposedCheckpointLastBlock,
    });

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
   * Appends the L1-to-L2 message bundle the next block would consume to the simulation fork, so a transaction
   * consuming a message that has reached the Inbox but no block yet simulates against the state it will run in.
   * Runs the same bucket selection the sequencer runs (the per-block and per-checkpoint caps), treating the next
   * block as non-final: the censorship cutoff only widens consumption on a checkpoint's last block, and the node
   * cannot know whether the next block is it.
   *
   * Best-effort. Any failure — Inbox buckets not synced yet, a torn archiver snapshot — leaves the fork at the tip
   * state, which is what the transaction sees if the next block consumes nothing.
   */
  private async appendPredictedL1ToL2Messages(
    fork: MerkleTreeWriteOperations,
    opts: {
      /** Slot the next block lands in; anchors the censorship cutoff. */
      slotNumber: SlotNumber;
      /** Last block of the checkpoint the next block extends; undefined when the next block opens a checkpoint. */
      checkpointStartBlock: BlockNumber | undefined;
    },
  ): Promise<void> {
    try {
      const parentTotalMsgCount = (await fork.getTreeInfo(MerkleTreeId.L1_TO_L2_MESSAGE_TREE)).size;
      const parentBucket = await this.l1ToL2MessageSource.getInboxBucketByTotalMsgCount(parentTotalMsgCount);
      if (parentBucket === undefined) {
        this.log.debug(`Inbox bucket at message total ${parentTotalMsgCount} not synced; simulating against the tip`, {
          parentTotalMsgCount,
        });
        return;
      }

      // Origin of the per-checkpoint cap: the total consumed as of the checkpoint's parent. A block extending an
      // in-progress checkpoint reads it off that checkpoint's parent block; a block opening one starts from the tip.
      const checkpointStartTotalMsgCount =
        opts.checkpointStartBlock === undefined
          ? parentTotalMsgCount
          : await this.getConsumedMessageTotal(opts.checkpointStartBlock);
      if (checkpointStartTotalMsgCount === undefined) {
        this.log.debug(`Block ${opts.checkpointStartBlock} has no header on this node; simulating against the tip`);
        return;
      }

      const l1Constants = this.epochCache.getL1Constants();
      const selection = await selectInboxBucketForBlock({
        messageSource: this.l1ToL2MessageSource,
        now: BigInt(Math.floor(this.dateProvider.now() / 1000)),
        isEligible: this.getInboxBucketEligibility(l1Constants.ethereumSlotDuration),
        ethereumSlotDuration: l1Constants.ethereumSlotDuration,
        parent: { seq: parentBucket.seq, totalMsgCount: parentBucket.totalMsgCount },
        checkpointStartTotalMsgCount,
        perBlockCap: MAX_L1_TO_L2_MSGS_PER_BLOCK,
        perCheckpointCap: MAX_L1_TO_L2_MSGS_PER_CHECKPOINT,
        isLastBlock: false,
        cutoffTimestamp: getInboxCutoffTimestamp(opts.slotNumber, l1Constants),
      });
      if (!selection.consume || selection.bundle.length === 0) {
        return;
      }

      await appendL1ToL2MessagesToTree(fork, selection.bundle);
      this.log.debug(`Appended ${selection.bundle.length} predicted L1-to-L2 messages to the simulation fork`, {
        bucketSeq: selection.bucket.seq,
        messageCount: selection.bundle.length,
      });
    } catch (err) {
      this.log.verbose(`Could not predict the next block's L1-to-L2 messages, simulating against the tip: ${err}`);
    }
  }

  /**
   * The eligibility rule the next proposer is expected to apply. It has to match the sequencer's: a transaction
   * simulated against a bundle no proposer will consume yet enters the pool and then fails when the block that
   * includes it consumes less. So it follows the same `inboxL1Confirmations` setting the proposer does. Automine,
   * and any node without an L1 client, never wait, so those predict against every synced bucket regardless.
   */
  private getInboxBucketEligibility(ethereumSlotDuration: number): InboxBucketEligibility {
    if (
      (this.config.inboxL1Confirmations ?? DEFAULT_INBOX_L1_CONFIRMATIONS) === 0 ||
      this.config.useAutomineSequencer ||
      this.l1Client === undefined
    ) {
      return immediateEligibility;
    }
    this.inboxBucketConfirmations ??= new InboxBucketConfirmationTracker({
      l1Client: this.l1Client,
      ethereumSlotDuration,
      log: this.log.createChild('inbox-bucket-confirmation'),
    });
    return this.inboxBucketConfirmations.isEligible;
  }

  /** Cumulative Inbox message total consumed as of `blockNumber`, i.e. its L1-to-L2 message tree leaf count. */
  private async getConsumedMessageTotal(blockNumber: BlockNumber): Promise<bigint | undefined> {
    if (blockNumber === BlockNumber.ZERO) {
      return 0n;
    }
    const block = await this.blockSource.getBlockData({ number: blockNumber });
    return block === undefined ? undefined : BigInt(block.header.state.l1ToL2MessageTree.nextAvailableLeafIndex);
  }

  /**
   * Continues an in-progress checkpoint: the next block extends the checkpoint the latest proposed
   * block belongs to. Every block in a checkpoint shares the same `CheckpointGlobalVariables`, so the
   * next block's globals are the latest proposed block's globals with only the block number bumped —
   * including the proposer's real coinbase/feeRecipient. No L1 reads happen here.
   *
   * A missing header means the archiver reported a proposed tip via `getL2Tips` but no longer has its
   * data (a torn snapshot). We throw a transient/retryable error rather than treating the next block as
   * opening a new checkpoint, whose globals would be built for the wrong slot.
   */
  private async copyGlobalVariablesFromLatestProposedBlock(
    latestBlockNumber: BlockNumber,
    blockNumber: BlockNumber,
  ): Promise<GlobalVariables> {
    const latestBlockData = await this.blockSource.getBlockData({ number: latestBlockNumber });
    if (!latestBlockData) {
      throw new Error(
        `Cannot simulate public calls: latest proposed block ${latestBlockNumber} has no header on this node ` +
          `(torn archiver snapshot); retry`,
      );
    }
    return GlobalVariables.from({ ...latestBlockData.header.globalVariables, blockNumber });
  }

  /**
   * Opens a new checkpoint: the next block is the first of a fresh checkpoint. Picks the slot the next
   * block will land in, mirroring the sequencer, and builds the same `SimulationOverridesPlan` the
   * sequencer applies so the simulated mana min fee matches what the sequencer will write into the
   * block header. Coinbase and fee recipient stay zero (we cannot know the future proposer's payout
   * addresses), unlike continuing an in-progress checkpoint which inherits the real ones from the
   * proposed header.
   */
  private async buildGlobalVariablesForNewCheckpoint(
    l2Tips: L2Tips,
    proposedCheckpointData: ProposedCheckpointData | undefined,
    blockNumber: BlockNumber,
  ): Promise<{ globalVariables: GlobalVariables }> {
    const checkpointedCheckpointNumber = l2Tips.checkpointed.checkpoint.number;

    const targetSlot = this.computeTargetSlot(proposedCheckpointData);
    const plan = await this.buildSimulationOverridesPlan(proposedCheckpointData, checkpointedCheckpointNumber);

    const checkpointGlobalVariables = await this.globalVariableBuilder.buildCheckpointGlobalVariables(
      EthAddress.ZERO,
      AztecAddress.ZERO,
      targetSlot,
      plan,
    );

    return {
      globalVariables: GlobalVariables.from({ blockNumber, ...checkpointGlobalVariables }),
    };
  }

  /**
   * Slot the next block will land in. The first term is the sequencer's exact formula
   * (`getEpochAndSlotInNextL1Slot().slot + PROPOSER_PIPELINING_SLOT_OFFSET`). The `max` with
   * `proposedCheckpointSlot + 1` is an RPC-side approximation of the next build: when a proposed
   * checkpoint is gossiped before its L1 slot starts, the next build (once its wall clock arrives)
   * will target `parentSlot + 1`. The sequencer never advances its own target past wall clock — it
   * just declines to build — so this is a prediction of inclusion globals, not literal sequencer
   * behavior. The parent slot comes from the proposed checkpoint header so the slot and the
   * overrides plan cannot derive from different snapshots.
   */
  private computeTargetSlot(proposedCheckpointData: ProposedCheckpointData | undefined): SlotNumber {
    const slotFromNextL1Timestamp =
      this.epochCache.getEpochAndSlotInNextL1Slot().slot + PROPOSER_PIPELINING_SLOT_OFFSET;
    const slotAfterProposedCheckpoint = proposedCheckpointData
      ? proposedCheckpointData.header.slotNumber + 1
      : undefined;
    return SlotNumber(Math.max(...compactArray([slotFromNextL1Timestamp, slotAfterProposedCheckpoint])));
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
  private async buildSimulationOverridesPlan(
    proposedCheckpointData: ProposedCheckpointData | undefined,
    checkpointedCheckpointNumber: CheckpointNumber,
  ): Promise<SimulationOverridesPlan | undefined> {
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

      const validationStatus = await this.blockSource.getPendingChainValidationStatus();
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

    return new SimulationOverridesBuilder()
      .withChainTips({ pending: checkpointedCheckpointNumber, proven: checkpointedCheckpointNumber })
      .build();
  }
}
