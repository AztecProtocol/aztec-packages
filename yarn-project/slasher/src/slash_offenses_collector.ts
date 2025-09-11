import { createLogger } from '@aztec/foundation/log';
import type { Prettify } from '@aztec/foundation/types';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';
import { type Offense, type OffenseIdentifier, getSlotForOffense } from '@aztec/stdlib/slashing';

import type { SlasherOffensesStore } from './stores/offenses_store.js';
import { WANT_TO_SLASH_EVENT, type WantToSlashArgs, type Watcher } from './watcher.js';

export type SlashOffensesCollectorConfig = Prettify<Pick<SlasherConfig, 'slashGracePeriodL2Slots'>>;
export type SlashOffensesCollectorSettings = Prettify<
  Pick<L1RollupConstants, 'epochDuration'> & { slashingAmounts: [bigint, bigint, bigint] | undefined }
>;

/**
 * Collects and manages slashable offenses from watchers.
 * This class handles the common logic for subscribing to slash watcher events,
 * storing offenses, and retrieving pending offenses for slashing.
 */
export class SlashOffensesCollector {
  private readonly unwatchCallbacks: (() => void)[] = [];

  constructor(
    private readonly config: SlashOffensesCollectorConfig,
    private readonly settings: SlashOffensesCollectorSettings,
    private readonly watchers: Watcher[],
    private readonly offensesStore: SlasherOffensesStore,
    private readonly log = createLogger('slasher:offenses-collector'),
  ) {}

  public start() {
    this.log.debug('Starting SlashOffensesCollector...');

    // Subscribe to watchers WANT_TO_SLASH_EVENT
    for (const watcher of this.watchers) {
      const wantToSlashCallback = (args: WantToSlashArgs[]) =>
        void this.handleWantToSlash(args).catch(err => this.log.error('Error handling wantToSlash', err));
      watcher.on(WANT_TO_SLASH_EVENT, wantToSlashCallback);
      this.unwatchCallbacks.push(() => watcher.removeListener(WANT_TO_SLASH_EVENT, wantToSlashCallback));
    }

    this.log.info('Started SlashOffensesCollector');
    return Promise.resolve();
  }

  public stop() {
    this.log.debug('Stopping SlashOffensesCollector...');

    for (const unwatchCallback of this.unwatchCallbacks) {
      unwatchCallback();
    }

    this.log.info('SlashOffensesCollector stopped');
    return Promise.resolve();
  }

  /**
   * Called when a slash watcher emits WANT_TO_SLASH_EVENT.
   * Stores pending offenses instead of creating payloads immediately.
   * @param args - the arguments from the watcher, including the validators, amounts, and offenses
   */
  public async handleWantToSlash(args: WantToSlashArgs[]) {
    for (const arg of args) {
      const pendingOffense: Offense = {
        validator: arg.validator,
        amount: arg.amount,
        offenseType: arg.offenseType,
        epochOrSlot: arg.epochOrSlot,
      };

      if (this.shouldSkipOffense(pendingOffense)) {
        this.log.verbose('Skipping offense during grace period', pendingOffense);
        continue;
      }

      if (await this.offensesStore.hasOffense(pendingOffense)) {
        this.log.debug('Skipping repeated offense', pendingOffense);
        continue;
      }

      if (this.settings.slashingAmounts) {
        const minSlash = this.settings.slashingAmounts[0];
        if (arg.amount < minSlash) {
          this.log.warn(`Offense amount ${arg.amount} is below minimum slashing amount ${minSlash}`);
        }
      }

      this.log.info(`Adding pending offense for validator ${arg.validator}`, pendingOffense);
      await this.offensesStore.addPendingOffense(pendingOffense);
    }
  }

  /**
   * Triggered on a time basis when we enter a new slashing round.
   * Clears expired offenses from stores.
   */
  public async handleNewRound(round: bigint) {
    const cleared = await this.offensesStore.clearExpiredOffenses(round);
    if (cleared && cleared > 0) {
      this.log.debug(`Cleared ${cleared} expired offenses for round ${round}`);
    }
  }

  /**
   * Marks offenses as slashed (no longer pending)
   * @param offenses - The offenses to mark as slashed
   */
  public markAsSlashed(offenses: OffenseIdentifier[]) {
    this.log.verbose(`Marking offenses as slashed`, { offenses });
    return this.offensesStore.markAsSlashed(offenses);
  }

  /** Returns whether to skip an offense if it happened during the grace period at the beginning of the chain */
  private shouldSkipOffense(offense: Offense): boolean {
    const offenseSlot = getSlotForOffense(offense, this.settings);
    return offenseSlot < this.config.slashGracePeriodL2Slots;
  }
}
