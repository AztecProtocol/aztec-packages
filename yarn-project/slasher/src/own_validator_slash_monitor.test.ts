import type { SlashVoteTarget, SlashingProposerContract } from '@aztec/ethereum/contracts';
import { times } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';
import { Metrics } from '@aztec/telemetry-client';
import { BenchmarkTelemetryClient } from '@aztec/telemetry-client/bench';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { SlasherMetrics } from './metrics.js';
import { OwnValidatorSlashMonitor } from './own_validator_slash_monitor.js';

describe('OwnValidatorSlashMonitor', () => {
  let slashingProposer: MockProxy<SlashingProposerContract>;
  let telemetryClient: BenchmarkTelemetryClient;
  let logger: Logger;
  let warnSpy: jest.SpiedFunction<Logger['warn']>;
  let monitor: OwnValidatorSlashMonitor;

  let committee: EthAddress[];
  let ownValidator: EthAddress;

  const round = 5n;
  const committeeSize = 8;
  const settings = { slashingQuorumSize: 10 };
  const slashingUnit = 1000000000000000000n; // 1 ETH in wei

  const createMonitor = (ownValidators: EthAddress[]) => {
    telemetryClient = new BenchmarkTelemetryClient();
    monitor = new OwnValidatorSlashMonitor(
      slashingProposer,
      settings,
      ownValidators,
      new SlasherMetrics(telemetryClient),
      logger,
    );
    return monitor;
  };

  const getPoints = (name: string) =>
    telemetryClient
      .getMeters()
      .flatMap(meter => meter.metrics)
      .find(metric => metric.name === name)?.points ?? [];

  const getValues = (name: string) => getPoints(name).map(point => point.value);
  const getVotesMax = () => getValues(Metrics.SLASHER_OWN_VALIDATOR_CURRENT_ROUND_VOTES_MAX.name);
  const getTargeted = () => getValues(Metrics.SLASHER_OWN_VALIDATOR_TARGETED_COUNT.name);

  /** A vote entry naming a validator, defaulting its committee index as the flattened committee position */
  const voteAgainst = (
    validator: EthAddress,
    opts: { position?: number; slashAmount?: bigint } = {},
  ): SlashVoteTarget => ({
    validator,
    slashAmount: opts.slashAmount ?? slashingUnit,
    position: opts.position ?? committee.findIndex(member => member.equals(validator)),
  });

  const roundWithVotes = (voteCount: bigint) => ({ isExecuted: false, voteCount });

  beforeEach(() => {
    logger = createLogger('test');
    warnSpy = jest.spyOn(logger, 'warn');
    slashingProposer = mock<SlashingProposerContract>();
    committee = times(committeeSize, i => EthAddress.fromNumber(i + 1));
    ownValidator = committee[7];
    createMonitor([ownValidator]);
  });

  describe('vote tallying', () => {
    it('warns and increments the targeted metric when a vote names an own validator', async () => {
      slashingProposer.getRound.mockResolvedValue(roundWithVotes(1n));
      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(ownValidator), voteAgainst(committee[1])]);

      await monitor.handleVoteCast(round);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        `Own validator ${ownValidator} targeted by slashing vote (1 of ${settings.slashingQuorumSize} votes needed to slash)`,
        { round, validator: ownValidator.toString(), votes: 1, quorum: settings.slashingQuorumSize },
      );
      expect(getTargeted()).toEqual([0, 1]);
      expect(getVotesMax()).toEqual([0, 1]);
    });

    it('warns on every vote against a validator, not just the first of a round', async () => {
      slashingProposer.getRound.mockResolvedValueOnce(roundWithVotes(1n)).mockResolvedValueOnce(roundWithVotes(2n));
      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(ownValidator)]);

      await monitor.handleVoteCast(round);
      await monitor.handleVoteCast(round);

      expect(warnSpy).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenLastCalledWith(
        expect.stringContaining(`(2 of ${settings.slashingQuorumSize} votes needed to slash)`),
        expect.objectContaining({ votes: 2 }),
      );
      // The round tally climbs towards the quorum, unlike the cumulative counter
      expect(getTargeted()).toEqual([0, 1, 1]);
      expect(getVotesMax()).toEqual([0, 1, 2]);
    });

    it('tallies per committee position when a validator sits in several of the round committees', async () => {
      // A single vote names the validator once per position it holds, but each position races quorum separately,
      // so this is one vote of quorum rather than two
      slashingProposer.getRound.mockResolvedValue(roundWithVotes(1n));
      slashingProposer.getVoteAt.mockResolvedValue([
        voteAgainst(ownValidator, { position: 7 }),
        voteAgainst(ownValidator, { position: 7 + committeeSize }),
      ]);

      await monitor.handleVoteCast(round);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(`(1 of ${settings.slashingQuorumSize} votes needed to slash)`),
        expect.objectContaining({ votes: 1 }),
      );
      expect(getTargeted()).toEqual([0, 1]);
      expect(getVotesMax()).toEqual([0, 1]);
    });

    it('warns for each own validator named in a vote', async () => {
      createMonitor([committee[6], committee[7]]);
      slashingProposer.getRound.mockResolvedValue(roundWithVotes(1n));
      slashingProposer.getVoteAt.mockResolvedValue([
        voteAgainst(committee[6]),
        voteAgainst(committee[7], { slashAmount: slashingUnit * 2n }),
        voteAgainst(committee[1]),
      ]);

      await monitor.handleVoteCast(round);

      expect(warnSpy).toHaveBeenCalledTimes(2);
      expect(getTargeted()).toEqual([0, 1, 1]);
    });

    it('reports how close the most targeted validator is when several are named', async () => {
      createMonitor([committee[6], committee[7]]);
      slashingProposer.getRound.mockResolvedValueOnce(roundWithVotes(1n)).mockResolvedValueOnce(roundWithVotes(2n));
      slashingProposer.getVoteAt
        .mockResolvedValueOnce([voteAgainst(committee[6]), voteAgainst(committee[7])])
        .mockResolvedValueOnce([voteAgainst(committee[7])]);

      await monitor.handleVoteCast(round);
      await monitor.handleVoteCast(round);

      expect(getVotesMax().at(-1)).toEqual(2);
    });

    it('does not warn when votes only name other validators', async () => {
      slashingProposer.getRound.mockResolvedValue(roundWithVotes(1n));
      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(committee[1])]);

      await monitor.handleVoteCast(round);

      expect(warnSpy).not.toHaveBeenCalled();
      expect(getTargeted()).toEqual([0]);
      expect(getVotesMax()).toEqual([0, 0]);
    });
  });

  describe('rounds', () => {
    it('resets the tally and zeroes the gauge when the clock announces a new round', async () => {
      slashingProposer.getRound.mockResolvedValue(roundWithVotes(1n));
      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(ownValidator)]);

      await monitor.handleVoteCast(round);
      monitor.handleNewRound(round + 1n);

      expect(getVotesMax()).toEqual([0, 1, 0]);
      // The quorum gauge is re-recorded on every rollover so it does not go stale between export cycles
      expect(getValues(Metrics.SLASHER_QUORUM_SIZE.name)).toEqual([
        settings.slashingQuorumSize,
        settings.slashingQuorumSize,
      ]);
    });

    it('keeps the tally when the clock announces the round a vote already rolled to', async () => {
      slashingProposer.getRound.mockResolvedValueOnce(roundWithVotes(1n)).mockResolvedValueOnce(roundWithVotes(2n));
      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(ownValidator)]);

      await monitor.handleVoteCast(round + 1n);
      monitor.handleNewRound(round + 1n);
      await monitor.handleVoteCast(round + 1n);

      expect(getVotesMax().at(-1)).toEqual(2);
    });

    it('rolls the tally and reads from the first vote when an event beats the clock to a new round', async () => {
      slashingProposer.getRound.mockResolvedValueOnce(roundWithVotes(2n)).mockResolvedValueOnce(roundWithVotes(1n));
      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(ownValidator)]);

      await monitor.handleVoteCast(round);
      await monitor.handleVoteCast(round + 1n);

      expect(slashingProposer.getVoteAt.mock.calls).toEqual([
        [round, 0n],
        [round, 1n],
        [round + 1n, 0n],
      ]);
      expect(getVotesMax().at(-1)).toEqual(1);
    });

    it('ignores votes cast for a round that has already closed', async () => {
      slashingProposer.getRound.mockResolvedValue(roundWithVotes(1n));
      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(ownValidator)]);

      await monitor.handleVoteCast(round + 1n);
      await monitor.handleVoteCast(round);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(slashingProposer.getRound).toHaveBeenCalledTimes(1);
      expect(slashingProposer.getRound).toHaveBeenCalledWith(round + 1n);
    });

    it('drops a vote whose round closes while it is being read', async () => {
      const pendingVote = promiseWithResolvers<SlashVoteTarget[]>();
      slashingProposer.getRound.mockResolvedValue(roundWithVotes(1n));
      slashingProposer.getVoteAt.mockReturnValue(pendingVote.promise);

      const drain = monitor.handleVoteCast(round);
      await sleep(1);
      monitor.handleNewRound(round + 1n);
      pendingVote.resolve([voteAgainst(ownValidator)]);
      await drain;

      expect(warnSpy).not.toHaveBeenCalled();
      expect(getVotesMax()).toEqual([0, 0]);
    });
  });

  describe('vote index cursor', () => {
    it('reads each vote of a round exactly once across duplicate events', async () => {
      slashingProposer.getRound.mockResolvedValue(roundWithVotes(1n));
      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(ownValidator)]);

      await monitor.handleVoteCast(round);
      await monitor.handleVoteCast(round);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(slashingProposer.getVoteAt).toHaveBeenCalledTimes(1);
    });

    it('catches up on votes whose events never arrived', async () => {
      slashingProposer.getRound.mockResolvedValueOnce(roundWithVotes(1n)).mockResolvedValueOnce(roundWithVotes(3n));
      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(ownValidator)]);

      await monitor.handleVoteCast(round);
      await monitor.handleVoteCast(round);

      expect(slashingProposer.getVoteAt.mock.calls).toEqual([
        [round, 0n],
        [round, 1n],
        [round, 2n],
      ]);
      expect(warnSpy.mock.calls.map(([message]) => message)).toEqual([
        expect.stringContaining('(1 of 10 votes needed to slash)'),
        expect.stringContaining('(2 of 10 votes needed to slash)'),
        expect.stringContaining('(3 of 10 votes needed to slash)'),
      ]);
    });

    it('retries a vote whose read failed on the next event', async () => {
      slashingProposer.getRound.mockResolvedValue(roundWithVotes(1n));
      slashingProposer.getVoteAt.mockRejectedValueOnce(new Error('L1 unavailable'));

      await monitor.handleVoteCast(round);

      expect(warnSpy).not.toHaveBeenCalled();

      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(ownValidator)]);
      await monitor.handleVoteCast(round);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(slashingProposer.getVoteAt.mock.calls).toEqual([
        [round, 0n],
        [round, 0n],
      ]);
    });

    it('processes one drain at a time, in the order the events arrived', async () => {
      const pendingRound = promiseWithResolvers<{ isExecuted: boolean; voteCount: bigint }>();
      slashingProposer.getRound.mockReturnValueOnce(pendingRound.promise).mockResolvedValue(roundWithVotes(2n));
      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(ownValidator)]);

      const first = monitor.handleVoteCast(round);
      const second = monitor.handleVoteCast(round);
      await sleep(1);

      // The second drain cannot even read the round while the first one is still in flight
      expect(slashingProposer.getRound).toHaveBeenCalledTimes(1);

      pendingRound.resolve(roundWithVotes(1n));
      await first;
      await second;

      expect(slashingProposer.getRound).toHaveBeenCalledTimes(2);
      expect(warnSpy.mock.calls.map(([message]) => message)).toEqual([
        expect.stringContaining('(1 of 10 votes needed to slash)'),
        expect.stringContaining('(2 of 10 votes needed to slash)'),
      ]);
    });
  });

  describe('start', () => {
    it('records the quorum size so the round tally can be read against it', async () => {
      slashingProposer.getRound.mockResolvedValue(roundWithVotes(0n));

      await monitor.start(round);
      await monitor.handleVoteCast(round);

      expect(getValues(Metrics.SLASHER_QUORUM_SIZE.name)).toEqual([settings.slashingQuorumSize]);
    });

    it('skips the votes already cast when starting mid-round', async () => {
      slashingProposer.getRound.mockResolvedValueOnce(roundWithVotes(3n)).mockResolvedValueOnce(roundWithVotes(4n));
      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(ownValidator)]);

      await monitor.start(round);
      await monitor.handleVoteCast(round);

      expect(slashingProposer.getVoteAt.mock.calls).toEqual([[round, 3n]]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(getVotesMax()).toEqual([0, 1]);
    });

    it('falls back to the latest vote only when the baseline read fails', async () => {
      slashingProposer.getRound
        .mockRejectedValueOnce(new Error('L1 unavailable'))
        .mockResolvedValueOnce(roundWithVotes(5n))
        .mockResolvedValueOnce(roundWithVotes(6n));
      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(ownValidator)]);

      await monitor.start(round);
      await monitor.handleVoteCast(round);
      await monitor.handleVoteCast(round);

      // The cursor recovers from the fallback index, so the next event does not re-read what it processed
      expect(slashingProposer.getVoteAt.mock.calls).toEqual([
        [round, 4n],
        [round, 5n],
      ]);
      expect(getVotesMax()).toEqual([0, 1, 2]);
    });
  });

  describe('stop', () => {
    it('waits for the drain in flight and drops its vote', async () => {
      const pendingVote = promiseWithResolvers<SlashVoteTarget[]>();
      slashingProposer.getRound.mockResolvedValue(roundWithVotes(1n));
      slashingProposer.getVoteAt.mockReturnValue(pendingVote.promise);

      const drain = monitor.handleVoteCast(round);
      await sleep(1);
      const stopped = monitor.stop();
      pendingVote.resolve([voteAgainst(ownValidator)]);
      await stopped;
      await drain;

      expect(warnSpy).not.toHaveBeenCalled();
      expect(getVotesMax()).toEqual([0]);
    });

    it('settles the events queued behind the drain in flight without reading their votes', async () => {
      const pendingVote = promiseWithResolvers<SlashVoteTarget[]>();
      slashingProposer.getRound.mockResolvedValue(roundWithVotes(1n));
      slashingProposer.getVoteAt
        .mockReturnValueOnce(pendingVote.promise)
        .mockResolvedValue([voteAgainst(ownValidator)]);

      const inFlight = monitor.handleVoteCast(round);
      const queued = monitor.handleVoteCast(round);
      await sleep(1);
      const stopped = monitor.stop();
      pendingVote.resolve([voteAgainst(ownValidator)]);
      await stopped;
      // Both callers' promises resolve: the queued drain is run rather than discarded, and returns doing nothing
      await inFlight;
      await queued;

      expect(slashingProposer.getRound).toHaveBeenCalledTimes(1);
      expect(slashingProposer.getVoteAt).toHaveBeenCalledTimes(1);
      expect(warnSpy).not.toHaveBeenCalled();
      expect(getVotesMax()).toEqual([0]);
    });

    it('ignores events and executed slashes after stop and tracks fresh state after a restart', async () => {
      slashingProposer.getRound.mockResolvedValueOnce(roundWithVotes(0n)).mockResolvedValueOnce(roundWithVotes(1n));
      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(ownValidator)]);

      await monitor.stop();
      await monitor.handleVoteCast(round);
      monitor.handleSlashes(round, [{ attester: ownValidator, amount: slashingUnit }], '0x1');
      expect(slashingProposer.getRound).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();

      await monitor.start(round);
      await monitor.handleVoteCast(round);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(getVotesMax().at(-1)).toEqual(1);
    });
  });

  describe('handleSlashes', () => {
    it('warns and records metrics for own validators only', () => {
      monitor.handleSlashes(
        round,
        [
          { attester: ownValidator, amount: slashingUnit * 2n },
          { attester: committee[1], amount: slashingUnit },
        ],
        '0x1',
      );

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(`Own validator ${ownValidator} was slashed for ${slashingUnit * 2n}`, {
        round,
        validator: ownValidator.toString(),
        amount: slashingUnit * 2n,
        l1BlockHash: '0x1',
      });
      expect(getValues(Metrics.SLASHER_OWN_VALIDATOR_SLASHED_COUNT.name)).toEqual([0, 1]);
      // The 2e18 base-unit slash is recorded as 2 whole staking-asset tokens
      expect(getValues(Metrics.SLASHER_OWN_VALIDATOR_SLASHED_AMOUNT.name)).toEqual([0, 2]);
    });
  });

  describe('without own validators', () => {
    beforeEach(() => {
      createMonitor([]);
    });

    it('never reads from L1, warns, or records gauges', async () => {
      await monitor.start(round);
      monitor.handleNewRound(round + 1n);
      await monitor.handleVoteCast(round + 1n);
      monitor.handleSlashes(round + 1n, [{ attester: ownValidator, amount: slashingUnit }], '0x1');

      expect(slashingProposer.getRound).not.toHaveBeenCalled();
      expect(slashingProposer.getVoteAt).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(getVotesMax()).toEqual([]);
      expect(getValues(Metrics.SLASHER_QUORUM_SIZE.name)).toEqual([]);
      // The counters are zero-seeded on construction, so only the seeds are expected
      expect(getTargeted()).toEqual([0]);
      expect(getValues(Metrics.SLASHER_OWN_VALIDATOR_SLASHED_COUNT.name)).toEqual([0]);
    });
  });
});
