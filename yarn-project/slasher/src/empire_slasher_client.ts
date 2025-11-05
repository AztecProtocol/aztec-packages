import { EmpireSlashingProposerContract, RollupContract, SlasherContract } from '@aztec/ethereum';
import { sumBigint } from '@aztec/foundation/bigint';
import { compactArray, filterAsync, maxBy, pick } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import type { DateProvider } from '@aztec/foundation/timer';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
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
  getFirstEligibleRoundForOffense,
  getOffenseIdentifiersFromPayload,
  getPenaltyForOffense,
  isOffenseUncontroversial,
  offenseDataComparator,
  offensesToValidatorSlash,
} from '@aztec/stdlib/slashing';

import { SlashOffensesCollector, type SlashOffensesCollectorSettings } from './slash_offenses_collector.js';
import { SlashRoundMonitor } from './slash_round_monitor.js';
import type { SlasherClientInterface } from './slasher_client_interface.js';
import type { SlasherOffensesStore } from './stores/offenses_store.js';
import type { SlasherPayloadsStore } from './stores/payloads_store.js';
import type { Watcher } from './watcher.js';

/** Used to track executable payloads for each round */
export type PayloadWithRound = {
  payload: EthAddress;
  round: bigint;
};

/** Node configuration for the empire slasher */
export type EmpireSlasherConfig = SlasherConfig;

/** Settings used in the empire slasher client, loaded from the L1 contracts during initialization */
export type EmpireSlasherSettings = {
  slashingExecutionDelayInRounds: number;
  slashingPayloadLifetimeInRounds: number;
  slashingRoundSize: number;
  slashingQuorumSize: number;
} & Pick<
  L1RollupConstants,
  'epochDuration' | 'proofSubmissionEpochs' | 'l1GenesisTime' | 'slotDuration' | 'l1StartBlock' | 'ethereumSlotDuration'
> &
  SlashOffensesCollectorSettings;

/**
 * The Empire Slasher client is responsible for managing slashable offenses and slash payloads
 * using the Empire slashing model where fixed payloads are created and voted on.
 *
 * The client subscribes to several slash watchers that emit offenses and tracks them. When the slasher is the
 * proposer, it aggregates pending offenses from previous rounds and creates slash payloads, or votes for previous
 * slash payloads.
 * Voting is handled by the sequencer publisher, the slasher client does not interact with L1 directly.
 * The client also monitors slash payloads created by other nodes, and executes them when they become submittable.
 *
 * Payload creation and selection
 * - At each L2 slot in a slashing round, the proposer for that L2 slot may vote for an existing slashing payload or
 * create one of their own. Note that anyone can create a slash payload on L1, but nodes will only follow payloads
 * from proposers; we could enforce this on L1, but we do not want to make any changes there if we can avoid it.
 * - If it is the first L2 slot in the slashing round, there is nothing to vote for, so the proposer creates a slash
 * payload and votes for it.
 * - On their turn, each proposer computes a score for each payload in the round. This score is a function of the
 * total offences slashed, how many votes it has received so far, and how far into the round we are. The score for a
 * payload is zero if the proposer disagrees with it (see "agreement" below).
 * - The proposer also computes the score for the payload they would create. If the resulting score is higher than
 * any existing payload, it creates the payload. Otherwise, it votes for the one with the highest score.
 *
 * Collecting offences
 * - Whenever a node spots a slashable offence, they store it and add it to a local collection of "pending
 * offences". When a proposer needs to create a slash payload, they include all pending offences from previous
 * rounds. This means an offence is **only slashable in the next round it happened** (or a future one).
 * - Each offence also carries an epoch or block identifier, so we can differentiate two offences of the same kind by
 * the same validator.
 * - When a slash payload is flagged as executable (as in it got enough votes to be executed), nodes remove all
 * slashed offences in the payload from their collection of pending offences.
 * - Pending offences expire after a configurable time. This is to minimize divergences. For instance, a validator
 * that has to be slashed due to inactivity 50 epochs ago will only be considered for slashing by nodes that were
 * online 50 epochs ago. We propose using the validator exit window as expiration time, any value higher means that
 * we may try slashing validators that have exited the set already.
 *
 * Agreement and scoring
 * - A proposer will *agree* with a slash payload if it *agrees* with every offence in the payload, all
 * *uncontroversial* offences from the past round are included, and it is below a configurable maximum size.
 * - An *uncontroversial* offence is one where every node agrees that a slash is in order, regardless of any p2p
 * network partitions. The only uncontroversial offence we have now is "proposing a block on L1 with invalid
 * attestations".
 * - A proposer will *agree* with a given offence if it is present in its list of "pending offences", and the
 * slashing amount is within a configurable min-max range.
 * - Slash payloads need a maximum size to ensure they can don't exceed the maximum L1 gas per tx when executed.
 * This is configurable but depends on the L1 contracts implementation. When creating a payload, if there are too
 * many pending offences to fit, proposers favor the offences with the highest slashing amount first, tie-breaking by
 * choosing the most recent ones.
 * - The scoring function will boost proposals with more agreed slashes, as well as proposals with more votes, and
 * will disincentivize the creation of new proposals as the end of the round nears. This function will NOT be
 * enforced on L1.
 *
 * Execution
 * - Once a slash payload becomes executable, the next proposer is expected to execute it. If they don't, the
 * following does, and so on. No gas rebate is given.
 */
export class EmpireSlasherClient implements ProposerSlashActionProvider, SlasherClientInterface {
  protected executablePayloads: PayloadWithRound[] = [];

  private unwatchCallbacks: (() => void)[] = [];
  private overridePayloadActive = false;
  private offensesCollector: SlashOffensesCollector;
  private roundMonitor: SlashRoundMonitor;

  constructor(
    private config: EmpireSlasherConfig,
    private settings: EmpireSlasherSettings,
    private slashFactoryContract: SlashFactoryContract,
    private slashingProposer: EmpireSlashingProposerContract,
    private slasher: SlasherContract,
    private rollup: RollupContract,
    watchers: Watcher[],
    private dateProvider: DateProvider,
    private offensesStore: SlasherOffensesStore,
    private payloadsStore: SlasherPayloadsStore,
    private log = createLogger('slasher:empire'),
  ) {
    this.overridePayloadActive = config.slashOverridePayload !== undefined && !config.slashOverridePayload.isZero();
    this.roundMonitor = new SlashRoundMonitor(this.settings, this.dateProvider);
    this.offensesCollector = new SlashOffensesCollector(config, this.settings, watchers, offensesStore);
  }

  public async start() {
    this.log.debug('Starting Empire Slasher client...');

    // Start the offenses collector
    await this.offensesCollector.start();

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

    // Check for round changes
    this.unwatchCallbacks.push(this.roundMonitor.listenToNewRound(round => this.handleNewRound(round)));

    this.log.info(`Started empire slasher client`);
    return Promise.resolve();
  }

  /**
   * Allows consumers to stop the instance of the slasher client.
   * 'ready' will now return 'false' and the running promise that keeps the client synced is interrupted.
   */
  public async stop() {
    this.log.debug('Stopping Empire Slasher client...');

    for (const unwatchCallback of this.unwatchCallbacks) {
      unwatchCallback();
    }

    this.roundMonitor.stop();
    await this.offensesCollector.stop();

    // Viem calls eth_uninstallFilter under the hood when uninstalling event watchers, but these calls are not awaited,
    // meaning that any error that happens during the uninstallation will not be caught. This causes errors during jest teardowns,
    // where we stop anvil after all other processes are stopped, so sometimes the eth_uninstallFilter call fails because anvil
    // is already stopped. We add a sleep here to give the uninstallation some time to complete, but the proper fix is for
    // viem to await the eth_uninstallFilter calls, or to catch any errors that happen during the uninstallation.
    // See https://github.com/wevm/viem/issues/3714.
    await sleep(2000);
    this.log.info('Empire Slasher client stopped');
  }

  /** Returns the current config */
  public getConfig(): EmpireSlasherConfig {
    return this.config;
  }

  /**
   * Update the config of the slasher client
   * @param config - The new config
   */
  public updateConfig(config: Partial<SlasherConfig>) {
    const newConfig = { ...this.config, ...config };

    // We keep this separate flag to tell us if we should be signal for the override payload: after the override payload is executed,
    // the slasher goes back to using the monitored payloads to inform the sequencer publisher what payload to signal for.
    // So we only want to flip back "on" the voting for override payload if config we just passed in re-set the override payload.
    this.overridePayloadActive = config.slashOverridePayload !== undefined && !config.slashOverridePayload.isZero();
    this.config = newConfig;
  }

  public getSlashPayloads(): Promise<SlashPayloadRound[]> {
    return this.payloadsStore.getPayloadsForRound(this.roundMonitor.getCurrentRound().round);
  }

  /**
   * Triggered on a time basis when we enter a new slashing round.
   * Clears expired payloads and offenses from stores.
   */
  protected async handleNewRound(round: bigint) {
    this.log.info(`Starting new slashing round ${round}`);
    await this.payloadsStore.clearExpiredPayloads(round);
    await this.offensesCollector.handleNewRound(round);
  }

  /**
   * Called when we see a PayloadSubmittable event on the SlashProposer.
   * Adds the proposal to the list of executable ones.
   */
  protected async handleProposalExecutable(payloadAddress: EthAddress, round: bigint) {
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
      (await this.slashFactoryContract.getSlashPayloadFromEvents(payloadAddress, this.settings));
    if (!payload) {
      this.log.warn(`No payload found for ${payloadAddress.toString()} in round ${round}`);
      return;
    }

    const offenses = getOffenseIdentifiersFromPayload(payload);
    await this.offensesCollector.markAsSlashed(offenses);
  }

  /**
   * Called when we see a PayloadSubmitted event on the SlashProposer.
   * Removes the proposal from the list of executable ones.
   */
  protected handleProposalExecuted(payload: EthAddress, round: bigint) {
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
  protected async handleProposalSignalled(payloadAddress: EthAddress, round: bigint, signaller: EthAddress) {
    const payload = await this.payloadsStore.getPayload(payloadAddress);
    if (!payload) {
      this.log.debug(`Fetching payload for signal at ${payloadAddress.toString()}`);
      const payload = await this.slashFactoryContract.getSlashPayloadFromEvents(payloadAddress, this.settings);
      if (!payload) {
        this.log.warn(`No payload found for signal at ${payloadAddress.toString()}`);
        return;
      }
      const votes = await this.slashingProposer.getPayloadSignals(
        this.rollup.address,
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
   * @param round - The round to create the payload for, defaults to the current round
   * @returns The payload data or undefined if no offenses to slash
   */
  public async gatherOffensesForRound(round?: bigint): Promise<Offense[]> {
    round ??= this.roundMonitor.getCurrentRound().round;

    // Filter pending offenses to those that can be included in this round
    const pendingOffenses = await this.offensesStore.getPendingOffenses();
    const eligibleOffenses = pendingOffenses.filter(offense => this.isOffenseForRound(offense, round));

    // Sort by uncontroversial first, then slash amount (descending), then detection time (ascending)
    const sortedOffenses = [...eligibleOffenses].sort(offenseDataComparator);

    // Take up to maxPayloadSize offenses
    const { slashMaxPayloadSize } = this.config;
    const selectedOffenses = sortedOffenses.slice(0, slashMaxPayloadSize);
    if (selectedOffenses.length !== sortedOffenses.length) {
      this.log.warn(`Offense list of ${sortedOffenses.length} truncated to max size of ${slashMaxPayloadSize}`);
    }

    return selectedOffenses;
  }

  /** Returns all pending offenses stored */
  public getPendingOffenses(): Promise<Offense[]> {
    return this.offensesStore.getPendingOffenses();
  }

  /** Get uncontroversial offenses that are expected to be present on the given round. */
  protected async getPendingUncontroversialOffensesForRound(round: bigint): Promise<Offense[]> {
    const pendingOffenses = await this.offensesStore.getPendingOffenses();

    const filteredOffenses = pendingOffenses
      .filter(offense => isOffenseUncontroversial(offense.offenseType) && this.isOffenseForRound(offense, round))
      .sort(offenseDataComparator);

    return filteredOffenses.slice(0, this.config.slashMaxPayloadSize);
  }

  /**
   * Calculate score for a slash payload, bumping the votes by one, so we get the score as if we voted for it.
   * @param payload - The payload to score
   * @param votes - Number of votes the payload has received
   * @returns The score for the payload
   */
  protected calculatePayloadScore(payload: Pick<SlashPayloadRound, 'votes' | 'slashes'>): bigint {
    // TODO: Update this function to something smarter
    return (payload.votes + 1n) * sumBigint(payload.slashes.map(o => o.amount));
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
  protected async getExecutePayloadAction(slotNumber: bigint): Promise<ProposerSlashAction | undefined> {
    const { round } = this.roundMonitor.getRoundForSlot(slotNumber);
    const toRemove: PayloadWithRound[] = [];

    let toExecute: PayloadWithRound | undefined;
    for (const payload of this.executablePayloads) {
      const executableRound = payload.round + BigInt(this.settings.slashingExecutionDelayInRounds) + 1n;
      if (round < executableRound) {
        this.log.debug(`Payload ${payload.payload} for round ${payload.round} is not executable yet`);
        continue;
      }

      if (payload.round + BigInt(this.settings.slashingPayloadLifetimeInRounds) < round) {
        this.log.verbose(`Payload ${payload.payload} for round ${payload.round} has expired`);
        toRemove.push(payload);
        continue;
      }

      const roundInfo = await this.slashingProposer.getRoundInfo(this.rollup.address, payload.round);
      if (roundInfo.executed) {
        this.log.verbose(`Payload ${payload.payload} for round ${payload.round} has already been executed`);
        toRemove.push(payload);
        continue;
      }

      // Check if slashing is enabled at all
      if (!(await this.slasher.isSlashingEnabled())) {
        this.log.warn(`Slashing is disabled in the Slasher contract (skipping execution)`);
        return undefined;
      }

      // Check if the slash payload is vetoed
      const isVetoed = await this.slasher.isPayloadVetoed(payload.payload);

      if (isVetoed) {
        this.log.info(`Payload ${payload.payload} from round ${payload.round} is vetoed (skipping execution)`);
        toRemove.push(payload);
        continue;
      }

      this.log.info(`Executing payload ${payload.payload} from round ${payload.round}`);
      toExecute = payload;
      break;
    }

    // Clean up expired or executed payloads
    this.executablePayloads = this.executablePayloads.filter(p => !toRemove.includes(p));
    return toExecute ? { type: 'execute-empire-payload', round: toExecute.round } : undefined;
  }

  /** Returns a vote or create payload action based on payload scoring */
  protected async getProposePayloadActions(slotNumber: bigint): Promise<ProposerSlashAction[]> {
    // Compute what round we are in based on the slot number
    const { round, votingSlot } = this.roundMonitor.getRoundForSlot(slotNumber);
    const { slashingRoundSize: roundSize, slashingQuorumSize: quorumSize } = this.settings;
    const logData = { round, votingSlot, slotNumber };

    // If override payload is active, vote for it
    if (this.overridePayloadActive && this.config.slashOverridePayload && !this.config.slashOverridePayload.isZero()) {
      this.log.info(`Overriding slash payload to ${this.config.slashOverridePayload.toString()}`, logData);
      return [{ type: 'vote-empire-payload', payload: this.config.slashOverridePayload }];
    }

    // Check if there is a payload that has already won, if so, no need to do anything
    const existingPayloads = await this.payloadsStore.getPayloadsForRound(round);
    const winningPayload = existingPayloads.find(p => p.votes >= quorumSize);
    if (winningPayload) {
      this.log.verbose(`No need to vote as payload ${winningPayload.address} has already won`, logData);
      return [];
    }

    // Check if we should create a new payload at this stage
    // We define an initial "nomination phase" at the beginning, which depends on the number of votes needed,
    // and only allow for new proposals to be created then. This ensures that no payloads are created that will
    // not be able to pass. The invariant here is that a payload can be created only if there are enough slots
    // left such that if half of the remaining votes are cast for it, then it will be able to pass.
    const nominationPhaseDurationInSlots = BigInt(Math.floor((roundSize - quorumSize) / 2));

    // Create our ideal payload from the pending offenses we have in store
    let idealPayload: Pick<SlashPayloadRound, 'slashes' | 'votes' | 'address'> | undefined = undefined;
    if (votingSlot <= nominationPhaseDurationInSlots) {
      const idealOffenses = await this.gatherOffensesForRound(round);
      idealPayload =
        idealOffenses.length === 0
          ? undefined
          : { slashes: offensesToValidatorSlash(idealOffenses), votes: 0n, address: EthAddress.ZERO };
      this.log.debug(`Collected offenses for ideal payload for round ${round}`, { ...logData, idealOffenses });
    } else {
      this.log.debug(`Past nomination phase, will not create new payloads for round ${round}`, logData);
    }

    // Find the best existing payload. We filter out those that have no chance of winning given how many voting
    // slots are left in the round, and then filter by those we agree with.
    const feasiblePayloads = existingPayloads.filter(
      p => BigInt(quorumSize) - p.votes <= BigInt(roundSize) - votingSlot,
    );
    const requiredOffenses = await this.getPendingUncontroversialOffensesForRound(round);
    const agreedPayloads = await filterAsync(feasiblePayloads, p => this.agreeWithPayload(p, round, requiredOffenses));
    const bestPayload = maxBy([...agreedPayloads, idealPayload], p => (p ? this.calculatePayloadScore(p) : 0));

    // Debug all payloads info
    if (this.log.isLevelEnabled('debug')) {
      this.log.debug(`Scored payloads for round ${round}`, {
        ...logData,
        idealPayload,
        existingPayloads: existingPayloads.map(p => ({
          ...pick(p, 'address', 'votes', 'round', 'timestamp'),
          score: this.calculatePayloadScore(p),
        })),
        feasiblePayloads: feasiblePayloads.map(p => ({
          ...pick(p, 'address', 'votes', 'round', 'timestamp'),
          score: this.calculatePayloadScore(p),
        })),
        agreedPayloads: agreedPayloads.map(p => ({
          ...pick(p, 'address', 'votes', 'round', 'timestamp'),
          score: this.calculatePayloadScore(p),
        })),
      });
    }

    if (bestPayload === undefined || this.calculatePayloadScore(bestPayload) === 0n) {
      // No payloads to vote for, do nothing
      this.log.verbose(`No suitable slash payloads to vote for in round ${round}`, {
        ...logData,
        existingPayloadsCount: existingPayloads.length,
        feasiblePayloadsCount: feasiblePayloads.length,
        agreedPayloadsCount: agreedPayloads.length,
        idealPayloadSlashesCount: idealPayload?.slashes.length,
      });
      return [];
    } else if (bestPayload === idealPayload) {
      // If our ideal payload is the best, we create it (if not deployed yet) and vote for it
      const { address, isDeployed } = await this.slashFactoryContract.getAddressAndIsDeployed(idealPayload.slashes);
      this.log.info(`Proposing and voting for payload ${address.toString()} in round ${round}`, {
        ...logData,
        payload: bestPayload,
      });
      const createAction: ProposerSlashAction | undefined = isDeployed
        ? undefined
        : { type: 'create-empire-payload', data: idealPayload.slashes };
      const voteAction: ProposerSlashAction = { type: 'vote-empire-payload', payload: address };
      return compactArray<ProposerSlashAction>([createAction, voteAction]);
    } else {
      // Otherwise, vote for our favorite payload
      this.log.info(`Voting for existing payload ${bestPayload.address.toString()} in round ${round}`, {
        ...logData,
        payload: bestPayload,
      });
      return [{ type: 'vote-empire-payload', payload: bestPayload.address }];
    }
  }

  /**
   * Check if we agree with a payload:
   * - We must agree with every offense in the payload
   * - All uncontroversial offenses from past rounds must be included
   * - Payload must be below maximum size
   * - Slash amounts must be within acceptable ranges
   */
  protected async agreeWithPayload(
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
        const offense: OffenseIdentifier = { validator: slash.validator, offenseType, epochOrSlot };
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
      cachedUncontroversialOffenses ?? (await this.getPendingUncontroversialOffensesForRound(round));
    for (const requiredOffense of uncontroversialOffenses) {
      const validatorOffenses = payload.slashes
        .filter(slash => slash.validator.equals(requiredOffense.validator))
        .flatMap(slash => slash.offenses);
      if (
        !validatorOffenses.some(
          o => o.offenseType === requiredOffense.offenseType && o.epochOrSlot === requiredOffense.epochOrSlot,
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
   * Returns whether the given offense can be included in the given round.
   * Depends on the offense round range and whether we include offenses from past rounds.
   */
  private isOffenseForRound(offense: OffenseIdentifier, round: bigint): boolean {
    const [minRound, maxRound] = this.getRoundRangeForOffense(offense);
    const match = round >= minRound && round <= maxRound;
    this.log.trace(
      `Offense ${offense.offenseType} for ${offense.validator} ${match ? 'is' : 'is not'} for round ${round}`,
      { minRound, maxRound, round, offense },
    );
    return match;
  }

  /**
   * Returns the range (inclusive) of rounds in which we could expect an offense to be found.
   * Lower bound is determined by all offenses that should have been captured before the start of a round,
   * which depends on the offense type (eg INACTIVITY is captured once an epoch ends, DATA_WITHHOLDING is
   * captured after the epoch proof submission window for the epoch for which the data was withheld).
   * Upper bound is determined by the expiration rounds for an offense, which is a config setting.
   */
  private getRoundRangeForOffense(offense: OffenseIdentifier): [bigint, bigint] {
    const minRound = getFirstEligibleRoundForOffense(offense, this.settings);
    return [minRound, minRound + BigInt(this.config.slashOffenseExpirationRounds)];
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

  /** Get minimum acceptable amount for an offense type */
  private getMinAmountForOffense(offense: OffenseType): bigint {
    return (getPenaltyForOffense(offense, this.config) * BigInt(this.config.slashMinPenaltyPercentage * 1000)) / 1000n;
  }

  /** Get maximum acceptable amount for an offense type */
  private getMaxAmountForOffense(offense: OffenseType): bigint {
    return (getPenaltyForOffense(offense, this.config) * BigInt(this.config.slashMaxPenaltyPercentage * 1000)) / 1000n;
  }
}
