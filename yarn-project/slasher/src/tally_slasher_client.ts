import { EthAddress } from '@aztec/aztec.js';
import type { EpochCache } from '@aztec/epoch-cache';
import { TallySlashingProposerContract } from '@aztec/ethereum/contracts';
import { compactArray, times } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import type { DateProvider } from '@aztec/foundation/timer';
import type { Prettify } from '@aztec/foundation/types';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';
import {
  type Offense,
  type ProposerSlashAction,
  type ProposerSlashActionProvider,
  type SlashPayloadRound,
  getEpochsForRound,
  getSlashConsensusVotesFromOffenses,
} from '@aztec/stdlib/slashing';

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
      slashingUnit: bigint;
      /** Committee size for block proposal */
      targetCommitteeSize: number;
    }
>;

export type TallySlasherClientConfig = SlashOffensesCollectorConfig;

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
      this.tallySlashingProposer.listenToRoundExecuted(({ round, slashCount }) =>
        this.handleRoundExecuted(round, slashCount),
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
  protected handleRoundExecuted(round: bigint, slashCount: bigint) {
    this.log.info(`Slashing round ${round} has been executed with ${slashCount} slashes`);
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

  /** Returns an execute slash action if there are any rounds ready to be executed */
  protected async getExecuteSlashAction(slotNumber: bigint): Promise<ProposerSlashAction | undefined> {
    const { round: currentRound } = this.roundMonitor.getRoundForSlot(slotNumber);
    const slashingExecutionDelayInRounds = BigInt(this.settings.slashingExecutionDelayInRounds);
    const roundToCheck = currentRound - slashingExecutionDelayInRounds - 1n;
    if (roundToCheck < 0n) {
      return undefined;
    }

    try {
      const roundInfo = await this.tallySlashingProposer.getRound(roundToCheck);
      if (roundInfo.isExecuted) {
        this.log.verbose(`Round ${roundToCheck} has already been executed`);
        return undefined;
      } else if (!roundInfo.readyToExecute) {
        this.log.verbose(`Round ${roundToCheck} is not ready to execute yet`);
        return undefined;
      } else if (roundInfo.voteCount < this.settings.slashingQuorumSize) {
        this.log.verbose(`Round ${roundToCheck} does not have enough votes to execute`);
        return undefined;
      }

      const slashActions = await this.tallySlashingProposer.getTally(roundToCheck);
      if (slashActions.length === 0) {
        this.log.verbose(`Round ${roundToCheck} does not resolve in any slashing`);
        return undefined;
      } else {
        this.log.info(`Round ${roundToCheck} is ready to execute with ${slashActions.length} slashes`, {
          slashActions,
        });
        const committees = await this.collectCommitteesActiveDuringRound(this.getSlashedRound(roundToCheck));
        return { type: 'execute-slash', round: roundToCheck, committees };
      }
    } catch (error) {
      this.log.error(`Error checking round to execute ${roundToCheck}`, error);
    }

    return undefined;
  }

  /** Returns a vote action based on offenses from the target round (with offset applied) */
  protected async getVoteOffensesAction(slotNumber: bigint): Promise<ProposerSlashAction | undefined> {
    // Compute what round we are in based on the slot number and what round will be slashed
    const { round: currentRound } = this.roundMonitor.getRoundForSlot(slotNumber);
    const slashedRound = this.getSlashedRound(currentRound);
    if (slashedRound < 0n) {
      return undefined;
    }

    const offensesToSlash = await this.gatherOffensesForRound(currentRound);
    if (offensesToSlash.length === 0) {
      this.log.debug(`No offenses to slash for round ${slashedRound}`, { currentRound, slotNumber, slashedRound });
      return undefined;
    }

    const committees = await this.collectCommitteesActiveDuringRound(slashedRound);

    this.log.info(`Voting to slash ${offensesToSlash.length} offenses`, {
      slotNumber,
      currentRound,
      slashedRound,
      offensesToSlash,
    });

    const votes = getSlashConsensusVotesFromOffenses(offensesToSlash, committees, this.settings);
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
