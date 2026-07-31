import type { SlashVoteTarget, SlashingProposerContract } from '@aztec/ethereum/contracts';
import { uniqueBy } from '@aztec/foundation/collection';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';

import type { Hex } from 'viem';

import type { SlasherMetrics } from './metrics.js';

/**
 * Watches slashing activity that targets the node's own validators: warns and counts on every vote naming one of
 * them, tracks how close the current round's tally is to quorum, and reports executed slashes. Does nothing when
 * the node runs no validators. Lifecycle calls must be sequential: start() before events are wired, and stop()
 * awaited before any restart.
 */
export class OwnValidatorSlashMonitor {
  /**
   * Tally for the single round being tracked (votes are only ever cast for the current round). `nextVoteIndex` is
   * the cursor: the index of the first vote in the round not yet processed, advanced from the indices the VoteCast
   * events carry. It is undefined until the first event of a round that started mid-round, whose own vote is then
   * the first one counted, so votes cast before the node subscribed are never replayed into the cumulative metrics.
   * The tally is per flattened committee position because that is the unit the contract tallies quorum by.
   */
  private state: { round: bigint; nextVoteIndex: bigint | undefined; countByPosition: Map<number, number> } = {
    round: -1n,
    nextVoteIndex: undefined,
    countByPosition: new Map(),
  };

  /**
   * All vote processing runs through this queue, one job at a time in arrival order. Serialization is what makes
   * the cursor sound: without it, concurrent event handlers could process the same index twice or emit warnings
   * with out-of-order running tallies. Replaced on every start(), since a queue that has been ended cannot run
   * jobs again.
   */
  private queue = new SerialQueue();

  private stopped = false;

  constructor(
    private readonly slashingProposer: SlashingProposerContract,
    private readonly settings: { slashingQuorumSize: number },
    private readonly ownValidators: EthAddress[],
    private readonly metrics: SlasherMetrics,
    private readonly log = createLogger('slasher:own-validators'),
  ) {
    this.queue.start();
  }

  private get enabled(): boolean {
    return this.ownValidators.length > 0;
  }

  /**
   * Starts tracking at the given round, leaving the cursor unset so the round's votes already cast are skipped:
   * replaying them would warn about votes the operator can no longer react to sooner, and would double-count
   * cumulative counters across restarts.
   */
  public start(currentRound: bigint): void {
    if (!this.enabled) {
      return;
    }
    this.stopped = false;
    this.queue = new SerialQueue();
    this.queue.start();
    this.state = { round: currentRound, nextVoteIndex: undefined, countByPosition: new Map() };
    this.metrics.recordQuorumSize(this.settings.slashingQuorumSize);
    this.metrics.recordCurrentRoundVotesMax(0);
  }

  /** Stops processing and waits for any in-flight drain, so no warning or metric is emitted after shutdown. */
  public async stop(): Promise<void> {
    this.stopped = true;
    // Jobs already queued are no-ops now that the flag is set, so end() runs through them at no cost while still
    // settling the promises their callers hold, where cancel() would discard them and leave those promises pending.
    await this.queue.end();
  }

  /**
   * Called by the round monitor clock. Strictly greater so the clock catching up to a round an event already rolled
   * to keeps the tally.
   */
  public handleNewRound(round: bigint): void {
    if (this.enabled && round > this.state.round) {
      this.rollTo(round);
    }
  }

  /**
   * Called on each VoteCast event with the index the event carries. Reads every vote from the cursor up to that
   * index, so an event delivery that never arrived is healed by the next one.
   */
  public handleVoteCast(round: bigint, voteIndex: bigint): Promise<void> {
    if (!this.enabled || this.stopped) {
      return Promise.resolve();
    }
    // Errors are logged rather than propagated: callers fire and forget, and a failed read is retried by the drain
    // the next event triggers.
    return this.queue
      .put(() => this.drainVotesTo(round, voteIndex))
      .catch(err => this.log.error('Error processing slashing votes', err));
  }

  /** Reports executed slashes against own validators. Called with the Slashed events already fetched by the client. */
  public handleSlashes(round: bigint, slashes: { attester: EthAddress; amount: bigint }[], l1BlockHash: Hex): void {
    if (!this.enabled || this.stopped) {
      return;
    }
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

  /** Processes votes [cursor, voteIndex] of a round, in order, advancing the cursor after each success. */
  private async drainVotesTo(round: bigint, voteIndex: bigint): Promise<void> {
    if (this.stopped) {
      return; // enqueued before stop() but not yet started: emit nothing and read nothing after shutdown
    }
    if (round < this.state.round) {
      return; // a vote for a round that already closed can no longer reach quorum
    }
    if (round > this.state.round) {
      this.rollTo(round); // the event beat the round-monitor clock to the boundary
    }

    // The first event of a round tracked from mid-round counts its own vote only: earlier ones predate the subscription
    const from = this.state.nextVoteIndex ?? voteIndex;
    if (voteIndex < from) {
      return; // a duplicate or out-of-order delivery of a vote already processed
    }

    for (let index = from; index <= voteIndex; index++) {
      const vote = await this.slashingProposer.getVoteAt(round, index);
      if (this.stopped || round !== this.state.round) {
        return; // stopped, or rolled mid-drain: either way this vote must no longer be counted
      }
      this.processVote(round, vote);
      // Advanced only after successful processing, so a failed read is retried on the next event
      this.state.nextVoteIndex = index + 1n;
    }
  }

  private processVote(round: bigint, vote: SlashVoteTarget[]): void {
    const own = vote.filter(target => this.isOwnValidator(target.validator));
    for (const { position } of own) {
      this.state.countByPosition.set(position, (this.state.countByPosition.get(position) ?? 0) + 1);
    }

    // Warn once per (vote, validator) at the validator's highest position tally: the operator cares about the
    // validator, not which of its committee seats is being voted on. No slash amount (the amount voted is not
    // necessarily the amount slashed) and no proposer (a catch-up drain cannot attribute votes to proposers).
    const quorum = this.settings.slashingQuorumSize;
    for (const { validator } of uniqueBy(own, target => target.validator.toString())) {
      const votes = Math.max(
        ...own.filter(t => t.validator.equals(validator)).map(t => this.state.countByPosition.get(t.position)!),
      );
      this.metrics.recordOwnValidatorTargeted();
      this.log.warn(
        `Own validator ${validator} targeted by slashing vote (${votes} of ${quorum} votes needed to slash)`,
        { round, validator: validator.toString(), votes, quorum },
      );
    }

    this.metrics.recordCurrentRoundVotesMax(Math.max(0, ...this.state.countByPosition.values()));
  }

  /** Starts a fresh tally, zeroing the gauge so a quiet round does not keep the previous round's value. */
  private rollTo(round: bigint): void {
    this.state = { round, nextVoteIndex: 0n, countByPosition: new Map() };
    this.metrics.recordCurrentRoundVotesMax(0);
    this.metrics.recordQuorumSize(this.settings.slashingQuorumSize); // keeps the gauge fresh across export cycles
  }

  private isOwnValidator(address: EthAddress): boolean {
    return this.ownValidators.some(validator => validator.equals(address));
  }
}
