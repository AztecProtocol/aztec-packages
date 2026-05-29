import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { merge, pick } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import {
  type CheckpointEquivocationDetectedEvent,
  type L2BlockSourceEventEmitter,
  L2BlockSourceEvents,
} from '@aztec/stdlib/block';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';
import { OffenseType } from '@aztec/stdlib/slashing';

import EventEmitter from 'node:events';

import { WANT_TO_SLASH_EVENT, type WantToSlashArgs, type Watcher, type WatcherEmitter } from '../watcher.js';

const CheckpointEquivocationWatcherConfigKeys = ['slashDuplicateProposalPenalty'] as const;

type CheckpointEquivocationWatcherConfig = Pick<
  SlasherConfig,
  (typeof CheckpointEquivocationWatcherConfigKeys)[number]
>;

type EquivocationEventSource = Pick<L2BlockSourceEventEmitter, 'events'>;
type ProposerLookup = Pick<EpochCacheInterface, 'getProposerAttesterAddressInSlot'>;

/**
 * Slashes the slot proposer for DUPLICATE_PROPOSAL when the archiver detects that a
 * locally-stored proposed checkpoint disagrees with the L1-confirmed checkpoint at the
 * same slot. Both are signed by the slot proposer (the proposed one by accepting it via
 * P2P or building it locally; the L1 one by submission), so the proposer equivocated.
 */
export class CheckpointEquivocationWatcher extends (EventEmitter as new () => WatcherEmitter) implements Watcher {
  private readonly log: Logger = createLogger('checkpoint-equivocation-watcher');
  private readonly handler: (args: CheckpointEquivocationDetectedEvent) => void;
  private config: CheckpointEquivocationWatcherConfig;

  constructor(
    private readonly l2BlockSource: EquivocationEventSource,
    private readonly epochCache: ProposerLookup,
    config: CheckpointEquivocationWatcherConfig,
  ) {
    super();
    this.config = pick(config, ...CheckpointEquivocationWatcherConfigKeys);
    this.handler = event => {
      this.onEquivocationDetected(event).catch(err =>
        this.log.error('Failed to handle checkpoint equivocation event', err),
      );
    };
    this.log.info('CheckpointEquivocationWatcher initialized');
  }

  public updateConfig(config: Partial<CheckpointEquivocationWatcherConfig>): void {
    this.config = merge(this.config, pick(config, ...CheckpointEquivocationWatcherConfigKeys));
    this.log.verbose('CheckpointEquivocationWatcher config updated', this.config);
  }

  public start(): Promise<void> {
    this.l2BlockSource.events.on(L2BlockSourceEvents.CheckpointEquivocationDetected, this.handler);
    return Promise.resolve();
  }

  public stop(): Promise<void> {
    this.l2BlockSource.events.off(L2BlockSourceEvents.CheckpointEquivocationDetected, this.handler);
    return Promise.resolve();
  }

  /** Public for tests. */
  public async onEquivocationDetected(event: CheckpointEquivocationDetectedEvent): Promise<void> {
    if (this.config.slashDuplicateProposalPenalty <= 0n) {
      return;
    }

    const proposer = await this.epochCache.getProposerAttesterAddressInSlot(event.slotNumber);
    if (!proposer) {
      this.log.warn(`Cannot attribute checkpoint equivocation: no proposer for slot ${event.slotNumber}`, {
        slotNumber: event.slotNumber,
        checkpointNumber: event.checkpointNumber,
      });
      return;
    }

    const slashArgs: WantToSlashArgs = {
      validator: proposer,
      amount: this.config.slashDuplicateProposalPenalty,
      offenseType: OffenseType.DUPLICATE_PROPOSAL,
      epochOrSlot: BigInt(event.slotNumber),
    };

    this.log.info(`Detected checkpoint equivocation offense`, {
      slotNumber: event.slotNumber,
      checkpointNumber: event.checkpointNumber,
      l1ArchiveRoot: event.l1ArchiveRoot.toString(),
      proposedArchiveRoot: event.proposedArchiveRoot.toString(),
      validator: proposer.toString(),
    });
    this.emit(WANT_TO_SLASH_EVENT, [slashArgs]);
  }
}
