import type { EpochCache } from '@aztec/epoch-cache';
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
  getAttestationsFromPublishedL2Block,
} from '@aztec/stdlib/block';
import { getEpochAtSlot, getSlotRangeForEpoch, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
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
import { SentinelStore } from './store.js';

export class Sentinel extends (EventEmitter as new () => WatcherEmitter) implements L2BlockStreamEventHandler, Watcher {
  protected runningPromise: RunningPromise;
  protected blockStream!: L2BlockStream;
  protected l2TipsStore: L2TipsStore;
  protected initialSlot: bigint | undefined;
  protected lastProcessedSlot: bigint | undefined;
  protected slotNumberToBlock: Map<bigint, { blockNumber: number; archive: string; attestors: EthAddress[] }> = new Map();
  protected logger = createLogger('node:sentinel');

  constructor(
    protected epochCache: EpochCache,
    protected archiver: L2BlockSource,
    protected p2p: P2PClient,
    protected store: SentinelStore,
    protected config: Pick<
      SlasherConfig,
      'slashInactivityTargetPercentage' | 'slashInactivityPenalty' | 'slashInactivityConsecutiveEpochThreshold'
    >,
  ) {
    super();
    this.l2TipsStore = new L2TipsMemoryStore();
    const interval = (epochCache.getL1Constants().ethereumSlotDuration * 1000) / 4;
    this.runningPromise = new RunningPromise(this.work.bind(this), this.logger, interval);
  }

  public updateConfig(config: Partial<SlasherConfig>) {
    this.config = { ...this.config, ...config };
  }

  public async start() {
    await this.init();
    this.runningPromise.start();
  }

  protected async init() {
    this.initialSlot = this.epochCache.getEpochAndSlotNow().slot;
    const startingBlock = await this.archiver.getBlockNumber();
    this.logger.info('Starting validator sentinel', { initialSlot: this.initialSlot, startingBlock });
    this.blockStream = new L2BlockStream(this.archiver, this.l2TipsStore, this, this.logger, { startingBlock });
  }

  public stop() {
    return this.runningPromise.stop();
  }

  public async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    await this.l2TipsStore.handleBlockStreamEvent(event);
    if (event.type === 'blocks-added') {
      for (const block of event.blocks) {
        this.slotNumberToBlock.set(block.block.header.getSlot(), {
          blockNumber: block.block.number,
          archive: block.block.archive.root.toString(),
          attestors: getAttestationsFromPublishedL2Block(block).map(att => att.getSender()),
        });
      }
      const historyLength = this.store.getHistoryLength();
      if (this.slotNumberToBlock.size > historyLength) {
        const toDelete = Array.from(this.slotNumberToBlock.keys()).sort((a, b) => Number(a - b)).slice(0, this.slotNumberToBlock.size - historyLength);
        toDelete.forEach(key => this.slotNumberToBlock.delete(key));
      }
    } else if (event.type === 'chain-proven') {
      await this.handleChainProven(event);
    }
  }

  protected async handleChainProven(event: L2BlockStreamEvent) {
    if (event.type !== 'chain-proven') return;
    const blockNumber = event.block.number;
    const block = await this.archiver.getBlock(blockNumber);
    if (!block) {
      this.logger.error('Failed to get block', { blockNumber, block });
      return;
    }
    const epoch = getEpochAtSlot(block.header.getSlot(), this.epochCache.getL1Constants());
    this.logger.debug('Computing proven performance', { epoch });
    const performance = await this.computeProvenPerformance(epoch);
    this.logger.info('Computed proven performance', { epoch, performance });
    await this.store.updateProvenPerformance(epoch, performance);
    await this.handleProvenPerformance(epoch, performance);
  }

  protected async computeProvenPerformance(epoch: bigint): Promise<ValidatorsEpochPerformance> {
    const [fromSlot, toSlot] = getSlotRangeForEpoch(epoch, this.epochCache.getL1Constants());
    const { committee } = await this.epochCache.getCommittee(fromSlot);
    if (!committee) {
      this.logger.trace('No committee found', { fromSlot });
      return {};
    }
    const stats = await this.computeStats({ fromSlot, toSlot, validators: committee });
    this.logger.debug('Stats for epoch', { epoch, stats });
    return mapValues(stats.stats, stat => ({
      missed: stat.missedAttestations.count + stat.missedProposals.count,
      total: stat.missedAttestations.total + stat.missedProposals.total,
    }));
  }

  protected async checkPastInactivity(validator: EthAddress, currentEpoch: bigint, requiredConsecutiveEpochs: number): Promise<boolean> {
    if (requiredConsecutiveEpochs === 0) return true;
    const allPerformance = await this.store.getProvenPerformance(validator);
    if (allPerformance.length < requiredConsecutiveEpochs) {
      this.logger.debug('Not enough historical data for slashing', { validator: validator.toString(), allPerformanceLength: allPerformance.length });
      return false;
    }
    return allPerformance.sort((a, b) => Number(b.epoch - a.epoch)).filter(p => p.epoch < currentEpoch).slice(0, requiredConsecutiveEpochs).every(p => p.missed / p.total >= this.config.slashInactivityTargetPercentage);
  }

  protected async handleProvenPerformance(epoch: bigint, performance: ValidatorsEpochPerformance) {
    const inactiveValidators = getEntries(performance).filter(([_, { missed, total }]) => missed / total >= this.config.slashInactivityTargetPercentage).map(([address]) => address);
    this.logger.debug('Inactive validators detected', { epoch, inactiveValidators });
    const epochThreshold = this.config.slashInactivityConsecutiveEpochThreshold;
    const criminals: string[] = await filterAsync(inactiveValidators, address => this.checkPastInactivity(EthAddress.fromString(address), epoch, epochThreshold - 1));
    const args: WantToSlashArgs[] = criminals.map(address => ({
      validator: EthAddress.fromString(address),
      amount: this.config.slashInactivityPenalty,
      offenseType: OffenseType.INACTIVITY,
      epochOrSlot: epoch,
    }));
    if (criminals.length > 0) this.logger.info('Validators to slash', { epochThreshold, criminals, args });
    if (criminals.length > 0) this.emit(WANT_TO_SLASH_EVENT, args);
  }

  public async work() {
    const { slot: currentSlot } = this.epochCache.getEpochAndSlotNow();
    try {
      await this.blockStream.sync();
      const targetSlot = await this.isReadyToProcess(currentSlot);
      if (targetSlot !== false) await this.processSlot(targetSlot);
    } catch (err) {
      this.logger.error('Failed to process slot', { currentSlot, err });
    }
  }

  protected async isReadyToProcess(currentSlot: bigint) {
    const targetSlot = currentSlot - 2n;
    if (this.lastProcessedSlot && this.lastProcessedSlot >= targetSlot) return false;
    if (this.initialSlot === undefined) {
      this.logger.error('Initial slot not loaded');
      return false;
    }
    if (targetSlot <= this.initialSlot) return false;
    const archiverSlot = await this.archiver.getL2SlotNumber();
    if (archiverSlot < targetSlot) {
      this.logger.debug('Waiting for archiver to sync', { archiverSlot, targetSlot });
      return false;
    }
    const archiverLastBlockHash = await this.l2TipsStore.getL2Tips().then(tip => tip.latest.hash);
    const p2pLastBlockHash = await this.p2p.getL2Tips().then(tips => tips.latest.hash);
    if (archiverLastBlockHash !== p2pLastBlockHash) {
      this.logger.debug('Waiting for P2P sync', { archiverLastBlockHash, p2pLastBlockHash });
      return false;
    }
    return targetSlot;
  }

  protected async processSlot(slot: bigint) {
    const { epoch, seed, committee } = await this.epochCache.getCommittee(slot);
    if (!committee || committee.length === 0) {
      this.logger.trace('No committee found for slot', { slot, epoch });
      this.lastProcessedSlot = slot;
      return;
    }
    const proposerIndex = this.epochCache.computeProposerIndex(slot, epoch, seed, BigInt(committee.length));
    const proposer = committee[Number(proposerIndex)];
    const stats = await this.getSlotActivity(slot, epoch, proposer, committee);
    this.logger.verbose('Updating L2 slot activity', { slot, stats });
    await this.updateValidators(slot, stats);
    this.lastProcessedSlot = slot;
  }

  protected async getSlotActivity(slot: bigint, epoch: bigint, proposer: EthAddress, committee: EthAddress[]) {
    const block = this.slotNumberToBlock.get(slot);
    const p2pAttested = await this.p2p.getAttestationsForSlot(slot, block?.archive);
    const attestors = new Set([...p2pAttested.map(a => a.getSender().toString()), ...(block?.attestors.map(a => a.toString()) ?? [])].filter(addr => proposer.toString() !== addr));
    const blockStatus = block ? 'mined' : attestors.size > 0 ? 'proposed' : 'missed';
    const missedAttestors = new Set(blockStatus === 'missed' ? [] : committee.filter(v => !attestors.has(v.toString()) && !proposer.equals(v)).map(v => v.toString()));
    this.logger.debug('Slot activity computed', { slot, epoch, blockStatus, attestors: [...attestors], missedAttestors: [...missedAttestors], proposer: proposer.toString(), committee: committee.map(c => c.toString()) });
    const statusFor = (who: `0x${string}`): ValidatorStatusInSlot | undefined => {
      if (who === proposer.toString()) return `block-${blockStatus}`;
      if (attestors.has(who)) return 'attestation-sent';
      if (missedAttestors.has(who)) return 'attestation-missed';
      return undefined;
    };
    return Object.fromEntries(committee.map(v => v.toString()).map(who => [who, statusFor(who)]));
  }

  protected updateValidators(slot: bigint, stats: Record<`0x${string}`, ValidatorStatusInSlot | undefined>) {
    return this.store.updateValidators(slot, stats);
  }

  public async computeStats({ fromSlot, toSlot, validators }: { fromSlot?: bigint; toSlot?: bigint; validators?: EthAddress[] } = {}): Promise<ValidatorsStats> {
    const histories = validators ? fromEntries(await Promise.all(validators.map(async v => [v.toString(), await this.store.getHistory(v)]))) : await this.store.getHistories();
    const slotNow = this.epochCache.getEpochAndSlotNow().slot;
    fromSlot ??= (this.lastProcessedSlot ?? slotNow) - BigInt(this.store.getHistoryLength());
    toSlot ??= this.lastProcessedSlot ?? slotNow;
    const stats = mapValues(histories, (history, address) => this.computeStatsForValidator(address, history ?? [], fromSlot, toSlot));
    return { stats, lastProcessedSlot: this.lastProcessedSlot, initialSlot: this.initialSlot, slotWindow: this.store.getHistoryLength() };
  }

  public async getValidatorStats(validatorAddress: EthAddress, fromSlot?: bigint, toSlot?: bigint): Promise<SingleValidatorStats | undefined> {
    const history = await this.store.getHistory(validatorAddress);
    if (!history || history.length === 0) return undefined;
    const slotNow = this.epochCache.getEpochAndSlotNow().slot;
    const effectiveFromSlot = fromSlot ?? (this.lastProcessedSlot ?? slotNow) - BigInt(this.store.getHistoryLength());
    const effectiveToSlot = toSlot ?? this.lastProcessedSlot ?? slotNow;
    const historyLength = BigInt(this.store.getHistoryLength());
    if (effectiveToSlot - effectiveFromSlot > historyLength) throw new Error(`Slot range (${effectiveToSlot - effectiveFromSlot}) exceeds history length (${historyLength})`);
    const validator = this.computeStatsForValidator(validatorAddress.toString(), history, effectiveFromSlot, effectiveToSlot);
    const allTimeProvenPerformance = await this.store.getProvenPerformance(validatorAddress);
    return { validator, allTimeProvenPerformance, lastProcessedSlot: this.lastProcessedSlot, initialSlot: this.initialSlot, slotWindow: this.store.getHistoryLength() };
  }

  protected computeStatsForValidator(address: `0x${string}`, allHistory: ValidatorStatusHistory, fromSlot?: bigint, toSlot?: bigint): ValidatorStats {
    let history = fromSlot ? allHistory.filter(h => h.slot >= fromSlot) : allHistory;
    history = toSlot ? history.filter(h => h.slot <= toSlot) : history;
    const lastProposal = history.filter(h => h.status === 'block-proposed' || h.status === 'block-mined').at(-1);
    const lastAttestation = history.filter(h => h.status === 'attestation-sent').at(-1);
    return { address: EthAddress.fromString(address), lastProposal: this.computeFromSlot(lastProposal?.slot), lastAttestation: this.computeFromSlot(lastAttestation?.slot), totalSlots: history.length, missedProposals: this.computeMissed(history, 'block', ['block-missed']), missedAttestations: this.computeMissed(history, 'attestation', ['attestation-missed']), history };
  }

  protected computeMissed(history: ValidatorStatusHistory, computeOverPrefix: ValidatorStatusType | undefined, filter: ValidatorStatusInSlot[]) {
    const relevantHistory = history.filter(h => !computeOverPrefix || h.status.startsWith(computeOverPrefix));
    const filteredHistory = relevantHistory.filter(h => filter.includes(h.status));
    return { currentStreak: countWhile([...relevantHistory].reverse(), h => filter.includes(h.status)), rate: relevantHistory.length === 0 ? undefined : filteredHistory.length / relevantHistory.length, count: filteredHistory.length, total: relevantHistory.length };
  }

  protected computeFromSlot(slot: bigint | undefined) {
    if (slot === undefined) return undefined;
    const timestamp = getTimestampForSlot(slot, this.epochCache.getL1Constants());
    return { timestamp, slot, date: new Date(Number(timestamp) * 1000).toISOString() };
  }
}
