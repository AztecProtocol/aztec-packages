import type { EpochCache } from '@aztec/epoch-cache';
import {
  BlockNumber,
  CheckpointNumber,
  CheckpointProposalHash,
  EpochNumber,
  SlotNumber,
} from '@aztec/foundation/branded-types';
import { countWhile, filterAsync, fromEntries, getEntries, mapValues } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { L2TipsMemoryStore, type L2TipsStore } from '@aztec/kv-store/stores';
import type { P2PClient } from '@aztec/p2p';
import {
  OffenseType,
  WANT_TO_SLASH_EVENT,
  type WantToSlashArgs,
  type Watcher,
  type WatcherEmitter,
} from '@aztec/slasher';
import type { SlasherConfig } from '@aztec/slasher/config';
import {
  type L2BlockSource,
  L2BlockStream,
  type L2BlockStreamEvent,
  type L2BlockStreamEventHandler,
  getAttestationInfoFromPublishedCheckpoint,
} from '@aztec/stdlib/block';
import type { CheckpointReexecutionTracker } from '@aztec/stdlib/checkpoint';
import type { ChainConfig } from '@aztec/stdlib/config';
import { getEpochAtSlot, getSlotRangeForEpoch, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import { ConsensusPayload, type CoordinationSignatureContext } from '@aztec/stdlib/p2p';
import type {
  SingleValidatorStats,
  ValidatorStats,
  ValidatorStatusHistory,
  ValidatorStatusInSlot,
  ValidatorStatusType,
  ValidatorsEpochPerformance,
  ValidatorsStats,
} from '@aztec/stdlib/validators';

import EventEmitter from 'node:events';

import type { SentinelConfig } from './config.js';
import { SentinelStore } from './store.js';

export type SentinelRuntimeConfig = Pick<
  SlasherConfig,
  'slashInactivityTargetPercentage' | 'slashInactivityPenalty' | 'slashInactivityConsecutiveEpochThreshold'
> &
  Pick<SentinelConfig, 'sentinelEpochEndBufferSlots'> &
  Pick<ChainConfig, 'l1ChainId' | 'rollupAddress'>;

/** Maps a validator status to its category: proposer or attestation. */
function statusToCategory(status: ValidatorStatusInSlot): ValidatorStatusType {
  switch (status) {
    case 'attestation-sent':
    case 'attestation-missed':
      return 'attestation';
    default:
      return 'proposer';
  }
}

/**
 * The Sentinel observes validator behaviour every L2 slot, classifies it into a per-slot status,
 * aggregates those statuses into per-epoch performance once each epoch is fully observed, and
 * emits inactivity slash payloads when a validator has been inactive for the configured number
 * of consecutive epochs.
 *
 * ## Two cadences
 *
 * The sentinel runs `work()` every quarter L2 slot and drives two independent pipelines:
 *
 * 1. **Per-slot activity recording.** `processSlot(currentSlot - 2)` runs once per slot, with a
 *    two-slot lag to let P2P attestations settle and the archiver catch up. It classifies each
 *    committee member's behaviour for that slot via `getSlotActivity` and persists the result to
 *    `SentinelStore.historyMap` (sliding window of `sentinelHistoryLengthInEpochs * epochDuration`
 *    slots, default 24 epochs).
 *
 * 2. **Per-epoch evaluation.** `processEpochEnds(currentSlot)` runs every tick too. Once
 *    `sentinelEpochEndBufferSlots` (default 2) has elapsed past an epoch's last slot AND the
 *    per-slot recorder has covered that last slot, the sentinel calls `handleEpochEnd(epoch)`.
 *    That aggregates the slot-level statuses for the epoch into per-validator `{missed, total}`,
 *    persists it to `SentinelStore.epochMap` (default 2000-epoch window), and runs the slashing
 *    decision.
 *
 * Triggering per-epoch evaluation off local L2 state — rather than waiting for L1 proof
 * publication — decouples slashing from prover availability.
 *
 * ## Six-case taxonomy in `getSlotActivity`
 *
 * For each slot, the sentinel assigns the proposer one of six statuses, ranked highest-confidence
 * first:
 *
 *  - `checkpoint-mined`        — a checkpoint covering this slot has landed on L1
 *                                (`slotNumberToCheckpoint` populated from `chain-checkpointed`).
 *  - `checkpoint-valid`        — the local node re-executed a checkpoint proposal for this slot
 *                                successfully (consulted via `CheckpointReexecutionTracker`).
 *  - `checkpoint-invalid`      — the local node re-executed a checkpoint proposal for this slot
 *                                and rejected it (e.g. header/archive/out-hash mismatch, limit
 *                                breach). Proposer-fault.
 *  - `checkpoint-unvalidated`  — the local node observed a checkpoint proposal but could not
 *                                validate it (missing blocks/txs, timeouts). Treated as
 *                                proposer-fault for slashing.
 *  - `checkpoint-missed`       — block proposals seen on P2P but no checkpoint proposal at all.
 *  - `blocks-missed`           — no block proposals seen for this slot.
 *
 * Missing-attestor faults are recorded only in `checkpoint-mined` and `checkpoint-valid`, where
 * the local node has positive evidence the checkpoint was canonical or valid. In the other four
 * cases the proposer is at fault and no attestor penalty applies.
 *
 * ## Re-execution tracker
 *
 * `CheckpointReexecutionTracker` is populated by the validator client's checkpoint proposal
 * handler. Every early return in `validateCheckpointProposal` records an outcome
 * (`valid` / `invalid` / `unvalidated`) keyed by slot.
 *
 * ## Inactivity slashing
 *
 * `handleEpochPerformance` filters the epoch's per-validator stats by
 * `slashInactivityTargetPercentage` and then calls `checkPastInactivity` to require
 * `slashInactivityConsecutiveEpochThreshold` consecutive past epochs over the same threshold
 * (read from `SentinelStore.epochMap`). Only validators meeting both conditions are emitted as
 * `WANT_TO_SLASH_EVENT` with `OffenseType.INACTIVITY`. The slot-level counters that feed this —
 * `missedProposals` and `missedAttestations` — include the four proposer-fault statuses plus
 * `attestation-missed`.
 *
 * ## Escape hatch
 *
 * If `epochCache.getCommittee(slot)` reports `isEscapeHatchOpen`, per-slot recording is skipped
 * (no history entries for that slot) and per-epoch evaluation writes an empty performance map
 * (no slashing).
 */
export class Sentinel extends (EventEmitter as new () => WatcherEmitter) implements L2BlockStreamEventHandler, Watcher {
  protected runningPromise: RunningPromise;
  protected blockStream!: L2BlockStream;
  protected l2TipsStore: L2TipsStore;

  protected initialSlot: SlotNumber | undefined;
  protected lastProcessedSlot: SlotNumber | undefined;
  /** Largest epoch number for which the end-of-epoch aggregator has run. */
  protected lastEvaluatedEpoch: EpochNumber | undefined;
  protected slotNumberToCheckpoint: Map<
    SlotNumber,
    {
      checkpointNumber: CheckpointNumber;
      archive: string;
      /** Hex keccak256 of the consensus payload bytes; used to fetch matching p2p attestations. */
      proposalPayloadHash: CheckpointProposalHash;
      attestors: EthAddress[];
    }
  > = new Map();

  constructor(
    protected epochCache: EpochCache,
    protected archiver: L2BlockSource,
    protected p2p: P2PClient,
    protected store: SentinelStore,
    protected reexecutionTracker: CheckpointReexecutionTracker,
    protected config: SentinelRuntimeConfig,
    protected logger = createLogger('node:sentinel'),
  ) {
    super();
    this.l2TipsStore = new L2TipsMemoryStore(archiver.getGenesisBlockHash());
    const interval = (epochCache.getL1Constants().ethereumSlotDuration * 1000) / 4;
    this.runningPromise = new RunningPromise(this.work.bind(this), logger, interval);
  }

  private getSignatureContext(): CoordinationSignatureContext {
    return {
      chainId: this.config.l1ChainId,
      rollupAddress: this.config.rollupAddress,
    };
  }

  public updateConfig(config: Partial<SlasherConfig>) {
    this.config = { ...this.config, ...config };
  }

  public async start() {
    await this.init();
    this.runningPromise.start();
  }

  /**
   * Loads initial slot and initializes blockstream. We will not process anything at or before
   * the initial slot. Floors at the archiver's synced L2 slot so the sentinel keeps making
   * forward progress when L1 is advancing but L2 has no activity (the synced slot is driven by
   * L1 sync, not by L2 blocks). Falls back to the wallclock if the archiver isn't ready yet
   * (cold start).
   */
  protected async init() {
    this.initialSlot = await this.getCurrentSlot();
    const startingBlock = BlockNumber(await this.archiver.getBlockNumber());
    this.logger.info(`Starting validator sentinel with initial slot ${this.initialSlot} and block ${startingBlock}`);
    this.blockStream = new L2BlockStream(this.archiver, this.l2TipsStore, this, this.logger, { startingBlock });
  }

  /**
   * Returns the L2 slot the sentinel should treat as "current": the archiver's last fully
   * synced L2 slot, falling back to the wallclock slot when the archiver isn't ready yet
   * (cold start). Anchoring to the synced slot keeps timing arithmetic (initial floor,
   * per-slot lag, end-of-epoch buffer, stats-range fallback) from speculating ahead of where
   * L1 actually is.
   */
  protected async getCurrentSlot(): Promise<SlotNumber> {
    return (await this.archiver.getSyncedL2SlotNumber()) ?? this.epochCache.getSlotNow();
  }

  public stop() {
    return this.runningPromise.stop();
  }

  public async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    await this.l2TipsStore.handleBlockStreamEvent(event);
    if (event.type === 'chain-checkpointed') {
      this.handleCheckpoint(event);
    }
  }

  protected handleCheckpoint(event: L2BlockStreamEvent) {
    if (event.type !== 'chain-checkpointed') {
      return;
    }
    const checkpoint = event.checkpoint;

    // Store mapping from slot to archive, checkpoint number, attestors, and the consensus payload
    // hash (used to query matching p2p attestations regardless of feeAssetPriceModifier variants).
    const signatureContext = this.getSignatureContext();
    const proposalPayloadHash = CheckpointProposalHash.fromBuffer(
      ConsensusPayload.fromCheckpoint(checkpoint.checkpoint, signatureContext).getPayloadHash(),
    );
    this.slotNumberToCheckpoint.set(checkpoint.checkpoint.header.slotNumber, {
      checkpointNumber: checkpoint.checkpoint.number,
      archive: checkpoint.checkpoint.archive.root.toString(),
      proposalPayloadHash,
      attestors: getAttestationInfoFromPublishedCheckpoint(checkpoint, signatureContext)
        .filter(a => a.status === 'recovered-from-signature')
        .map(a => a.address!),
    });

    // Prune the archive map to only keep at most N entries
    const historyLength = this.store.getHistoryLength();
    if (this.slotNumberToCheckpoint.size > historyLength) {
      const toDelete = Array.from(this.slotNumberToCheckpoint.keys())
        .sort((a, b) => Number(a - b))
        .slice(0, this.slotNumberToCheckpoint.size - historyLength);
      for (const key of toDelete) {
        this.slotNumberToCheckpoint.delete(key);
      }
    }
  }

  /**
   * Called once per epoch, after the configured end-of-epoch buffer has elapsed beyond the
   * epoch's last slot. Computes per-epoch performance from the slot-level history collected
   * by `processSlot` and emits any inactivity slash payloads.
   */
  protected async handleEpochEnd(epoch: EpochNumber) {
    this.logger.debug(`Computing epoch performance for epoch ${epoch}`);
    const performance = await this.computeEpochPerformance(epoch);
    this.logger.info(`Computed epoch performance for epoch ${epoch}`, performance);

    await this.store.updateEpochPerformance(epoch, performance);
    await this.handleEpochPerformance(epoch, performance);
  }

  protected async computeEpochPerformance(epoch: EpochNumber): Promise<ValidatorsEpochPerformance> {
    const [fromSlot, toSlot] = getSlotRangeForEpoch(epoch, this.epochCache.getL1Constants());
    const { committee, isEscapeHatchOpen } = await this.epochCache.getCommittee(fromSlot);
    if (isEscapeHatchOpen) {
      this.logger.info(`Skipping epoch performance for epoch ${epoch} - escape hatch is open`);
      return {};
    }
    if (!committee) {
      this.logger.trace(`No committee found for slot ${fromSlot}`);
      return {};
    }

    const stats = await this.computeStats({
      fromSlot,
      toSlot,
      validators: committee,
    });
    this.logger.debug(`Stats for epoch ${epoch}`, { ...stats, fromSlot, toSlot, epoch });

    // Note that we are NOT using the total slots in the epoch as `total` here, since we only
    // compute missed attestations over the blocks that had a proposal in them. So, let's say
    // we have an epoch with 10 slots, but only 5 had a block proposal. A validator that was
    // offline, assuming they were not picked as proposer, will then be reported as having missed
    // 5/5 attestations. If we used the total, they'd be reported as 5/10, which would probably
    // allow them to avoid being slashed.
    return mapValues(stats.stats, stat => ({
      missed: stat.missedAttestations.count + stat.missedProposals.count,
      total: stat.missedAttestations.total + stat.missedProposals.total,
    }));
  }

  /**
   * Checks if a validator has been inactive for the specified number of consecutive epochs for which we have data on it.
   * @param validator The validator address to check
   * @param currentEpoch Epochs strictly before the current one are evaluated only
   * @param requiredConsecutiveEpochs Number of consecutive epochs required for slashing
   */
  protected async checkPastInactivity(
    validator: EthAddress,
    currentEpoch: EpochNumber,
    requiredConsecutiveEpochs: number,
  ): Promise<boolean> {
    if (requiredConsecutiveEpochs === 0) {
      return true;
    }

    // Get all historical per-epoch performance for this validator
    const allPerformance = await this.store.getEpochPerformance(validator);

    // Sort by epoch descending to get most recent first, keep only epochs strictly before the current one, and get the first N
    const pastEpochs = allPerformance.sort((a, b) => Number(b.epoch - a.epoch)).filter(p => p.epoch < currentEpoch);

    // If we don't have enough historical data, don't slash
    if (pastEpochs.length < requiredConsecutiveEpochs) {
      this.logger.debug(
        `Not enough historical data for slashing ${validator} for inactivity (${allPerformance.length} epochs < ${requiredConsecutiveEpochs} required)`,
      );
      return false;
    }

    // Check that we have at least requiredConsecutiveEpochs and that all of them are above the inactivity threshold
    return pastEpochs
      .slice(0, requiredConsecutiveEpochs)
      .every(p => (p.total === 0 ? false : p.missed / p.total >= this.config.slashInactivityTargetPercentage));
  }

  protected async handleEpochPerformance(epoch: EpochNumber, performance: ValidatorsEpochPerformance) {
    if (this.config.slashInactivityPenalty === 0n) {
      return;
    }

    const inactiveValidators = getEntries(performance)
      .filter(([_, { missed, total }]) => total > 0 && missed / total >= this.config.slashInactivityTargetPercentage)
      .map(([address]) => address);

    this.logger.debug(`Found ${inactiveValidators.length} inactive validators in epoch ${epoch}`, {
      inactiveValidators,
      epoch,
      inactivityTargetPercentage: this.config.slashInactivityTargetPercentage,
    });

    const epochThreshold = this.config.slashInactivityConsecutiveEpochThreshold;
    const criminals: string[] = await filterAsync(inactiveValidators, address =>
      this.checkPastInactivity(EthAddress.fromString(address), epoch, epochThreshold - 1),
    );

    const args: WantToSlashArgs[] = criminals.map(address => ({
      validator: EthAddress.fromString(address),
      amount: this.config.slashInactivityPenalty,
      offenseType: OffenseType.INACTIVITY,
      epochOrSlot: BigInt(epoch),
    }));

    if (criminals.length > 0) {
      this.logger.verbose(
        `Identified ${criminals.length} validators to slash due to inactivity in at least ${epochThreshold} consecutive epochs`,
        { ...args, epochThreshold },
      );
      this.emit(WANT_TO_SLASH_EVENT, args);
    }
  }

  /**
   * Process data for two L2 slots ago.
   * Note that we do not process historical data, since we rely on p2p data for processing,
   * and we don't have that data if we were offline during the period.
   *
   * `currentSlot` is anchored to the archiver's last synced L2 slot rather than the wallclock,
   * so the per-slot lag (`isReadyToProcess`) and the end-of-epoch buffer (`processEpochEnds`)
   * advance with archiver.
   */
  public async work() {
    const currentSlot = await this.getCurrentSlot();
    try {
      // Manually sync the block stream to ensure we have the latest data.
      // Note we never `start` the blockstream, so it loops at the same pace as we do.
      await this.blockStream.sync();

      // Per-slot activity recording (lag = 2 slots for P2P attestation settlement).
      const targetSlot = await this.isReadyToProcess(currentSlot);
      if (targetSlot !== false) {
        await this.processSlot(targetSlot);
      }

      // End-of-epoch evaluation (lag = sentinelEpochEndBufferSlots beyond the epoch's last slot).
      await this.processEpochEnds(currentSlot);
    } catch (err) {
      this.logger.error(`Failed to process slot ${currentSlot}`, err);
    }
  }

  /**
   * After the configured buffer has elapsed past an epoch's last slot, runs the end-of-epoch
   * aggregator for that epoch. Catches up if multiple epochs become eligible at once.
   */
  protected async processEpochEnds(currentSlot: SlotNumber) {
    const constants = this.epochCache.getL1Constants();
    const buffer = this.config.sentinelEpochEndBufferSlots;
    if (currentSlot < buffer) {
      return;
    }
    if (this.initialSlot === undefined) {
      return;
    }

    // We can close epoch E iff:
    //  - the per-slot recorder has covered the epoch's last slot (lastProcessedSlot ≥ toSlot(E))
    //  - the buffer has elapsed past the epoch's last slot (currentSlot − buffer ≥ toSlot(E))
    //  - the epoch is not in the past relative to when the sentinel started (toSlot(E) > initialSlot)
    if (this.lastProcessedSlot === undefined) {
      return;
    }
    const slotForBuffer = SlotNumber(currentSlot - buffer);

    // First eligible epoch to close is the one after lastEvaluatedEpoch, or the epoch containing
    // the initial slot if we haven't evaluated any yet (the initialSlot epoch may be partial — we
    // don't try to evaluate it, we start from initialSlot's epoch + 1).
    const startEpoch =
      this.lastEvaluatedEpoch !== undefined
        ? EpochNumber(this.lastEvaluatedEpoch + 1)
        : EpochNumber(getEpochAtSlot(this.initialSlot, constants) + 1);

    for (let epoch = startEpoch; ; epoch = EpochNumber(epoch + 1)) {
      const [, toSlot] = getSlotRangeForEpoch(epoch, constants);
      if (toSlot > this.lastProcessedSlot || toSlot > slotForBuffer) {
        break;
      }
      await this.handleEpochEnd(epoch);
      this.lastEvaluatedEpoch = epoch;
    }
  }

  /**
   * Check if we are ready to process data for two L2 slots ago, so we allow plenty of time for p2p to process all in-flight attestations.
   * We also don't move past the archiver last synced L2 slot, as we don't want to process data that is not yet available.
   * Last, we check the p2p is synced with the archiver, so it has pulled all attestations from it.
   */
  protected async isReadyToProcess(currentSlot: SlotNumber): Promise<SlotNumber | false> {
    if (currentSlot < 2) {
      this.logger.trace(`Current slot ${currentSlot} too early.`);
      return false;
    }

    const targetSlot = SlotNumber(currentSlot - 2);
    if (this.lastProcessedSlot && this.lastProcessedSlot >= targetSlot) {
      this.logger.trace(`Already processed slot ${targetSlot}`, { lastProcessedSlot: this.lastProcessedSlot });
      return false;
    }

    if (this.initialSlot === undefined) {
      this.logger.error(`Initial slot not loaded.`);
      return false;
    }

    if (targetSlot <= this.initialSlot) {
      this.logger.trace(`Refusing to process slot ${targetSlot} given initial slot ${this.initialSlot}`);
      return false;
    }

    const syncedSlot = await this.archiver.getSyncedL2SlotNumber();
    if (syncedSlot === undefined || syncedSlot < targetSlot) {
      this.logger.debug(`Waiting for archiver to sync with L2 slot ${targetSlot}`, { syncedSlot, targetSlot });
      return false;
    }

    const archiverLastBlockHash = await this.l2TipsStore.getL2Tips().then(tip => tip.proposed.hash);
    const p2pLastBlockHash = await this.p2p.getL2Tips().then(tips => tips.proposed.hash);
    const isP2pSynced = archiverLastBlockHash === p2pLastBlockHash;
    if (!isP2pSynced) {
      this.logger.debug(`Waiting for P2P client to sync with archiver`, { archiverLastBlockHash, p2pLastBlockHash });
      return false;
    }

    return targetSlot;
  }

  /**
   * Gathers committee and proposer data for a given slot, computes slot stats,
   * and updates overall stats.
   */
  protected async processSlot(slot: SlotNumber) {
    const { epoch, seed, committee, isEscapeHatchOpen } = await this.epochCache.getCommittee(slot);
    if (isEscapeHatchOpen) {
      this.logger.info(`Skipping slot ${slot} at epoch ${epoch} - escape hatch is open`);
      this.lastProcessedSlot = slot;
      return;
    }
    if (!committee || committee.length === 0) {
      this.logger.trace(`No committee found for slot ${slot} at epoch ${epoch}`);
      this.lastProcessedSlot = slot;
      return;
    }
    const proposerIndex = this.epochCache.computeProposerIndex(slot, epoch, seed, BigInt(committee.length));
    const proposer = committee[Number(proposerIndex)];
    const stats = await this.getSlotActivity(slot, epoch, proposer, committee);
    this.logger.verbose(`Updating L2 slot ${slot} observed activity`, stats);
    await this.updateValidators(slot, stats);
    this.lastProcessedSlot = slot;
  }

  /**
   * Computes activity for a given slot using the six-case taxonomy.
   *
   * Proposer status:
   *  - case 6 `checkpoint-mined`        — a checkpoint covering this slot has landed on L1.
   *  - case 5 `checkpoint-valid`        — the local node re-executed a checkpoint proposal for this
   *                                       slot successfully.
   *  - case 4 `checkpoint-invalid`      — the local node re-executed a checkpoint proposal for this
   *                                       slot and rejected it.
   *  - case 3 `checkpoint-unvalidated`  — the local node observed a checkpoint proposal for this
   *                                       slot but could not validate it (missing data, timeouts).
   *  - case 2 `checkpoint-missed`       — block proposals seen on P2P but no checkpoint proposal.
   *  - case 1 `blocks-missed`           — no block proposals seen for this slot.
   *
   * Missing-attestor penalties apply only in cases 5 and 6, where the local node has positive
   * evidence the checkpoint was valid or has been canonicalised on L1.
   */
  protected async getSlotActivity(slot: SlotNumber, epoch: EpochNumber, proposer: EthAddress, committee: EthAddress[]) {
    this.logger.debug(`Computing stats for slot ${slot} at epoch ${epoch}`, { slot, epoch, proposer, committee });

    // Gather attestors from both p2p (live attestations) and the archiver (signers on the
    // checkpoint if one has landed on L1). Used regardless of which case applies.
    const checkpoint = this.slotNumberToCheckpoint.get(slot);
    const p2pAttested = await this.p2p.getCheckpointAttestationsForSlot(slot, checkpoint?.proposalPayloadHash);
    const p2pAttestors = p2pAttested.map(a => a.getSender()).filter((s): s is EthAddress => s !== undefined);
    const attestors = new Set(
      [...p2pAttestors.map(a => a.toString()), ...(checkpoint?.attestors.map(a => a.toString()) ?? [])].filter(
        addr => proposer.toString() !== addr,
      ),
    );

    // Determine the proposer status from the six-case taxonomy.
    const reexecutionOutcome = this.reexecutionTracker.getOutcomeForSlot(slot);
    let status:
      | 'checkpoint-mined'
      | 'checkpoint-valid'
      | 'checkpoint-invalid'
      | 'checkpoint-unvalidated'
      | 'checkpoint-missed'
      | 'blocks-missed';
    if (checkpoint) {
      status = 'checkpoint-mined';
    } else if (reexecutionOutcome === 'valid') {
      status = 'checkpoint-valid';
    } else if (reexecutionOutcome === 'invalid') {
      status = 'checkpoint-invalid';
    } else if (reexecutionOutcome === 'unvalidated') {
      status = 'checkpoint-unvalidated';
    } else {
      // No L1 checkpoint, no local re-execution outcome for this slot. Distinguish "proposer
      // sent block proposals but never made a checkpoint" from "proposer sent nothing".
      const hasBlockProposals = await this.p2p.hasBlockProposalsForSlot(slot);
      status = hasBlockProposals ? 'checkpoint-missed' : 'blocks-missed';
    }
    this.logger.debug(`Checkpoint status for slot ${slot}: ${status}`, { ...checkpoint, slot });

    // Missing-attestor faults only apply when we have positive evidence the proposal was valid.
    const attestorsExpected = status === 'checkpoint-mined' || status === 'checkpoint-valid';
    const missedAttestors = new Set(
      attestorsExpected
        ? committee.filter(v => !attestors.has(v.toString()) && !proposer.equals(v)).map(v => v.toString())
        : [],
    );

    this.logger.debug(`Retrieved ${attestors.size} attestors out of ${committee.length} for slot ${slot}`, {
      status,
      proposer: proposer.toString(),
      ...checkpoint,
      slot,
      attestors: [...attestors],
      missedAttestors: [...missedAttestors],
      committee: committee.map(c => c.toString()),
    });

    // Compute the status for each validator in the committee
    const statusFor = (who: `0x${string}`): ValidatorStatusInSlot | undefined => {
      if (who === proposer.toString()) {
        return status;
      } else if (attestors.has(who)) {
        return 'attestation-sent';
      } else if (missedAttestors.has(who)) {
        return 'attestation-missed';
      } else {
        return undefined;
      }
    };

    return Object.fromEntries(committee.map(v => v.toString()).map(who => [who, statusFor(who)]));
  }

  /** Push the status for each slot for each validator. */
  protected updateValidators(slot: SlotNumber, stats: Record<`0x${string}`, ValidatorStatusInSlot | undefined>) {
    return this.store.updateValidators(slot, stats);
  }

  /** Computes stats to be returned based on stored data. */
  public async computeStats({
    fromSlot,
    toSlot,
    validators,
  }: { fromSlot?: SlotNumber; toSlot?: SlotNumber; validators?: EthAddress[] } = {}): Promise<ValidatorsStats> {
    const histories = validators
      ? fromEntries(await Promise.all(validators.map(async v => [v.toString(), await this.store.getHistory(v)])))
      : await this.store.getHistories();

    const slotNow = await this.getCurrentSlot();
    fromSlot ??= SlotNumber(Math.max((this.lastProcessedSlot ?? slotNow) - this.store.getHistoryLength(), 0));
    toSlot ??= this.lastProcessedSlot ?? slotNow;

    const stats = mapValues(histories, (history, address) =>
      this.computeStatsForValidator(address, history ?? [], fromSlot, toSlot),
    );

    return {
      stats,
      lastProcessedSlot: this.lastProcessedSlot,
      initialSlot: this.initialSlot,
      slotWindow: this.store.getHistoryLength(),
    };
  }

  /** Computes stats for a single validator. */
  public async getValidatorStats(
    validatorAddress: EthAddress,
    fromSlot?: SlotNumber,
    toSlot?: SlotNumber,
  ): Promise<SingleValidatorStats | undefined> {
    const history = await this.store.getHistory(validatorAddress);

    if (!history || history.length === 0) {
      return undefined;
    }

    const slotNow = await this.getCurrentSlot();
    const effectiveFromSlot =
      fromSlot ?? SlotNumber(Math.max((this.lastProcessedSlot ?? slotNow) - this.store.getHistoryLength(), 0));
    const effectiveToSlot = toSlot ?? this.lastProcessedSlot ?? slotNow;

    const historyLength = BigInt(this.store.getHistoryLength());
    if (BigInt(effectiveToSlot) - BigInt(effectiveFromSlot) > historyLength) {
      throw new Error(
        `Slot range (${BigInt(effectiveToSlot) - BigInt(effectiveFromSlot)}) exceeds history length (${historyLength}). ` +
          `Requested range: ${effectiveFromSlot} to ${effectiveToSlot}.`,
      );
    }

    const validator = this.computeStatsForValidator(
      validatorAddress.toString(),
      history,
      effectiveFromSlot,
      effectiveToSlot,
    );

    return {
      validator,
      allTimeEpochPerformance: await this.store.getEpochPerformance(validatorAddress),
      lastProcessedSlot: this.lastProcessedSlot,
      initialSlot: this.initialSlot,
      slotWindow: this.store.getHistoryLength(),
    };
  }

  protected computeStatsForValidator(
    address: `0x${string}`,
    allHistory: ValidatorStatusHistory,
    fromSlot?: SlotNumber,
    toSlot?: SlotNumber,
  ): ValidatorStats {
    let history = fromSlot ? allHistory.filter(h => BigInt(h.slot) >= fromSlot) : allHistory;
    history = toSlot ? history.filter(h => BigInt(h.slot) <= toSlot) : history;
    const lastProposal = history.filter(h => h.status === 'checkpoint-valid' || h.status === 'checkpoint-mined').at(-1);
    const lastAttestation = history.filter(h => h.status === 'attestation-sent').at(-1);
    return {
      address: EthAddress.fromString(address),
      lastProposal: this.computeFromSlot(lastProposal?.slot),
      lastAttestation: this.computeFromSlot(lastAttestation?.slot),
      totalSlots: history.length,
      missedProposals: this.computeMissed(history, 'proposer', [
        'checkpoint-missed',
        'blocks-missed',
        'checkpoint-invalid',
        'checkpoint-unvalidated',
      ]),
      missedAttestations: this.computeMissed(history, 'attestation', ['attestation-missed']),
      history,
    };
  }

  protected computeMissed(
    history: ValidatorStatusHistory,
    computeOverCategory: ValidatorStatusType | undefined,
    filter: ValidatorStatusInSlot[],
  ) {
    const relevantHistory = history.filter(
      h => !computeOverCategory || statusToCategory(h.status) === computeOverCategory,
    );
    const filteredHistory = relevantHistory.filter(h => filter.includes(h.status));
    return {
      currentStreak: countWhile([...relevantHistory].reverse(), h => filter.includes(h.status)),
      rate: relevantHistory.length === 0 ? undefined : filteredHistory.length / relevantHistory.length,
      count: filteredHistory.length,
      total: relevantHistory.length,
    };
  }

  protected computeFromSlot(slot: SlotNumber | undefined) {
    if (slot === undefined) {
      return undefined;
    }
    const timestamp = getTimestampForSlot(slot, this.epochCache.getL1Constants());
    return { timestamp, slot, date: new Date(Number(timestamp) * 1000).toISOString() };
  }
}
