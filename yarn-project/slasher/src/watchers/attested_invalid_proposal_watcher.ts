import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { merge, pick } from '@aztec/foundation/collection';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { FifoSet } from '@aztec/foundation/fifo-set';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { P2PClient, SlasherConfig } from '@aztec/stdlib/interfaces/server';
import type { CheckpointAttestation } from '@aztec/stdlib/p2p';
import { OffenseType, getOffenseTypeName } from '@aztec/stdlib/slashing';

import EventEmitter from 'node:events';

import { WANT_TO_SLASH_EVENT, type WantToSlashArgs, type Watcher, type WatcherEmitter } from '../watcher.js';

const AttestedInvalidProposalWatcherConfigKeys = ['slashAttestInvalidCheckpointProposalPenalty'] as const;

const SCAN_SLOT_LAG = 1;
const DEFAULT_SCAN_SLOT_LOOKBACK = 4;
const MAX_TRACKED_BAD_ATTESTATIONS = 10_000;

type AttestedInvalidProposalWatcherConfig = Pick<
  SlasherConfig,
  (typeof AttestedInvalidProposalWatcherConfigKeys)[number]
>;

type P2PCheckpointAttestationSource = Pick<P2PClient, 'getCheckpointAttestationsForSlot'>;

type AttestedInvalidProposalWatcherOptions = {
  scanSlotLookback?: number;
  log?: Logger;
};

export type InvalidProposalSlotSource = {
  hasInvalidProposals(slot: SlotNumber): boolean;
  hasProposalEquivocation(slot: SlotNumber): boolean;
};

export class AttestedInvalidProposalWatcher extends (EventEmitter as new () => WatcherEmitter) implements Watcher {
  private readonly log: Logger;
  private readonly runningPromise: RunningPromise;
  private readonly emittedOffenses = FifoSet.withLimit<string>(MAX_TRACKED_BAD_ATTESTATIONS);
  private readonly scanSlotLookback: number;
  private config: AttestedInvalidProposalWatcherConfig;
  private lastScannedSlot: SlotNumber | undefined;

  constructor(
    private readonly p2pClient: P2PCheckpointAttestationSource,
    private readonly invalidProposalSlotSource: InvalidProposalSlotSource,
    private readonly l2BlockSource: Pick<L2BlockSource, 'getSyncedL2SlotNumber'>,
    private readonly epochCache: Pick<EpochCacheInterface, 'getSlotNow' | 'getL1Constants'>,
    config: AttestedInvalidProposalWatcherConfig,
    options: AttestedInvalidProposalWatcherOptions = {},
  ) {
    super();
    const constants = epochCache.getL1Constants();
    this.log = options.log ?? createLogger('attested-invalid-proposal-watcher');
    this.config = pick(config, ...AttestedInvalidProposalWatcherConfigKeys);
    this.scanSlotLookback = Math.max(1, options.scanSlotLookback ?? DEFAULT_SCAN_SLOT_LOOKBACK);

    const intervalMs = Math.max(1000, (constants.ethereumSlotDuration * 1000) / 4);
    this.runningPromise = new RunningPromise(() => this.scan(), this.log, intervalMs);
    this.log.info('AttestedInvalidProposalWatcher initialized', { scanSlotLookback: this.scanSlotLookback });
  }

  public updateConfig(config: Partial<SlasherConfig>): void {
    this.config = merge(this.config, pick(config, ...AttestedInvalidProposalWatcherConfigKeys));
    this.log.verbose('AttestedInvalidProposalWatcher config updated', this.config);
  }

  public start(): Promise<void> {
    this.runningPromise.start();
    return Promise.resolve();
  }

  public stop(): Promise<void> {
    return this.runningPromise.stop();
  }

  public async scan(): Promise<void> {
    const currentSlot = (await this.l2BlockSource.getSyncedL2SlotNumber()) ?? this.epochCache.getSlotNow();
    // genesis
    if (currentSlot <= SlotNumber(SCAN_SLOT_LAG)) {
      return;
    }

    const newestSlotToConsider = SlotNumber(currentSlot - SCAN_SLOT_LAG);
    const oldestSlot =
      this.lastScannedSlot === undefined
        ? SlotNumber(Math.max(0, newestSlotToConsider - this.scanSlotLookback + 1))
        : SlotNumber(this.lastScannedSlot + 1);
    if (oldestSlot > newestSlotToConsider) {
      return;
    }

    for (let slot = oldestSlot; slot <= newestSlotToConsider; slot++) {
      await this.scanSlot(slot);
    }

    this.lastScannedSlot = newestSlotToConsider;
  }

  /** Scans a single invalid-proposal slot. */
  public async scanSlot(slot: SlotNumber): Promise<void> {
    if (
      this.invalidProposalSlotSource.hasProposalEquivocation(slot) ||
      !this.invalidProposalSlotSource.hasInvalidProposals(slot)
    ) {
      return;
    }

    let attestations: CheckpointAttestation[];
    try {
      attestations = await this.p2pClient.getCheckpointAttestationsForSlot(slot);
    } catch (err) {
      this.log.warn('Error getting checkpoint attestations for invalid proposal slot', { err, slot });
      return;
    }

    const slashArgs = attestations
      .map(attestation => this.getSlashArgs(slot, attestation))
      .filter((args): args is WantToSlashArgs => args !== undefined)
      .filter(args => this.markAsNewOffense(args));

    if (slashArgs.length === 0) {
      return;
    }

    this.log.info('Detected attestations to invalid checkpoint proposal', {
      slot,
      offenses: slashArgs.map(args => ({
        validator: args.validator.toString(),
        amount: args.amount,
        offenseType: getOffenseTypeName(args.offenseType),
        epochOrSlot: args.epochOrSlot,
      })),
    });
    this.emit(WANT_TO_SLASH_EVENT, slashArgs);
  }

  private getSlashArgs(slot: SlotNumber, attestation: CheckpointAttestation): WantToSlashArgs | undefined {
    const attester = attestation.getSender();
    if (!attester) {
      this.log.warn('Cannot slash checkpoint attestation with invalid signature', {
        slot,
        archive: attestation.archive.toString(),
      });
      return undefined;
    }

    return this.getSlashArgsForAttester(slot, attester);
  }

  private getSlashArgsForAttester(slot: SlotNumber, attester: EthAddress): WantToSlashArgs {
    return {
      validator: attester,
      amount: this.config.slashAttestInvalidCheckpointProposalPenalty,
      offenseType: OffenseType.ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL,
      epochOrSlot: BigInt(slot),
    };
  }

  private markAsNewOffense(args: WantToSlashArgs): boolean {
    const key = `${args.validator.toString()}-${args.offenseType}-${args.epochOrSlot}`;
    return this.emittedOffenses.addIfAbsent(key);
  }
}
