import { EthAddress } from '@aztec/aztec.js/addresses';
import type { EpochCache } from '@aztec/epoch-cache';
import { RollupContract, type SlashVote, SlasherContract, SlashingProposerContract } from '@aztec/ethereum/contracts';
import { maxBigint } from '@aztec/foundation/bigint';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { compactArray, partition, times } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
import type { DateProvider } from '@aztec/foundation/timer';
import type { Prettify } from '@aztec/foundation/types';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';
import {
  type Offense,
  OffenseType,
  type ProposerSlashAction,
  type ProposerSlashActionProvider,
  getEpochsForRound,
  getOffenseTypeName,
  getSlashConsensusVotesFromOffenses,
} from '@aztec/stdlib/slashing';
import { getTelemetryClient } from '@aztec/telemetry-client';

import type { Hex } from 'viem';

import { SlasherMetrics } from './metrics.js';
import {
  SlashOffensesCollector,
  type SlashOffensesCollectorConfig,
  type SlashOffensesCollectorSettings,
} from './slash_offenses_collector.js';
import { SlashRoundMonitor, type SlashRoundMonitorSettings } from './slash_round_monitor.js';
import type { SlasherClientInterface } from './slasher_client_interface.js';
import type { SlasherOffensesStore } from './stores/offenses_store.js';
import type { Watcher } from './watcher.js';

/** Settings used in the slasher client, loaded from the L1 contracts during initialization */
export type SlasherSettings = Prettify<
  SlashRoundMonitorSettings &
    SlashOffensesCollectorSettings & {
      slashingLifetimeInRounds: number;
      slashingExecutionDelayInRounds: number;
      slashingRoundSizeInEpochs: number;
      slashingOffsetInRounds: number;
      slashingQuorumSize: number;
      slashingAmounts: [bigint, bigint, bigint];
      /** Committee size for block proposal */
      targetCommitteeSize: number;
    }
>;

export type SlasherClientConfig = SlashOffensesCollectorConfig &
  Pick<
    SlasherConfig,
    'slashValidatorsAlways' | 'slashValidatorsNever' | 'slashExecuteRoundsLookBack' | 'slashMaxPayloadSize'
  >;

type AlwaysSlashOffense = {
  validator: EthAddress;
  amount: bigint;
  offenseType: OffenseType.UNKNOWN;
};

type SlashVoteOffense = Offense | AlwaysSlashOffense;

/**
 * The Slasher client is responsible for managing slashable offenses using
 * the consensus-based slashing model where proposers vote on individual validator offenses.
 *
 * The client subscribes to several slash watchers that emit offenses and tracks them. When the slasher is the
 * proposer, it votes for which validators from past epochs should be slashed based on collected offenses.
 * Voting is handled by the sequencer publisher, the slasher client does not interact with L1 directly.
 * The client also monitors rounds and executes slashing when rounds become executable after reaching quorum.
 *
 * Voting and offense collection
 * - Time is divided into rounds (ROUND_SIZE slots each). During each round, block proposers can submit votes
 * indicating which validators from SLASH_OFFSET_IN_ROUNDS rounds ago should be slashed.
 * - Votes are encoded as bytes where each validator's vote is represented by 2 bits indicating the slash amount (0-3 slash units)
 * for the validator in the committee being slashed.
 * - When gathering offenses for round N, the system looks at offenses from round N-2 (where 2 is the hardcoded
 * offset), giving time to detect offenses and vote on them in a later round.
 * - Each offense carries an epoch or block identifier to differentiate multiple offenses by the same validator.
 *
 * Quorum and execution
 * - After a round ends, there is an execution delay period for review so the VETOER in the Slasher can veto
 * if needed.
 * - Once the delay passes, anyone can call executeRound() to tally votes and execute slashing.
 * - Validators that reach the quorum threshold are slashed. A vote for slashing N units is also considered
 * a vote for slashing N-1, N-2, ..., 1 units. The system slashes for the largest amount that reaches quorum.
 * - The client monitors executable rounds and triggers execution when appropriate.
 */
export class SlasherClient implements ProposerSlashActionProvider, SlasherClientInterface {
  protected unwatchCallbacks: (() => void)[] = [];
  protected roundMonitor: SlashRoundMonitor;
  protected offensesCollector: SlashOffensesCollector;
  /**
   * Slashing votes cast during a single round against committee positions held by the node's own validators, keyed
   * by the position's index in the round's flattened slash target committees. The contract tallies quorum per
   * position, and a validator sitting in several of the round's committees holds several independent positions.
   * A vote is only ever cast for the round current at the time, so only one round is ever tracked.
   */
  private ownValidatorVotes: { round: bigint; countByPosition: Map<number, number> } = {
    round: -1n,
    countByPosition: new Map(),
  };

  constructor(
    private config: SlasherClientConfig,
    private settings: SlasherSettings,
    private slashingProposer: SlashingProposerContract,
    private slasher: SlasherContract,
    private rollup: RollupContract,
    watchers: Watcher[],
    private epochCache: EpochCache,
    private dateProvider: DateProvider,
    private offensesStore: SlasherOffensesStore,
    private readonly ownValidators: EthAddress[] = [],
    private log = createLogger('slasher:consensus'),
    private readonly metrics = new SlasherMetrics(getTelemetryClient()),
  ) {
    this.roundMonitor = new SlashRoundMonitor(settings, dateProvider);
    this.offensesCollector = new SlashOffensesCollector(config, settings, watchers, offensesStore);
  }

  public async start() {
    this.log.debug('Starting slasher client...');

    await this.offensesCollector.start();

    // Check for round changes. Registered before the monitor starts so a round boundary crossed while the seed
    // below is awaiting L1 is announced rather than silently swallowed.
    this.unwatchCallbacks.push(this.roundMonitor.listenToNewRound(round => this.handleNewRound(round)));
    this.roundMonitor.start();

    // Listen for RoundExecuted events
    this.unwatchCallbacks.push(
      this.slashingProposer.listenToRoundExecuted(
        ({ round, slashCount, l1BlockHash }) =>
          void this.handleRoundExecuted(round, slashCount, l1BlockHash).catch(err =>
            this.log.error('Error handling round executed', err),
          ),
      ),
    );

    // Listen for VoteCast events to warn early when a vote names one of our own validators as a slash target
    if (this.ownValidators.length > 0) {
      this.metrics.recordQuorumSize(this.settings.slashingQuorumSize);
      // Seeded before subscribing so no vote is counted by both the seed and the subscription. Votes landing
      // between the seed's reads and the subscription attaching are missed; the tally is best-effort.
      await this.seedOwnValidatorVotes();
      this.unwatchCallbacks.push(
        this.slashingProposer.listenToVoteCast(
          ({ round, slot, proposer }) =>
            void this.handleVoteCast(round, slot, proposer).catch(err =>
              this.log.error('Error handling vote cast', err),
            ),
        ),
      );
    }

    this.log.info(`Started slasher client`);
    return Promise.resolve();
  }

  /** Stop the slasher client */
  public async stop() {
    this.log.debug('Stopping slasher client...');

    for (const unwatchCallback of this.unwatchCallbacks) {
      unwatchCallback();
    }

    this.roundMonitor.stop();
    await this.offensesCollector.stop();

    this.log.info('Slasher client stopped');
  }

  /** Returns the current config */
  public getConfig(): SlasherConfig {
    return this.config as SlasherConfig;
  }

  /** Update the config of the slasher client */
  public updateConfig(config: Partial<SlasherConfig>) {
    this.config = { ...this.config, ...config };
  }

  /** Triggered on a time basis when we enter a new slashing round. Clears expired offenses. */
  protected async handleNewRound(round: bigint) {
    this.log.info(`Starting new slashing round ${round}`);
    // Strictly greater so the clock catching up to a round a vote event already rolled to cannot wipe the tally,
    // and gated on own validators so nodes running none do not emit a meaningless gauge.
    if (this.ownValidators.length > 0 && round > this.ownValidatorVotes.round) {
      this.rollOwnValidatorVotesTo(round);
    }
    await this.offensesCollector.handleNewRound(round);
  }

  /** Called when we see a RoundExecuted event on the SlashingProposer (just for logging and metrics). */
  protected async handleRoundExecuted(round: bigint, slashCount: bigint, l1BlockHash: Hex) {
    this.metrics.recordRoundExecuted();
    const slashes = await this.rollup.getSlashEvents(l1BlockHash);
    this.log.info(`Slashing round ${round} has been executed with ${slashCount} slashes`, { slashes });

    for (const { attester, amount } of slashes.filter(slash => this.isOwnValidator(slash.attester))) {
      this.log.warn(`Own validator ${attester} was slashed for ${amount}`, {
        round,
        validator: attester.toString(),
        amount,
        l1BlockHash,
      });
      this.metrics.recordOwnValidatorSlashed(amount);
    }
  }

  /** Called when we see a VoteCast event. Warns for every vote that names one of our own validators. */
  protected async handleVoteCast(round: bigint, slot: SlotNumber, proposer: string) {
    const votes = await this.slashingProposer.getLastVote(round);
    this.countVotesAgainstOwnValidators(round, votes, { slot, proposer });
  }

  /**
   * Reads the votes already cast in the current round so the tally survives a restart mid-round. Without this a
   * node restarted partway through a round would report a tally near zero for the rest of it, and never warn.
   */
  private async seedOwnValidatorVotes() {
    const { round } = this.roundMonitor.getCurrentRound();
    try {
      const votes = await this.slashingProposer.getVotesForRound(round);
      // The round monitor may have rolled the tally past this round while the votes were being read
      if (round > this.ownValidatorVotes.round) {
        this.rollOwnValidatorVotesTo(round);
      }
      for (const vote of votes) {
        this.countVotesAgainstOwnValidators(round, vote);
      }
    } catch (error) {
      // A node starting up with no votes yet in the round, or an L1 read failure, must not block the slasher
      this.log.warn(`Could not seed slashing votes for round ${round}`, { round, error });
    }
  }

  /** Adds a vote's slash targets to the current round tally, warning for each of the node's own validators named. */
  private countVotesAgainstOwnValidators(
    round: bigint,
    votes: SlashVote,
    logContext?: { slot: SlotNumber; proposer: string },
  ) {
    if (round < this.ownValidatorVotes.round) {
      return; // A vote from a round that has already closed, which can no longer reach quorum
    }
    if (round > this.ownValidatorVotes.round) {
      this.rollOwnValidatorVotesTo(round);
    }

    // The contract tallies quorum per committee position, so the tally is kept per position, but the warning and
    // the targeted metric are per (vote, validator) — reporting a validator once at its highest position tally —
    // since an operator cares about the validator, not which of its committee seats is being voted on.
    const { countByPosition } = this.ownValidatorVotes;
    const targeted = new Map<string, { validator: EthAddress; slashAmount: bigint; votes: number }>();
    for (const { validator, slashAmount, position } of votes.filter(vote => this.isOwnValidator(vote.validator))) {
      const count = (countByPosition.get(position) ?? 0) + 1;
      countByPosition.set(position, count);
      const entry = targeted.get(validator.toString());
      if (!entry || count > entry.votes) {
        targeted.set(validator.toString(), { validator, slashAmount, votes: count });
      }
    }

    const quorum = this.settings.slashingQuorumSize;
    for (const { validator, slashAmount, votes: count } of targeted.values()) {
      this.metrics.recordOwnValidatorTargeted();

      // Seeded votes are replayed from L1 rather than observed live, so they carry no event context to log
      if (logContext) {
        this.log.warn(
          `Own validator ${validator} targeted by slashing vote (${count} of ${quorum} votes needed to slash)`,
          { round, validator: validator.toString(), votes: count, quorum, slashAmount, ...logContext },
        );
      }
    }

    this.metrics.recordCurrentRoundVotesMax(Math.max(0, ...countByPosition.values()));
  }

  /** Starts a fresh tally for a round, zeroing the gauge so a quiet round does not leave the previous one's value. */
  private rollOwnValidatorVotesTo(round: bigint) {
    this.ownValidatorVotes = { round, countByPosition: new Map() };
    this.metrics.recordCurrentRoundVotesMax(0);
  }

  private isOwnValidator(address: EthAddress): boolean {
    return this.ownValidators.some(validator => validator.equals(address));
  }

  /**
   * Get the actions the proposer should take for slashing
   * @param slotNumber - The current slot number
   * @returns The actions to take
   */
  public async getProposerActions(slotNumber: SlotNumber): Promise<ProposerSlashAction[]> {
    const [executeAction, voteAction] = await Promise.all([
      this.getExecuteSlashAction(slotNumber),
      this.getVoteOffensesAction(slotNumber),
    ]);

    return compactArray<ProposerSlashAction>([executeAction, voteAction]);
  }

  /**
   * Returns an execute slash action if there are any rounds ready to be executed.
   * Returns the oldest slash action if there are multiple rounds pending execution.
   */
  protected async getExecuteSlashAction(slotNumber: SlotNumber): Promise<ProposerSlashAction | undefined> {
    const { round: currentRound } = this.roundMonitor.getRoundForSlot(slotNumber);
    const slashingExecutionDelayInRounds = BigInt(this.settings.slashingExecutionDelayInRounds);
    const executableRound = currentRound - slashingExecutionDelayInRounds - 1n;
    const lookBack = BigInt(this.config.slashExecuteRoundsLookBack);
    const slashingLifetimeInRounds = BigInt(this.settings.slashingLifetimeInRounds);

    // Compute the oldest executable round considering both lookBack and lifetimeInRounds
    // A round is only executable if currentRound <= round + lifetimeInRounds
    // So the oldest round we can execute is: currentRound - lifetimeInRounds
    const oldestByLifetime = maxBigint(0n, currentRound - slashingLifetimeInRounds);
    const oldestByLookBack = maxBigint(0n, executableRound - lookBack);
    const oldestExecutableRound = maxBigint(oldestByLifetime, oldestByLookBack);

    // Check if slashing is enabled at all
    if (!(await this.slasher.isSlashingEnabled())) {
      this.log.warn(`Slashing is disabled in the Slasher contract (skipping execution)`);
      return undefined;
    }

    this.log.debug(`Checking slashing rounds ${oldestExecutableRound} to ${executableRound} to execute`, {
      slotNumber,
      currentRound,
      oldestExecutableRound,
      oldestByLifetime,
      oldestByLookBack,
      executableRound,
      slashingExecutionDelayInRounds,
      lookBack,
      slashingLifetimeInRounds,
    });

    // Iterate over all rounds, starting from the oldest, until we find one that is executable
    for (let roundToCheck = oldestExecutableRound; roundToCheck <= executableRound; roundToCheck++) {
      const action = await this.tryGetRoundExecuteAction(roundToCheck, slotNumber);
      if (action) {
        return action;
      }
    }

    // And return nothing if none are found
    return undefined;
  }

  /**
   * Checks if a given round is executable and returns an execute-slash action for it if so.
   * Assumes round number has already been checked against lifetime and execution delay.
   * @param executableRound - The round to check for execution
   */
  private async tryGetRoundExecuteAction(
    executableRound: bigint,
    slotNumber: SlotNumber,
  ): Promise<ProposerSlashAction | undefined> {
    let logData: Record<string, unknown> = { executableRound, slotNumber };
    this.log.debug(`Testing if slashing round ${executableRound} is executable`, logData);

    try {
      const roundInfo = await this.slashingProposer.getRound(executableRound);
      logData = { ...logData, roundInfo };
      if (roundInfo.isExecuted) {
        this.log.verbose(`Round ${executableRound} has already been executed`, logData);
        return undefined;
      } else if (roundInfo.voteCount === 0n) {
        this.log.debug(`Round ${executableRound} received no votes`, logData);
        return undefined;
      } else if (roundInfo.voteCount < this.settings.slashingQuorumSize) {
        this.log.verbose(`Round ${executableRound} does not have enough votes to execute`, logData);
        return undefined;
      }

      // Check if round is ready to execute at the given slot
      const isReadyToExecute = await this.slashingProposer.isRoundReadyToExecute(executableRound, slotNumber);
      if (!isReadyToExecute) {
        this.log.warn(
          `Round ${executableRound} is not ready to execute at slot ${slotNumber} according to contract check`,
          logData,
        );
        return undefined;
      }

      // Check if the round yields any slashing at all
      const { actions: slashActions, committees } = await this.slashingProposer.getTally(executableRound);
      if (slashActions.length === 0) {
        this.log.verbose(`Round ${executableRound} does not resolve in any slashing`, logData);
        return undefined;
      }

      // Check if the slash payload is vetoed
      const payload = await this.slashingProposer.getPayload(executableRound);
      const isVetoed = await this.slasher.isPayloadVetoed(payload.address);
      if (isVetoed) {
        this.log.warn(`Round ${executableRound} payload is vetoed (skipping execution)`, {
          payloadAddress: payload.address.toString(),
          ...logData,
        });
        return undefined;
      }

      const slashActionsWithAmounts = slashActions.map(action => ({
        validator: action.validator.toString(),
        slashAmount: action.slashAmount.toString(),
      }));
      this.log.info(`Round ${executableRound} is ready to execute with ${slashActions.length} slashes`, {
        slashActions: slashActionsWithAmounts,
        payloadAddress: payload.address.toString(),
        ...logData,
      });

      // We only need to post committees that are actually slashed
      const slashedCommittees = committees.map(c =>
        c.some(validator => slashActions.some(action => action.validator.equals(validator))) ? c : [],
      );
      this.log.debug(`Collected ${committees.length} committees for executing round ${executableRound}`, {
        slashedCommittees,
        ...logData,
      });
      return { type: 'execute-slash', round: executableRound, committees: slashedCommittees };
    } catch (error) {
      this.log.error(`Error checking round to execute ${executableRound}`, error);
      return undefined;
    }
  }

  /** Returns a vote action based on offenses from the target round (with offset applied) */
  protected async getVoteOffensesAction(slotNumber: SlotNumber): Promise<ProposerSlashAction | undefined> {
    // Compute what round we are in based on the slot number and what round will be slashed
    const { round: currentRound } = this.roundMonitor.getRoundForSlot(slotNumber);
    const slashedRound = this.getSlashedRound(currentRound);
    if (slashedRound < 0n) {
      return undefined;
    }

    // Compute offenses to slash, by loading the offenses for this round, adding synthetic offenses
    // for validators that should always be slashed, and removing the ones that should never be slashed.
    const offensesForRound = await this.gatherOffensesForRound(currentRound);
    const offensesFromAlwaysSlash: AlwaysSlashOffense[] = (this.config.slashValidatorsAlways ?? []).map(validator => ({
      validator,
      amount: this.settings.slashingAmounts[2],
      offenseType: OffenseType.UNKNOWN,
    }));
    const [offensesToForgive, offensesToSlash] = partition([...offensesForRound, ...offensesFromAlwaysSlash], offense =>
      this.config.slashValidatorsNever?.some(v => v.equals(offense.validator)),
    );

    if (offensesFromAlwaysSlash.length > 0) {
      this.log.verbose(`Slashing ${offensesFromAlwaysSlash.length} validators due to always-slash config`, {
        slotNumber,
        currentRound,
        slashedRound,
        offensesFromAlwaysSlash: offensesFromAlwaysSlash.map(getOffenseLogData),
        slashValidatorsAlways: this.config.slashValidatorsAlways,
      });
    }

    if (offensesToForgive.length > 0) {
      this.log.verbose(`Skipping slashing of ${offensesToForgive.length} offenses`, {
        slotNumber,
        currentRound,
        slashedRound,
        offensesToForgive: offensesToForgive.map(getOffenseLogData),
        slashValidatorsNever: this.config.slashValidatorsNever,
      });
    }

    if (offensesToSlash.length === 0) {
      this.log.debug(`No offenses to slash for round ${slashedRound}`, { currentRound, slotNumber, slashedRound });
      return undefined;
    }

    this.log.debug(`Computing slash votes for ${offensesToSlash.length} offenses`, {
      slotNumber,
      currentRound,
      slashedRound,
      offensesToSlash: offensesToSlash.map(getOffenseLogData),
    });

    const committees = await this.collectCommitteesActiveDuringRound(slashedRound);
    const epochsForCommittees = getEpochsForRound(slashedRound, this.settings);
    const { slashMaxPayloadSize } = this.config;
    const votes = getSlashConsensusVotesFromOffenses(
      offensesToSlash,
      committees,
      epochsForCommittees.map(e => BigInt(e)),
      { ...this.settings, maxSlashedValidators: slashMaxPayloadSize },
      this.log,
    );
    if (votes.every(v => v === 0)) {
      this.log.warn(`Computed votes for offenses are all zero. Skipping vote.`, {
        slotNumber,
        currentRound,
        slashedRound,
        offensesToSlash: offensesToSlash.map(getOffenseLogData),
        committees,
      });
      return undefined;
    }

    this.log.info(`Voting to slash ${offensesToSlash.length} offenses`, {
      slotNumber,
      slashedRound,
      currentRound,
      votes,
      offensesToSlash: offensesToSlash.map(getOffenseLogData),
    });

    this.log.debug(`Computed votes for slashing ${offensesToSlash.length} offenses`, {
      slashedRound,
      currentRound,
      votes,
      committees,
      settings: this.settings,
    });

    return {
      type: 'vote-offenses',
      round: currentRound,
      votes,
      committees,
    };
  }

  /** Returns the committees that were active during the timespan of a given round */
  private collectCommitteesActiveDuringRound(round: bigint): Promise<EthAddress[][]> {
    const epochsToSlash = getEpochsForRound(round, this.settings);
    const emptyCommittee = times(Number(this.settings.targetCommitteeSize), () => EthAddress.ZERO);
    return Promise.all(
      epochsToSlash.map(epoch => this.epochCache.getCommitteeForEpoch(epoch).then(c => c.committee ?? emptyCommittee)),
    );
  }

  /**
   * Gather offenses to be slashed on a given round.
   * Round N slashes validators from round N - slashOffsetInRounds.
   * @param round - The round to get offenses for, defaults to current round
   * @returns Array of pending offenses for the round with offset applied
   */
  public async gatherOffensesForRound(round?: bigint): Promise<Offense[]> {
    const targetRound = this.getSlashedRound(round);
    if (targetRound < 0n) {
      return [];
    }

    return await this.offensesStore.getOffensesForRound(targetRound);
  }

  /** Returns all offenses stored */
  public getOffenses(): Promise<Offense[]> {
    return this.offensesStore.getOffenses();
  }

  /**
   * Returns the round to be slashed given the current round by applying the slash offset.
   * During round N, we cannot slash the validators from the epochs of the same round, since the round is not over,
   * and besides we would be asking the current validators to vote to slash themselves. So during round N we look at the
   * epochs spanned during round N - SLASH_OFFSET_IN_ROUNDS. This offset means that the epochs we slash are complete,
   * and also gives nodes time to detect any misbehavior (eg slashing for prunes requires the proof submission window to
   * pass).
   */
  private getSlashedRound(round?: bigint) {
    round ??= this.roundMonitor.getCurrentRound().round;
    return round - BigInt(this.settings.slashingOffsetInRounds);
  }
}

function getOffenseLogData(offense: SlashVoteOffense) {
  return {
    ...offense,
    validator: offense.validator.toString(),
    offenseType: getOffenseTypeName(offense.offenseType),
  };
}
