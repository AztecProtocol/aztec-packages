import { EthAddress } from '@aztec/aztec.js';
import type { EpochCache } from '@aztec/epoch-cache';
import { RollupContract, SlasherContract, TallySlashingProposerContract } from '@aztec/ethereum/contracts';
import { maxBigint } from '@aztec/foundation/bigint';
import { compactArray, partition, times } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import type { DateProvider } from '@aztec/foundation/timer';
import type { Prettify } from '@aztec/foundation/types';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';
import {
  type Offense,
  OffenseType,
  type ProposerSlashAction,
  type ProposerSlashActionProvider,
  type SlashPayloadRound,
  getEpochsForRound,
  getSlashConsensusVotesFromOffenses,
} from '@aztec/stdlib/slashing';

import type { Hex } from 'viem';

import {
  SlashOffensesCollector,
  type SlashOffensesCollectorConfig,
  type SlashOffensesCollectorSettings,
} from './slash_offenses_collector.js';
import { SlashRoundMonitor, type SlashRoundMonitorSettings } from './slash_round_monitor.js';
import type { SlasherClientInterface } from './slasher_client_interface.js';
import type { SlasherOffensesStore } from './stores/offenses_store.js';
import type { Watcher } from './watcher.js';

/** Settings used in the tally slasher client, loaded from the L1 contracts during initialization */
export type TallySlasherSettings = Prettify<
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

export type TallySlasherClientConfig = SlashOffensesCollectorConfig &
  Pick<SlasherConfig, 'slashValidatorsAlways' | 'slashValidatorsNever' | 'slashExecuteRoundsLookBack'>;

/**
 * The Tally Slasher client is responsible for managing slashable offenses using
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
 *
 * Differences from Empire model
 * - No fixed slash payloads - votes are for individual validator offenses encoded in bytes
 * - The L1 contract determines which offenses reach quorum rather than nodes agreeing on a payload
 * - Proposers vote directly on which validators to slash and by how much
 * - Uses a slash offset to vote on validators from past rounds (e.g., round N votes on round N-2)
 */
export class TallySlasherClient implements ProposerSlashActionProvider, SlasherClientInterface {
  protected unwatchCallbacks: (() => void)[] = [];
  protected roundMonitor: SlashRoundMonitor;
  protected offensesCollector: SlashOffensesCollector;

  constructor(
    private config: TallySlasherClientConfig,
    private settings: TallySlasherSettings,
    private tallySlashingProposer: TallySlashingProposerContract,
    private slasher: SlasherContract,
    private rollup: RollupContract,
    watchers: Watcher[],
    private epochCache: EpochCache,
    private dateProvider: DateProvider,
    private offensesStore: SlasherOffensesStore,
    private log = createLogger('slasher:consensus'),
  ) {
    this.roundMonitor = new SlashRoundMonitor(settings, dateProvider);
    this.offensesCollector = new SlashOffensesCollector(config, settings, watchers, offensesStore);
  }

  public async start() {
    this.log.debug('Starting Tally Slasher client...');

    this.roundMonitor.start();
    await this.offensesCollector.start();

    // Listen for RoundExecuted events
    this.unwatchCallbacks.push(
      this.tallySlashingProposer.listenToRoundExecuted(
        ({ round, slashCount, l1BlockHash }) =>
          void this.handleRoundExecuted(round, slashCount, l1BlockHash).catch(err =>
            this.log.error('Error handling round executed', err),
          ),
      ),
    );

    // Check for round changes
    this.unwatchCallbacks.push(this.roundMonitor.listenToNewRound(round => this.handleNewRound(round)));

    this.log.info(`Started tally slasher client`);
    return Promise.resolve();
  }

  /**
   * Stop the tally slasher client
   */
  public async stop() {
    this.log.debug('Stopping Tally Slasher client...');

    for (const unwatchCallback of this.unwatchCallbacks) {
      unwatchCallback();
    }

    this.roundMonitor.stop();
    await this.offensesCollector.stop();

    // Sleeping to sidestep viem issue with unwatching events
    await sleep(2000);
    this.log.info('Tally Slasher client stopped');
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
    this.log.info(`Starting new tally slashing round ${round}`);
    await this.offensesCollector.handleNewRound(round);
  }

  /** Called when we see a RoundExecuted event on the TallySlashingProposer (just for logging). */
  protected async handleRoundExecuted(round: bigint, slashCount: bigint, l1BlockHash: Hex) {
    const slashes = await this.rollup.getSlashEvents(l1BlockHash);
    this.log.info(`Slashing round ${round} has been executed with ${slashCount} slashes`, { slashes });
  }

  /**
   * Get the actions the proposer should take for slashing
   * @param slotNumber - The current slot number
   * @returns The actions to take
   */
  public async getProposerActions(slotNumber: bigint): Promise<ProposerSlashAction[]> {
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
  protected async getExecuteSlashAction(slotNumber: bigint): Promise<ProposerSlashAction | undefined> {
    const { round: currentRound } = this.roundMonitor.getRoundForSlot(slotNumber);
    const slashingExecutionDelayInRounds = BigInt(this.settings.slashingExecutionDelayInRounds);
    const executableRound = currentRound - slashingExecutionDelayInRounds - 1n;
    const lookBack = BigInt(this.config.slashExecuteRoundsLookBack);
    const oldestExecutableRound = maxBigint(0n, executableRound - lookBack);

    // Check if slashing is enabled at all
    if (!(await this.slasher.isSlashingEnabled())) {
      this.log.warn(`Slashing is disabled in the Slasher contract (skipping execution)`);
      return undefined;
    }

    this.log.debug(`Checking slashing rounds ${oldestExecutableRound} to ${executableRound} to execute`, {
      slotNumber,
      currentRound,
      oldestExecutableRound,
      executableRound,
      slashingExecutionDelayInRounds,
      lookBack,
      slashingLifetimeInRounds: this.settings.slashingLifetimeInRounds,
    });

    // Iterate over all rounds, starting from the oldest, until we find one that is executable
    for (let roundToCheck = oldestExecutableRound; roundToCheck <= executableRound; roundToCheck++) {
      const action = await this.tryGetRoundExecuteAction(roundToCheck);
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
   */
  private async tryGetRoundExecuteAction(executableRound: bigint): Promise<ProposerSlashAction | undefined> {
    let logData: Record<string, unknown> = { executableRound };
    this.log.debug(`Testing if slashing round ${executableRound} is executable`, logData);

    try {
      // Note we do not check isReadyToExecute here, since we already know that based on the
      // executableRound number. Not just that, but it may be that we are building for the given slot number
      // that is in the future, so the contract may think it's not yet ready to execute, whereas it is.
      const roundInfo = await this.tallySlashingProposer.getRound(executableRound);
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

      // Check if the round yields any slashing at all
      const { actions: slashActions, committees } = await this.tallySlashingProposer.getTally(executableRound);
      if (slashActions.length === 0) {
        this.log.verbose(`Round ${executableRound} does not resolve in any slashing`, logData);
        return undefined;
      }

      // Check if the slash payload is vetoed
      const payload = await this.tallySlashingProposer.getPayload(executableRound);
      const isVetoed = await this.slasher.isPayloadVetoed(payload.address);
      if (isVetoed) {
        this.log.warn(`Round ${executableRound} payload is vetoed (skipping execution)`, {
          payloadAddress: payload.address.toString(),
          ...logData,
        });
        return undefined;
      }

      this.log.info(`Round ${executableRound} is ready to execute with ${slashActions.length} slashes`, {
        slashActions,
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
  protected async getVoteOffensesAction(slotNumber: bigint): Promise<ProposerSlashAction | undefined> {
    // Compute what round we are in based on the slot number and what round will be slashed
    const { round: currentRound } = this.roundMonitor.getRoundForSlot(slotNumber);
    const slashedRound = this.getSlashedRound(currentRound);
    if (slashedRound < 0n) {
      return undefined;
    }

    // Compute offenses to slash, by loading the offenses for this round, adding synthetic offenses
    // for validators that should always be slashed, and removing the ones that should never be slashed.
    const offensesForRound = await this.gatherOffensesForRound(currentRound);
    const offensesFromAlwaysSlash = (this.config.slashValidatorsAlways ?? []).map(validator => ({
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
        offensesToForgive,
        slashValidatorsAlways: this.config.slashValidatorsAlways,
      });
    }

    if (offensesToForgive.length > 0) {
      this.log.verbose(`Skipping slashing of ${offensesToForgive.length} offenses`, {
        slotNumber,
        currentRound,
        slashedRound,
        offensesToForgive,
        slashValidatorsNever: this.config.slashValidatorsNever,
      });
    }

    if (offensesToSlash.length === 0) {
      this.log.debug(`No offenses to slash for round ${slashedRound}`, { currentRound, slotNumber, slashedRound });
      return undefined;
    }

    this.log.info(`Voting to slash ${offensesToSlash.length} offenses`, {
      slotNumber,
      currentRound,
      slashedRound,
      offensesToSlash,
    });

    const committees = await this.collectCommitteesActiveDuringRound(slashedRound);
    const epochsForCommittees = getEpochsForRound(slashedRound, this.settings);
    const votes = getSlashConsensusVotesFromOffenses(offensesToSlash, committees, epochsForCommittees, this.settings);
    if (votes.every(v => v === 0)) {
      this.log.warn(`Computed votes for offenses are all zero. Skipping vote.`, {
        slotNumber,
        currentRound,
        slashedRound,
        offensesToSlash,
        committees,
      });
      return undefined;
    }

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
   * Get slash payloads is NOT SUPPORTED in tally model
   * @throws Error indicating this operation is not supported
   */
  public getSlashPayloads(): Promise<SlashPayloadRound[]> {
    return Promise.reject(new Error('Tally slashing model does not support slash payloads'));
  }

  /**
   * Gather offenses to be slashed on a given round.
   * In tally slashing, round N slashes validators from round N - slashOffsetInRounds.
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

  /** Returns all pending offenses stored */
  public getPendingOffenses(): Promise<Offense[]> {
    return this.offensesStore.getPendingOffenses();
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
