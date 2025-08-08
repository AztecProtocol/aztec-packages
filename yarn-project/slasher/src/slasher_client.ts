import { type L1ReaderConfig, RollupContract, SlashingProposerContract, type ViemClient } from '@aztec/ethereum';
import { sumBigint } from '@aztec/foundation/bigint';
import { compactArray, filterAsync, maxBy } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import type { DateProvider } from '@aztec/foundation/timer';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';
import { SlashFactoryContract } from '@aztec/stdlib/l1-contracts';
import {
  type Offense,
  type OffenseIdentifier,
  OffenseType,
  type ProposerSlashAction,
  type ProposerSlashActionProvider,
  type SlashPayload,
  type SlashPayloadRound,
  type ValidatorSlashOffense,
  getOffenseIdentifiersFromPayload,
  isOffenseUncontroversial,
  offenseDataComparator,
  offensesToValidatorSlash,
} from '@aztec/stdlib/slashing';

import { WANT_TO_SLASH_EVENT, type WantToSlashArgs, type Watcher } from './config.js';
import type { SlasherOffensesStore, SlasherPayloadsStore } from './slasher_store.js';

type PayloadWithRound = {
  payload: EthAddress;
  round: bigint;
};

type SlasherSettings = {
  slashingExecutionDelayInRounds: bigint;
  slashingPayloadLifetimeInRounds: bigint;
};

/**
 * A Spartiate slasher client implementation
 *
 * Spartiates: a full citizen of the ancient polis of Sparta, member of an elite warrior class.
 *
 * How it works:
 *
 * The constructor accepts instances of Watcher classes that correspond to specific offenses. These "watchers" do two things:
 * - watch for their offense conditions and emit an event when they are detected
 * - confirm/deny whether they agree with a proposed offense
 *
 * The SlasherClient class is responsible for:
 * - listening for events from the watchers and storing them as pending offenses (no immediate L1 transactions)
 * - aggregating pending offenses from previous rounds when it's the proposer's turn
 * - providing actions to the sequencer via getProposerAction() for creating/voting/executing slash payloads
 * - monitoring slash payloads created by other nodes and validating them against agreement criteria
 * - tracking pending offenses with configurable expiration (default 4 rounds)
 * - ensuring payload quality through size limits, amount validation, and uncontroversial offense requirements
 * - executing slashing rounds when they become submittable
 * - removing executed offenses from the pending list
 * - persisting state (pending offenses and current round) across restarts when storage is configured
 *
 * Key changes from previous implementation:
 * - Only proposers can create slash payloads (when infrastructure supports tracking)
 * - Offenses are aggregated over rounds instead of creating immediate payloads
 * - Payload creation is round-based with scoring functions for optimal selection
 * - Agreement criteria includes uncontroversial offenses from past rounds
 */
export class SlasherClient implements ProposerSlashActionProvider {
  private unwatchCallbacks: (() => void)[] = [];
  private overridePayloadActive = false;
  private executablePayloads: PayloadWithRound[] = [];

  static async new(
    config: Omit<SlasherConfig, 'slasherPrivateKey'>,
    l1Contracts: Pick<L1ReaderConfig['l1Contracts'], 'rollupAddress' | 'slashFactoryAddress'>,
    l1Client: ViemClient,
    watchers: Watcher[],
    dateProvider: DateProvider,
    offensesStore: SlasherOffensesStore,
    payloadsStore: SlasherPayloadsStore,
    logger?: Logger,
  ) {
    if (!l1Contracts.rollupAddress) {
      throw new Error('Cannot initialize SlasherClient without a rollup address');
    }
    if (!l1Contracts.slashFactoryAddress) {
      throw new Error('Cannot initialize SlasherClient without a slashFactory address');
    }

    const rollup = new RollupContract(l1Client, l1Contracts.rollupAddress);
    const slashingProposer = await rollup.getSlashingProposer();
    const slashFactoryContract = new SlashFactoryContract(l1Client, l1Contracts.slashFactoryAddress.toString());

    const settings: SlasherSettings = {
      slashingExecutionDelayInRounds: await slashingProposer.getExecutionDelayInRounds(),
      slashingPayloadLifetimeInRounds: await slashingProposer.getLifetimeInRounds(),
    };

    return new SlasherClient(
      config,
      settings,
      slashFactoryContract,
      slashingProposer,
      l1Contracts.rollupAddress,
      watchers,
      dateProvider,
      offensesStore,
      payloadsStore,
      logger,
    );
  }

  constructor(
    public config: Omit<SlasherConfig, 'slasherPrivateKey'>,
    private settings: SlasherSettings,
    private slashFactoryContract: SlashFactoryContract,
    private slashingProposer: SlashingProposerContract,
    private rollupAddress: EthAddress,
    private watchers: Watcher[],
    private dateProvider: DateProvider,
    private offensesStore: SlasherOffensesStore,
    private payloadsStore: SlasherPayloadsStore,
    private log = createLogger('slasher'),
  ) {
    this.overridePayloadActive = config.slashOverridePayload !== undefined && !config.slashOverridePayload.isZero();
  }

  public start() {
    this.log.debug('Starting Slasher client...');

    // TODO(palla/slash): Sync any events since the last time we were offline, or since the current round started.

    // Detect when a payload wins voting via PayloadSubmittable event
    this.unwatchCallbacks.push(
      this.slashingProposer.listenToSubmittablePayloads(
        ({ payload, round }) =>
          void this.handleProposalExecutable(EthAddress.fromString(payload), round).catch(err =>
            this.log.error('Error handling proposalExecutable', err, { payload, round }),
          ),
      ),
    );

    // Detect when a payload is submitted via PayloadSubmitted event
    this.unwatchCallbacks.push(
      this.slashingProposer.listenToPayloadSubmitted(
        ({ payload, round }) =>
          void this.handleProposalExecuted(EthAddress.fromString(payload), round).catch(err =>
            this.log.error('Error handling payloadSubmitted', err, { payload, round }),
          ),
      ),
    );

    // Detect when a payload is signalled via SignalCast event
    this.unwatchCallbacks.push(
      this.slashingProposer.listenToSignalCasted(
        ({ payload, round, signaler }) =>
          void this.handleProposalSignalled(
            EthAddress.fromString(payload),
            round,
            EthAddress.fromString(signaler),
          ).catch(err => this.log.error('Error handling proposalSignalled', err, { payload, round, signaler })),
      ),
    );

    // Subscribe to watchers WANT_TO_SLASH_EVENT
    for (const watcher of this.watchers) {
      const wantToSlashCallback = (args: WantToSlashArgs[]) =>
        void this.handleWantToSlash(args).catch(err => this.log.error('Error handling wantToSlash', err));
      watcher.on(WANT_TO_SLASH_EVENT, wantToSlashCallback);
      this.unwatchCallbacks.push(() => watcher.removeListener(WANT_TO_SLASH_EVENT, wantToSlashCallback));
    }

    this.log.info(`Started slasher client`);
    return Promise.resolve();
  }

  /**
   * Allows consumers to stop the instance of the slasher client.
   * 'ready' will now return 'false' and the running promise that keeps the client synced is interrupted.
   */
  public async stop() {
    this.log.debug('Stopping Slasher client...');

    for (const unwatchCallback of this.unwatchCallbacks) {
      unwatchCallback();
    }

    // Viem calls eth_uninstallFilter under the hood when uninstalling event watchers, but these calls are not awaited,
    // meaning that any error that happens during the uninstallation will not be caught. This causes errors during jest teardowns,
    // where we stop anvil after all other processes are stopped, so sometimes the eth_uninstallFilter call fails because anvil
    // is already stopped. We add a sleep here to give the uninstallation some time to complete, but the proper fix is for
    // viem to await the eth_uninstallFilter calls, or to catch any errors that happen during the uninstallation.
    // See https://github.com/wevm/viem/issues/3714.
    await sleep(2000);
    this.log.info('Slasher client stopped');
  }

  /**
   * Update the config of the slasher client
   * @param config - The new config. Cannot update the slasher private key.
   */
  public updateConfig(config: Partial<SlasherConfig>) {
    const { slasherPrivateKey: _doNotUpdate, ...configWithoutPrivateKey } = config;

    const newConfig = {
      ...this.config,
      ...configWithoutPrivateKey,
    };

    // We keep this separate flag to tell us if we should be signal for the override payload: after the override payload is executed,
    // the slasher goes back to using the monitored payloads to inform the sequencer publisher what payload to signal for.
    // So we only want to flip back "on" the voting for override payload if config we just passed in re-set the override payload.
    this.overridePayloadActive = config.slashOverridePayload !== undefined && !config.slashOverridePayload.isZero();
    this.config = newConfig;
  }

  /**
   * Called when a slash watcher emits WANT_TO_SLASH_EVENT.
   * Stores pending offenses instead of creating payloads immediately.
   * @param args - the arguments from the watcher, including the validators, amounts, and offenses
   */
  private async handleWantToSlash(args: WantToSlashArgs[]) {
    for (const arg of args) {
      const pendingOffense: Offense = {
        validator: arg.validator,
        amount: arg.amount,
        offense: arg.offense,
        epochOrSlot: arg.epochOrSlot,
      };

      if (await this.offensesStore.hasOffense(pendingOffense)) {
        this.log.debug('Skipping repeated offense', pendingOffense);
        continue;
      }

      this.log.info(`Adding pending offense for validator ${arg.validator}`, pendingOffense);
      await this.offensesStore.addPendingOffense(pendingOffense);
    }
  }

  // TODO(palla/slash): Need to wire this to either a timer or an event
  private async handleNewRound(round: bigint) {
    this.log.info(`Starting new slashing round ${round}`);
    await this.payloadsStore.clearExpiredPayloads(round);
    await this.offensesStore.removeExpiredOffenses(round);
  }

  /**
   * Called when we see a PayloadSubmittable event on the SlashProposer.
   * Adds the proposal to the list of executable ones.
   */
  private async handleProposalExecutable(payloadAddress: EthAddress, round: bigint) {
    // Track this payload for execution later
    this.executablePayloads.push({ payload: payloadAddress, round });
    this.log.verbose(`Proposal ${payloadAddress.toString()} is executable for round ${round}`, {
      payloadAddress,
      round,
    });

    // Stop signaling for the override payload if it was elected
    if (
      this.overridePayloadActive &&
      this.config.slashOverridePayload &&
      this.config.slashOverridePayload.equals(payloadAddress)
    ) {
      this.overridePayloadActive = false;
    }

    // Load the payload to unflag all offenses to be slashed as pending
    const payload =
      (await this.payloadsStore.getPayload(payloadAddress)) ??
      (await this.slashFactoryContract.getSlashPayloadFromEvents(payloadAddress, round));
    if (!payload) {
      this.log.warn(`No payload found for ${payloadAddress.toString()} in round ${round}`);
      return;
    }

    const offenses = getOffenseIdentifiersFromPayload(payload);
    this.log.debug(`Marking offenses from payload ${payloadAddress.toString()} as not pending`, { offenses });
    await this.offensesStore.removeFromPending(offenses);
  }

  /**
   * Called when we see a PayloadSubmitted event on the SlashProposer.
   * Removes the proposal from the list of executable ones.
   */
  private handleProposalExecuted(payload: EthAddress, round: bigint) {
    this.log.verbose(`Proposal ${payload.toString()} on round ${round} has been executed`);
    const index = this.executablePayloads.findIndex(p => p.payload.equals(payload));
    if (index !== -1) {
      this.executablePayloads.splice(index, 1);
    }
    return Promise.resolve();
  }

  /**
   * Called when we see a SignalCast event on the SlashProposer.
   * Adds a vote for the given payload in the round.
   * Retrieves the proposal if we have not seen it before.
   */
  private async handleProposalSignalled(payloadAddress: EthAddress, round: bigint, signaller: EthAddress) {
    const payload = await this.payloadsStore.getPayload(payloadAddress);
    if (!payload) {
      this.log.debug(`Fetching payload for signal at ${payloadAddress.toString()}`);
      const payload = await this.slashFactoryContract.getSlashPayloadFromEvents(payloadAddress, round);
      if (!payload) {
        this.log.warn(`No payload found for signal at ${payloadAddress.toString()}`);
        return;
      }
      const votes = await this.slashingProposer.getPayloadSignals(
        this.rollupAddress.toString(),
        round,
        payloadAddress.toString(),
      );
      await this.payloadsStore.addPayload({ ...payload, votes, round });
      this.log.verbose(`Added payload at ${payloadAddress}`, { ...payload, votes, round, signaller });
    } else {
      const votes = await this.payloadsStore.incrementPayloadVotes(payloadAddress, round);
      this.log.verbose(`Added vote for payload at ${payloadAddress}`, { votes, signaller, round });
    }
  }

  /**
   * Create a slash payload for the given round from pending offenses
   * @param round - The round to create the payload for
   * @returns The payload data or undefined if no offenses to slash
   */
  private async gatherOffensesForRound(round: bigint): Promise<Offense[]> {
    // Filter pending offenses to those that can be included in this round
    const pendingOffenses = await this.offensesStore.getPendingOffenses();
    const eligibleOffenses = pendingOffenses.filter(offense => this.isOffenseForRound(offense, round));

    // Sort by uncontroversial first, then slash amount (descending), then detection time (ascending)
    const sortedOffenses = [...eligibleOffenses].sort(offenseDataComparator);

    // Take up to maxPayloadSize offenses
    const selectedOffenses = sortedOffenses.slice(0, this.config.slashMaxPayloadSize);
    if (selectedOffenses.length !== sortedOffenses.length) {
      this.log.warn(
        `Slash payload of ${sortedOffenses.length} truncated to max size of ${this.config.slashMaxPayloadSize}`,
      );
    }

    return selectedOffenses;
  }

  /**
   * Calculate score for a slash payload
   * @param payload - The payload to score
   * @param votes - Number of votes the payload has received
   * @returns The score for the payload
   */
  private calculatePayloadScore(payload: Pick<SlashPayloadRound, 'votes' | 'slashes'>): bigint {
    // TODO: Update this function to something smarter
    return payload.votes * sumBigint(payload.slashes.map(o => o.amount));
  }

  /**
   * Get the actions the proposer should take for slashing
   * @param slotNumber - The current slot number
   * @returns The actions to take
   */
  public async getProposerActions(slotNumber: bigint): Promise<ProposerSlashAction[]> {
    const [executeAction, proposePayloadActions] = await Promise.all([
      this.getExecutePayloadAction(slotNumber),
      this.getProposePayloadActions(slotNumber),
    ]);

    return compactArray<ProposerSlashAction>([executeAction, ...proposePayloadActions]);
  }

  /** Returns an execute payload action if there are any payloads ready to be executed */
  private async getExecutePayloadAction(slotNumber: bigint): Promise<ProposerSlashAction | undefined> {
    const round = this.getRoundForSlot(slotNumber);
    const toRemove: PayloadWithRound[] = [];

    let toExecute: PayloadWithRound | undefined;
    for (const payload of this.executablePayloads) {
      // TODO(palla/slash): Check for off-by-one errors here
      const executableRound = payload.round + this.settings.slashingExecutionDelayInRounds + 1n;
      if (round < executableRound) {
        this.log.debug(`Payload ${payload.payload} for round ${payload.round} is not executable yet`);
        continue;
      }

      if (payload.round + this.settings.slashingPayloadLifetimeInRounds < round) {
        this.log.verbose(`Payload ${payload.payload} for round ${payload.round} has expired`);
        toRemove.push(payload);
        continue;
      }

      const roundInfo = await this.slashingProposer.getRoundInfo(this.rollupAddress.toString(), payload.round);
      if (roundInfo.executed) {
        this.log.verbose(`Payload ${payload.payload} for round ${payload.round} has already been executed`);
        toRemove.push(payload);
        continue;
      }

      this.log.info(`Executing payload ${payload.payload} from round ${payload.round}`);
      toExecute = payload;
      break;
    }

    // Clean up expired or executed payloads
    this.executablePayloads = this.executablePayloads.filter(p => !toRemove.includes(p));
    return toExecute ? { type: 'execute-payload', round: toExecute.round } : undefined;
  }

  /** Returns a vote or create payload action based on payload scoring */
  private async getProposePayloadActions(slotNumber: bigint): Promise<ProposerSlashAction[]> {
    // If override payload is active, vote for it
    if (this.overridePayloadActive && this.config.slashOverridePayload && !this.config.slashOverridePayload.isZero()) {
      this.log.info(`Overriding slash payload to ${this.config.slashOverridePayload.toString()}`);
      return [{ type: 'vote-payload', payload: this.config.slashOverridePayload }];
    }

    // Create our ideal payload from pending offenses
    const round = this.getRoundForSlot(slotNumber);
    const idealOffenses = await this.gatherOffensesForRound(round);
    const idealPayload: Pick<SlashPayloadRound, 'slashes' | 'votes' | 'address'> | undefined =
      idealOffenses.length === 0
        ? undefined
        : { slashes: offensesToValidatorSlash(idealOffenses), votes: 1n, address: EthAddress.ZERO };

    // Find the best existing payload
    const existingPayloads = await this.payloadsStore.getPayloads(round);
    const requiredOffenses = await this.getPendingUncontroversialOffenses(round);
    const agreedPayloads = await filterAsync(existingPayloads, p => this.agreeWithPayload(p, round, requiredOffenses));
    const bestPayload = maxBy([...agreedPayloads, idealPayload], p => (p ? this.calculatePayloadScore(p) : 0));

    if (bestPayload === undefined) {
      // No payloads to vote for, do nothing
      return [];
    } else if (bestPayload === idealPayload) {
      // If our ideal payload is the best, we create it (if not deployed yet) and vote for it
      const { address, isDeployed } = await this.slashFactoryContract.getAddressAndIsDeployed(idealPayload.slashes);
      const createAction: ProposerSlashAction | undefined = isDeployed
        ? undefined
        : { type: 'create-payload', data: idealPayload.slashes };
      const voteAction: ProposerSlashAction = { type: 'vote-payload', payload: address };
      return compactArray([createAction, voteAction]);
    } else {
      // Otherwise, vote for our favorite payload
      return [{ type: 'vote-payload', payload: bestPayload.address }];
    }
  }

  /** Returns the slashing round given an L2 slot number  */
  private getRoundForSlot(_slotNumber: bigint): bigint {
    throw new Error('Method not implemented.');
  }

  /**
   * Check if we agree with a payload:
   * - We must agree with every offense in the payload
   * - All uncontroversial offenses from past rounds must be included
   * - Payload must be below maximum size
   * - Slash amounts must be within acceptable ranges
   */
  private async agreeWithPayload(
    payload: SlashPayload,
    round: bigint,
    cachedUncontroversialOffenses?: Offense[],
  ): Promise<boolean> {
    // Check size limit
    const maxPayloadSize = this.config.slashMaxPayloadSize;
    if (payload.slashes.length > maxPayloadSize) {
      this.log.verbose(
        `Rejecting payload ${payload.address} since size ${payload.slashes.length} exceeds maximum ${maxPayloadSize}`,
        { payload, maxPayloadSize },
      );
      return false;
    }

    // Check we agree with all offenses and proposed slash amounts, and all offenses are from past rounds
    for (const slash of payload.slashes) {
      for (const { offenseType, epochOrSlot } of slash.offenses) {
        const offense = { validator: slash.validator, offense: offenseType, epochOrSlot };
        if (!(await this.offensesStore.hasPendingOffense(offense))) {
          this.log.debug(`Rejecting payload ${payload.address} due to offense not found`, { offense, payload });
          return false;
        }
        const [minRound, maxRound] = this.getRoundRangeForOffense(offense);
        if (round < minRound || round > maxRound) {
          this.log.debug(`Rejecting payload ${payload.address} due to offense not from valid round`, {
            offense,
            payload,
            round,
            minRound,
            maxRound,
          });
          return false;
        }
      }
      const [minSlashAmount, maxSlashAmount] = this.getSlashAmountValidRange(slash.offenses);
      if (slash.amount < minSlashAmount || slash.amount > maxSlashAmount) {
        this.log.debug(`Rejecting payload ${payload.address} due to slash amount out of range`, {
          amount: slash.amount,
          minSlashAmount,
          maxSlashAmount,
          payload,
        });
        return false;
      }
    }

    // Check that all uncontroversial offenses from past rounds are included
    const uncontroversialOffenses =
      cachedUncontroversialOffenses ?? (await this.getPendingUncontroversialOffenses(round));
    for (const requiredOffense of uncontroversialOffenses) {
      const validatorOffenses = payload.slashes
        .filter(slash => slash.validator.equals(requiredOffense.validator))
        .flatMap(slash => slash.offenses);
      if (
        !validatorOffenses.some(
          o => o.offenseType === requiredOffense.offense && o.epochOrSlot === requiredOffense.epochOrSlot,
        )
      ) {
        this.log.debug(
          `Rejecting payload due to missing uncontroversial offense for validator ${requiredOffense.validator}`,
          { requiredOffense, validatorOffenses, payload },
        );
        return false;
      }
    }

    return true;
  }

  /**
   * Returns the range of rounds in which we could expect an offense to be found.
   * Upper bound is determined by all offenses that should have been captured before the start of the current round,
   * which depends on the offense type (eg INACTIVITY is captured once an epoch ends, DATA_WITHHOLDING is captured
   * after the epoch proof submission window for the epoch for which the data was withheld).
   * Lower bound is determined by the expiration rounds for an offense, which is a config setting.
   * Both bounds are inclusive.
   */
  private getRoundRangeForOffense(_offense: OffenseIdentifier): [bigint, bigint] {
    throw new Error('Method not implemented.');
  }

  /** Returns whether the given offense can be included in the given round. */
  private isOffenseForRound(offense: OffenseIdentifier, round: bigint): boolean {
    const [minRound, maxRound] = this.getRoundRangeForOffense(offense);
    return round >= minRound && round <= maxRound;
  }

  /** Returns the acceptable range for slash amount given a set of offenses. */
  private getSlashAmountValidRange(offenses: ValidatorSlashOffense[]): [bigint, bigint] {
    if (offenses.length === 0) {
      return [0n, 0n];
    }
    const minAmount = sumBigint(offenses.map(o => this.getMinAmountForOffense(o.offenseType)));
    const maxAmount = sumBigint(offenses.map(o => this.getMaxAmountForOffense(o.offenseType)));
    return [minAmount, maxAmount];
  }

  /** Get uncontroversial offenses that are expected to be present on the current round. */
  private async getPendingUncontroversialOffenses(round: bigint): Promise<Offense[]> {
    const pendingOffenses = await this.offensesStore.getPendingOffenses();

    const filteredOffenses = pendingOffenses
      .filter(offense => isOffenseUncontroversial(offense.offense) && this.isOffenseForRound(offense, round))
      .sort(offenseDataComparator);

    return filteredOffenses.slice(0, this.config.slashMaxPayloadSize);
  }

  /**
   * Get minimum acceptable amount for an offense type
   */
  private getMinAmountForOffense(offense: OffenseType): bigint {
    // Use the configured penalty amounts as minimums
    // TODO(palla/slash): Should we add a new set of variables? Or just have a multiplier so we dont go crazy?
    switch (offense) {
      case OffenseType.VALID_EPOCH_PRUNED:
      case OffenseType.DATA_WITHHOLDING:
        return this.config.slashPrunePenalty;
      case OffenseType.INACTIVITY:
        return this.config.slashInactivityCreatePenalty;
      case OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS:
      case OffenseType.PROPOSED_INCORRECT_ATTESTATIONS:
        return this.config.slashProposeInvalidAttestationsPenalty;
      case OffenseType.ATTESTED_DESCENDANT_OF_INVALID:
        return this.config.slashAttestDescendantOfInvalidPenalty;
      case OffenseType.UNKNOWN:
        return this.config.slashUnknownPenalty;
      case OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL:
        return this.config.slashBroadcastedInvalidBlockPenalty;
      default: {
        const _: never = offense;
        throw new Error(`Unknown offense type: ${offense}`);
      }
    }
  }

  /**
   * Get maximum acceptable amount for an offense type
   */
  private getMaxAmountForOffense(offense: OffenseType): bigint {
    // Use the configured max penalty amounts
    switch (offense) {
      case OffenseType.VALID_EPOCH_PRUNED:
      case OffenseType.DATA_WITHHOLDING:
        return this.config.slashPruneMaxPenalty;
      case OffenseType.INACTIVITY:
        return this.config.slashInactivityMaxPenalty;
      case OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS:
      case OffenseType.PROPOSED_INCORRECT_ATTESTATIONS:
        return this.config.slashProposeInvalidAttestationsMaxPenalty;
      case OffenseType.ATTESTED_DESCENDANT_OF_INVALID:
        return this.config.slashAttestDescendantOfInvalidMaxPenalty;
      case OffenseType.UNKNOWN:
        return this.config.slashUnknownMaxPenalty;
      case OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL:
        return this.config.slashBroadcastedInvalidBlockMaxPenalty;
      default: {
        const _: never = offense;
        throw new Error(`Unknown offense type: ${offense}`);
      }
    }
  }
}
