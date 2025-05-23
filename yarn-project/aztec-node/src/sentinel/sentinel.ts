import type { EpochCache } from '@aztec/epoch-cache';
import { countWhile } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { L2TipsMemoryStore, type L2TipsStore } from '@aztec/kv-store/stores';
import type { P2PClient } from '@aztec/p2p';
import {
  type L2BlockSource,
  L2BlockStream,
  type L2BlockStreamEvent,
  type L2BlockStreamEventHandler,
  getAttestationsFromPublishedL2Block,
} from '@aztec/stdlib/block';
import { getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import type {
  ValidatorStats,
  ValidatorStatusHistory,
  ValidatorStatusInSlot,
  ValidatorStatusType,
  ValidatorsStats,
} from '@aztec/stdlib/validators';

import { SentinelStore } from './store.js';

export class Sentinel implements L2BlockStreamEventHandler {
  protected runningPromise: RunningPromise;
  protected blockStream!: L2BlockStream;
  protected l2TipsStore: L2TipsStore;

  protected initialSlot: bigint | undefined;
  protected lastProcessedSlot: bigint | undefined;
  protected slotNumberToBlock: Map<bigint, { blockNumber: number; archive: string; attestors: EthAddress[] }> =
    new Map();

  constructor(
    protected epochCache: EpochCache,
    protected archiver: L2BlockSource,
    protected p2p: P2PClient,
    protected store: SentinelStore,
    protected logger = createLogger('node:sentinel'),
  ) {
    this.l2TipsStore = new L2TipsMemoryStore();
    const interval = (epochCache.getL1Constants().ethereumSlotDuration * 1000) / 4;
    this.runningPromise = new RunningPromise(this.work.bind(this), logger, interval);
  }

  public async start() {
    await this.init();
    this.runningPromise.start();
  }

  /** Loads initial slot and initializes blockstream. We will not process anything at or before the initial slot. */
  protected async init() {
    this.initialSlot = this.epochCache.getEpochAndSlotNow().slot;
    const startingBlock = await this.archiver.getBlockNumber();
    this.logger.info(`Starting validator sentinel with initial slot ${this.initialSlot} and block ${startingBlock}`);
    this.blockStream = new L2BlockStream(this.archiver, this.l2TipsStore, this, this.logger, { startingBlock });
  }

  public stop() {
    return this.runningPromise.stop();
  }

  public async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    await this.l2TipsStore.handleBlockStreamEvent(event);
    if (event.type === 'blocks-added') {
      // Store mapping from slot to archive, block number, and attestors
      for (const block of event.blocks) {
        this.slotNumberToBlock.set(block.block.header.getSlot(), {
          blockNumber: block.block.number,
          archive: block.block.archive.root.toString(),
          attestors: getAttestationsFromPublishedL2Block(block).map(att => att.getSender()),
        });
      }

      // Prune the archive map to only keep at most N entries
      const historyLength = this.store.getHistoryLength();
      if (this.slotNumberToBlock.size > historyLength) {
        const toDelete = Array.from(this.slotNumberToBlock.keys())
          .sort((a, b) => Number(a - b))
          .slice(0, this.slotNumberToBlock.size - historyLength);
        for (const key of toDelete) {
          this.slotNumberToBlock.delete(key);
        }
      }
    }
  }

  /**
   * Process data for two L2 slots ago.
   * Note that we do not process historical data, since we rely on p2p data for processing,
   * and we don't have that data if we were offline during the period.
   */
  public async work() {
    const { slot: currentSlot } = this.epochCache.getEpochAndSlotNow();
    try {
      // Manually sync the block stream to ensure we have the latest data.
      // Note we never `start` the blockstream, so it loops at the same pace as we do.
      await this.blockStream.sync();

      // Check if we are ready to process data for two L2 slots ago.
      const targetSlot = await this.isReadyToProcess(currentSlot);

      // And process it if we are.
      if (targetSlot !== false) {
        await this.processSlot(targetSlot);
      }
    } catch (err) {
      this.logger.error(`Failed to process slot ${currentSlot}`, err);
    }
  }

  /**
   * Check if we are ready to process data for two L2 slots ago, so we allow plenty of time for p2p to process all in-flight attestations.
   * We also don't move past the archiver last synced L2 slot, as we don't want to process data that is not yet available.
   * Last, we check the p2p is synced with the archiver, so it has pulled all attestations from it.
   */
  protected async isReadyToProcess(currentSlot: bigint) {
    const targetSlot = currentSlot - 2n;
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

    const archiverSlot = await this.archiver.getL2SlotNumber();
    if (archiverSlot < targetSlot) {
      this.logger.debug(`Waiting for archiver to sync with L2 slot ${targetSlot}`, { archiverSlot, targetSlot });
      return false;
    }

    const archiverLastBlockHash = await this.l2TipsStore.getL2Tips().then(tip => tip.latest.hash);
    const p2pLastBlockHash = await this.p2p.getL2Tips().then(tips => tips.latest.hash);
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
  protected async processSlot(slot: bigint) {
    const { epoch, seed, committee } = await this.epochCache.getCommittee(slot);
    if (committee.length === 0) {
      this.logger.warn(`No committee found for slot ${slot} at epoch ${epoch}`);
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

  /** Computes activity for a given slot. */
  protected async getSlotActivity(slot: bigint, epoch: bigint, proposer: EthAddress, committee: EthAddress[]) {
    this.logger.debug(`Computing stats for slot ${slot} at epoch ${epoch}`, { slot, epoch, proposer, committee });

    // Check if there is an L2 block in L1 for this L2 slot

    // Here we get all attestations for the block mined at the given slot,
    // or all attestations for all proposals in the slot if no block was mined.
    // We gather from both p2p (contains the ones seen on the p2p layer) and archiver
    // (contains the ones synced from mined blocks, which we may have missed from p2p).
    const block = this.slotNumberToBlock.get(slot);
    const p2pAttested = await this.p2p.getAttestationsForSlot(slot, block?.archive);
    const attestors = new Set([
      ...p2pAttested.map(a => a.getSender().toString()),
      ...(block?.attestors.map(a => a.toString()) ?? []),
    ]);

    // We assume that there was a block proposal if at least one of the validators attested to it.
    // It could be the case that every single validator failed, and we could differentiate it by having
    // this node re-execute every block proposal it sees and storing it in the attestation pool.
    // But we'll leave that corner case out to reduce pressure on the node.
    const blockStatus = block ? 'mined' : attestors.size > 0 ? 'proposed' : 'missed';
    this.logger.debug(`Block for slot ${slot} was ${blockStatus}`, { ...block, slot });

    // Get attestors that failed their duties for this block, but only if there was a block proposed
    const missedAttestors = new Set(
      blockStatus === 'missed'
        ? []
        : committee.filter(v => !attestors.has(v.toString()) && !proposer.equals(v)).map(v => v.toString()),
    );

    this.logger.debug(`Retrieved ${attestors.size} attestors out of ${committee.length} for slot ${slot}`, {
      blockStatus,
      proposer: proposer.toString(),
      ...block,
      slot,
      attestors: [...attestors],
      missedAttestors: [...missedAttestors],
      committee: committee.map(c => c.toString()),
    });

    // Compute the status for each validator in the committee
    const statusFor = (who: `0x${string}`): ValidatorStatusInSlot | undefined => {
      if (who === proposer.toString()) {
        return `block-${blockStatus}`;
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
  protected updateValidators(slot: bigint, stats: Record<`0x${string}`, ValidatorStatusInSlot | undefined>) {
    return this.store.updateValidators(slot, stats);
  }

  /** Computes stats to be returned based on stored data. */
  public async computeStats(): Promise<ValidatorsStats> {
    const histories = await this.store.getHistories();
    const slotNow = this.epochCache.getEpochAndSlotNow().slot;
    const fromSlot = (this.lastProcessedSlot ?? slotNow) - BigInt(this.store.getHistoryLength());
    const result: Record<`0x${string}`, ValidatorStats> = {};
    for (const [address, history] of Object.entries(histories)) {
      const validatorAddress = address as `0x${string}`;
      result[validatorAddress] = this.computeStatsForValidator(validatorAddress, history, fromSlot);
    }
    return {
      stats: result,
      lastProcessedSlot: this.lastProcessedSlot,
      initialSlot: this.initialSlot,
      slotWindow: this.store.getHistoryLength(),
    };
  }

  protected computeStatsForValidator(
    address: `0x${string}`,
    allHistory: ValidatorStatusHistory,
    fromSlot?: bigint,
  ): ValidatorStats {
    const history = fromSlot ? allHistory.filter(h => h.slot >= fromSlot) : allHistory;
    return {
      address: EthAddress.fromString(address),
      lastProposal: this.computeFromSlot(
        history.filter(h => h.status === 'block-proposed' || h.status === 'block-mined').at(-1)?.slot,
      ),
      lastAttestation: this.computeFromSlot(history.filter(h => h.status === 'attestation-sent').at(-1)?.slot),
      totalSlots: history.length,
      missedProposals: this.computeMissed(history, 'block', 'block-missed'),
      missedAttestations: this.computeMissed(history, 'attestation', 'attestation-missed'),
      history,
    };
  }

  protected computeMissed(
    history: ValidatorStatusHistory,
    computeOverPrefix: ValidatorStatusType,
    filter: ValidatorStatusInSlot,
  ) {
    const relevantHistory = history.filter(h => h.status.startsWith(computeOverPrefix));
    const filteredHistory = relevantHistory.filter(h => h.status === filter);
    return {
      currentStreak: countWhile([...relevantHistory].reverse(), h => h.status === filter),
      rate: relevantHistory.length === 0 ? undefined : filteredHistory.length / relevantHistory.length,
      count: filteredHistory.length,
    };
  }

  protected computeFromSlot(slot: bigint | undefined) {
    if (slot === undefined) {
      return undefined;
    }
    const timestamp = getTimestampForSlot(slot, this.epochCache.getL1Constants());
    return { timestamp, slot, date: new Date(Number(timestamp) * 1000).toISOString() };
  }
}
