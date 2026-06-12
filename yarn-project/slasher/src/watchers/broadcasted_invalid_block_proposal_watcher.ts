import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { merge, pick } from '@aztec/foundation/collection';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { FifoSet } from '@aztec/foundation/fifo-set';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { P2PClient, SequencerConfig, SlasherConfig } from '@aztec/stdlib/interfaces/server';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import { OffenseType, getOffenseTypeName } from '@aztec/stdlib/slashing';

import EventEmitter from 'node:events';

import { WANT_TO_SLASH_EVENT, type WantToSlashArgs, type Watcher, type WatcherEmitter } from '../watcher.js';

const BroadcastedInvalidBlockProposalWatcherSlasherConfigKeys = ['slashBroadcastedInvalidBlockPenalty'] as const;

const BroadcastedInvalidBlockProposalWatcherConsensusConfigKeys = ['maxBlocksPerCheckpoint'] as const;

const SCAN_SLOT_LAG = 1;
const DEFAULT_SCAN_SLOT_LOOKBACK = 4;

type BroadcastedInvalidBlockProposalWatcherConfig = Pick<
  SlasherConfig,
  (typeof BroadcastedInvalidBlockProposalWatcherSlasherConfigKeys)[number]
> &
  Pick<SequencerConfig, (typeof BroadcastedInvalidBlockProposalWatcherConsensusConfigKeys)[number]>;

type P2PProposalsForSlotSource = Pick<P2PClient, 'getProposalsForSlot'>;

/**
 * Detects broadcasted-invalid-block-proposal offenses from retained signed P2P proposals: a block
 * proposal whose index within its checkpoint lands at or beyond the consensus `maxBlocksPerCheckpoint`
 * limit. The p2p layer retains and re-broadcasts such proposals as slashing evidence without processing
 * them; a single signed block at an illegal index is self-contained, attributable evidence, so no
 * checkpoint proposal needs to be present. No-op when the consensus limit is undefined (local/test).
 */
export class BroadcastedInvalidBlockProposalWatcher
  extends (EventEmitter as new () => WatcherEmitter)
  implements Watcher
{
  private readonly log: Logger = createLogger('broadcasted-invalid-block-proposal-watcher');
  private readonly runningPromise: RunningPromise;
  private readonly emittedOffenses: FifoSet<string>;
  private readonly scanSlotLookback: number;
  private config: BroadcastedInvalidBlockProposalWatcherConfig;
  private lastScannedSlot: SlotNumber | undefined;

  constructor(
    private readonly p2pClient: P2PProposalsForSlotSource,
    private readonly l2BlockSource: Pick<L2BlockSource, 'getSyncedL2SlotNumber'>,
    private readonly epochCache: Pick<EpochCacheInterface, 'getSlotNow' | 'getL1Constants'>,
    config: BroadcastedInvalidBlockProposalWatcherConfig,
    scanSlotLookback = DEFAULT_SCAN_SLOT_LOOKBACK,
  ) {
    super();
    const constants = epochCache.getL1Constants();
    this.config = pick(
      config,
      ...BroadcastedInvalidBlockProposalWatcherSlasherConfigKeys,
      ...BroadcastedInvalidBlockProposalWatcherConsensusConfigKeys,
    );
    this.scanSlotLookback = Math.max(1, scanSlotLookback);

    // Bound emitted offenses to the number of slots we rescan. This watcher tracks one offense type,
    // and at most one offense of that type can be emitted per slot.
    const offenseTypes = 1;
    this.emittedOffenses = FifoSet.withLimit<string>(offenseTypes * this.scanSlotLookback);

    const intervalMs = Math.max(1000, (constants.ethereumSlotDuration * 1000) / 4);
    this.runningPromise = new RunningPromise(() => this.scan(), this.log, intervalMs);
    this.log.info('BroadcastedInvalidBlockProposalWatcher initialized', {
      scanSlotLookback: this.scanSlotLookback,
    });
  }

  public updateConfig(config: Partial<BroadcastedInvalidBlockProposalWatcherConfig>): void {
    this.config = merge(
      this.config,
      pick(
        config,
        ...BroadcastedInvalidBlockProposalWatcherSlasherConfigKeys,
        ...BroadcastedInvalidBlockProposalWatcherConsensusConfigKeys,
      ),
    );
    this.log.verbose('BroadcastedInvalidBlockProposalWatcher config updated', this.config);
  }

  public start(): Promise<void> {
    this.runningPromise.start();
    return Promise.resolve();
  }

  public stop(): Promise<void> {
    return this.runningPromise.stop();
  }

  /**
   * Scans newly closed slots, plus a small lookback for late-arriving proposals. Anchors
   * `currentSlot` at the archiver's last synced L2 slot.
   */
  public async scan(): Promise<void> {
    const currentSlot = (await this.l2BlockSource.getSyncedL2SlotNumber()) ?? this.epochCache.getSlotNow();
    if (currentSlot <= SlotNumber(SCAN_SLOT_LAG)) {
      return;
    }

    const newestSlotToConsider = SlotNumber(currentSlot - 1 - SCAN_SLOT_LAG);
    const oldestLookbackSlot = SlotNumber(Math.max(0, newestSlotToConsider - this.scanSlotLookback + 1));
    const oldestUnscannedSlot =
      this.lastScannedSlot === undefined ? oldestLookbackSlot : SlotNumber(this.lastScannedSlot + 1);
    const oldestSlot = SlotNumber(Math.min(oldestLookbackSlot, oldestUnscannedSlot));
    for (let slot = oldestSlot; slot <= newestSlotToConsider; slot++) {
      await this.scanSlot(SlotNumber(slot));
    }
    this.lastScannedSlot = newestSlotToConsider;
  }

  /** Scans a single slot. Public for tests. */
  public async scanSlot(slot: SlotNumber): Promise<void> {
    const { blockProposals } = await this.p2pClient.getProposalsForSlot(slot);
    const slashArgs = this.getSlashArgsForProposals(slot, blockProposals).filter(args => this.markAsNewOffense(args));
    if (slashArgs.length === 0) {
      return;
    }

    this.log.info(`Detected broadcasted invalid block proposal offense`, {
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

  private getSlashArgsForProposals(slot: SlotNumber, blockProposals: BlockProposal[]): WantToSlashArgs[] {
    const maxBlocksPerCheckpoint = this.config.maxBlocksPerCheckpoint;
    if (maxBlocksPerCheckpoint === undefined) {
      return [];
    }

    const offenders = new Map<string, EthAddress>();
    for (const proposal of blockProposals) {
      if (proposal.indexWithinCheckpoint < maxBlocksPerCheckpoint) {
        continue;
      }
      const signer = proposal.getSender();
      if (signer) {
        offenders.set(signer.toString(), signer);
      }
    }

    // we expect one proposer per slot today.
    return [...offenders.values()].map(validator => ({
      validator,
      amount: this.config.slashBroadcastedInvalidBlockPenalty,
      offenseType: OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL,
      epochOrSlot: BigInt(slot),
    }));
  }

  private markAsNewOffense(args: WantToSlashArgs): boolean {
    const key = `${args.validator.toString()}-${args.offenseType}-${args.epochOrSlot}`;
    return this.emittedOffenses.addIfAbsent(key);
  }
}
