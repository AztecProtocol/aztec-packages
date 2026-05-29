import type { EpochCache } from '@aztec/epoch-cache';
import { CheckpointProposalHash, SlotNumber } from '@aztec/foundation/branded-types';
import { compactArray, merge, pick } from '@aztec/foundation/collection';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/promise';
import type { L2BlockSource } from '@aztec/stdlib/block';
import { getAttestationInfoFromPublishedCheckpoint } from '@aztec/stdlib/block';
import type { CheckpointReexecutionTracker, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import type { ITxProvider, P2PApi, SlasherConfig } from '@aztec/stdlib/interfaces/server';
import { ConsensusPayload, type CoordinationSignatureContext } from '@aztec/stdlib/p2p';
import { OffenseType } from '@aztec/stdlib/slashing';
import type { TxHash } from '@aztec/stdlib/tx';

import EventEmitter from 'node:events';

import { WANT_TO_SLASH_EVENT, type WantToSlashArgs, type Watcher, type WatcherEmitter } from '../watcher.js';

const DataWithholdingWatcherConfigKeys = ['slashDataWithholdingPenalty', 'slashDataWithholdingToleranceSlots'] as const;

type DataWithholdingWatcherConfig = Pick<SlasherConfig, (typeof DataWithholdingWatcherConfigKeys)[number]>;

/**
 * Detects data-withholding offenses by probing the local mempool for the txs in published
 * checkpoints once they are old enough that an honest node should have collected them.
 *
 * Per AZIP-7: once `slashDataWithholdingToleranceSlots` full slots have elapsed after the
 * checkpoint's slot — i.e. at `slotStart(checkpoint.slot + slashDataWithholdingToleranceSlots
 * + 1)` — if any tx from the checkpoint's blocks is still missing locally, the checkpoint's
 * attesters are considered at fault for not making the data available, and we emit a slash
 * for them.
 *
 * The watcher ticks at quarter-eth-slot cadence (matching the Sentinel template). On boot it
 * floors processing at the current slot — restart-time gaps are accepted and not back-filled,
 * matching the Sentinel approach.
 */
export class DataWithholdingWatcher extends (EventEmitter as new () => WatcherEmitter) implements Watcher {
  private runningPromise: RunningPromise;
  private initialSlot: SlotNumber | undefined;
  private lastCheckedSlot: SlotNumber | undefined;
  private config: DataWithholdingWatcherConfig;

  constructor(
    private readonly epochCache: EpochCache,
    private readonly l2BlockSource: Pick<L2BlockSource, 'getCheckpoint' | 'getSyncedL2SlotNumber'>,
    private readonly txProvider: Pick<ITxProvider, 'hasTxs'>,
    private readonly p2p: Pick<P2PApi, 'getCheckpointAttestationsForSlot'>,
    private readonly reexecutionTracker: Pick<CheckpointReexecutionTracker, 'getTxsCollectedRecord'>,
    private readonly signatureContext: CoordinationSignatureContext,
    config: DataWithholdingWatcherConfig,
    private readonly log: Logger = createLogger('data-withholding-watcher'),
  ) {
    super();
    this.config = pick(config, ...DataWithholdingWatcherConfigKeys);
    const interval = (epochCache.getL1Constants().ethereumSlotDuration * 1000) / 4;
    this.runningPromise = new RunningPromise(this.work.bind(this), log, interval);
    this.log.verbose(`DataWithholdingWatcher initialized`, this.config);
  }

  public async start(): Promise<void> {
    // Floor processing at the archiver's synced slot rather than the wallclock — restart-time
    // gaps before the archiver catches up are accepted and not back-filled. Falls back to the
    // wallclock if the archiver isn't ready yet (cold start).
    const syncedSlot = await this.l2BlockSource.getSyncedL2SlotNumber();
    this.initialSlot = syncedSlot ?? this.epochCache.getSlotNow();
    this.log.info(`Starting data-withholding watcher with initial slot ${this.initialSlot}`);
    this.runningPromise.start();
  }

  public stop(): Promise<void> {
    return this.runningPromise.stop();
  }

  public updateConfig(config: Partial<SlasherConfig>): void {
    this.config = merge(this.config, pick(config, ...DataWithholdingWatcherConfigKeys));
    this.log.verbose('DataWithholdingWatcher config updated', this.config);
  }

  /**
   * Runs every tick. Walks newly-eligible slots and probes their checkpoints for data
   * availability; emits a DATA_WITHHOLDING slash for any checkpoint whose txs are missing.
   */
  public async work(): Promise<void> {
    if (this.initialSlot === undefined) {
      return;
    }

    if (this.config.slashDataWithholdingPenalty === 0n) {
      return; // disabled
    }

    // tolerance is the number of full slots that must elapse after the checkpoint's slot
    // before we declare its data missing. For checkpoint slot S, we therefore process S
    // only once we are in slot `S + tolerance + 1` or later. Drive this off the archiver's
    // synced slot rather than the wallclock so we don't make claims about slots we haven't
    // fully ingested yet (archiver may lag behind L1).
    const tolerance = this.config.slashDataWithholdingToleranceSlots;
    const currentSlot = (await this.l2BlockSource.getSyncedL2SlotNumber()) ?? this.epochCache.getSlotNow();
    if (currentSlot <= tolerance) {
      return;
    }

    const targetSlot = SlotNumber(currentSlot - tolerance - 1);
    if (targetSlot <= this.initialSlot) {
      return;
    }

    const startSlot = this.lastCheckedSlot === undefined ? this.initialSlot : this.lastCheckedSlot;
    for (let slot = SlotNumber(startSlot + 1); slot <= targetSlot; slot = SlotNumber(slot + 1)) {
      try {
        await this.processSlot(slot);
      } catch (err) {
        this.log.error(`Error processing slot ${slot} for data-withholding check`, err, { slot });
      }
      this.lastCheckedSlot = slot;
    }
  }

  /** Probes the checkpoint at the given slot, if any, and emits a slash on missing txs. */
  private async processSlot(slot: SlotNumber): Promise<void> {
    const published = await this.l2BlockSource.getCheckpoint({ slot });
    if (!published) {
      this.log.trace(`No published checkpoint at slot ${slot}`, { slot });
      return;
    }

    const checkpointNumber = published.checkpoint.number;

    // Per-block tx-collection records (true | false | undefined) for every block in this
    // published checkpoint. Captured by the validator's proposal handler at the moment of
    // tx collection (i.e. by the *re-execution* deadline). Used as a positive short-circuit
    // only: a `true` for every block means we know the data was available locally, so this
    // checkpoint cannot be a data-withholding offense. A `false` does *not* trigger a slash
    // on its own — the re-execution deadline is much earlier than the data-withholding
    // tolerance window, so missing txs at that earlier deadline may still arrive in time.
    // Anything other than all-true falls through to the mempool probe, which respects the
    // tolerance window.
    const collectionRecords = published.checkpoint.blocks.map((block, idx) =>
      this.reexecutionTracker.getTxsCollectedRecord(block.header.getSlot(), idx),
    );

    if (collectionRecords.every(r => r === true)) {
      this.log.trace(`All blocks for checkpoint at slot ${slot} were collected locally; skipping`, {
        slot,
        checkpointNumber,
      });
      return;
    }

    const txHashes: TxHash[] = published.checkpoint.blocks.flatMap(block =>
      block.body.txEffects.map(txEffect => txEffect.txHash),
    );

    if (txHashes.length === 0) {
      this.log.trace(`Checkpoint at slot ${slot} has no txs`, { slot });
      return;
    }

    const availability = await this.txProvider.hasTxs(txHashes);
    const missingTxs = txHashes.filter((_, i) => !availability[i]);
    if (missingTxs.length === 0) {
      this.log.trace(`All ${txHashes.length} txs available for checkpoint at slot ${slot}`, { slot });
      return;
    }

    const attesters = await this.extractAttesters(published);

    if (attesters.length === 0) {
      this.log.warn(`Detected data withholding at slot ${slot} but no recoverable attesters`, {
        slot,
        checkpointNumber,
        missingTxs: missingTxs.map(h => h.toString()),
        records: collectionRecords,
      });
      return;
    }

    this.log.warn(`Detected data withholding at slot ${slot}. Slashing ${attesters.length} attesters.`, {
      slot,
      checkpointNumber,
      missingTxs: missingTxs.map(h => h.toString()),
      records: collectionRecords,
      attesters: attesters.map(a => a.toString()),
    });

    const args: WantToSlashArgs[] = attesters.map(validator => ({
      validator,
      amount: this.config.slashDataWithholdingPenalty,
      offenseType: OffenseType.DATA_WITHHOLDING,
      epochOrSlot: BigInt(slot),
    }));
    this.emit(WANT_TO_SLASH_EVENT, args);
  }

  /**
   * Returns the union of:
   *   1. attesters whose signatures landed in the published checkpoint on L1, and
   *   2. attesters we observed signing the same proposal on p2p (the proposer publishes as
   *      soon as it has hit committee quorum, so honest peer attestations that arrive after
   *      that point are dropped — but they still vouched for the data and
   *      should be slashed for withholding it).
   *
   *
   * Exposed as protected so tests can substitute a deterministic recovery without having
   * to construct real secp256k1 signatures.
   */
  protected async extractAttesters(published: PublishedCheckpoint): Promise<EthAddress[]> {
    const fromL1 = getAttestationInfoFromPublishedCheckpoint(published, this.signatureContext)
      .filter(info => info.status === 'recovered-from-signature')
      .map(info => info.address);

    const slot = published.checkpoint.header.slotNumber;
    const proposalPayloadHash = CheckpointProposalHash.fromBuffer(
      ConsensusPayload.fromCheckpoint(published.checkpoint, this.signatureContext).getPayloadHash(),
    );
    const fromP2p = await this.p2p
      .getCheckpointAttestationsForSlot(slot, proposalPayloadHash)
      .then(attestations => attestations.map(a => a.getSender()));

    // Dedupe
    const all = new Map<string, EthAddress>();
    for (const addr of compactArray([...fromL1, ...fromP2p])) {
      all.set(addr.toString(), addr);
    }
    return [...all.values()];
  }
}
