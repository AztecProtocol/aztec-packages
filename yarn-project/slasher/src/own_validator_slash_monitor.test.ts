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
      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(ownValidator), voteAgainst(committee[1])]);

      await monitor.handleVoteCast(round, 0n);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        `Own validator ${ownValidator} targeted by slashing vote (1 of ${settings.slashingQuorumSize} votes needed to slash)`,
        { round, validator: ownValidator.toString(), votes: 1, quorum: settings.slashingQuorumSize },
      );
      expect(getTargeted()).toEqual([0, 1]);
      expect(getVotesMax()).toEqual([0, 1]);
    });

    it('warns on every vote against a validator, not just the first of a round', async () => {
      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(ownValidator)]);

      await monitor.handleVoteCast(round, 0n);
      await monitor.handleVoteCast(round, 1n);

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
      slashingProposer.getVoteAt.mockResolvedValue([
        voteAgainst(ownValidator, { position: 7 }),
        voteAgainst(ownValidator, { position: 7 + committeeSize }),
      ]);

      await monitor.handleVoteCast(round, 0n);

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
      slashingProposer.getVoteAt.mockResolvedValue([
        voteAgainst(committee[6]),
        voteAgainst(committee[7], { slashAmount: slashingUnit * 2n }),
        voteAgainst(committee[1]),
      ]);

      await monitor.handleVoteCast(round, 0n);

      expect(warnSpy).toHaveBeenCalledTimes(2);
      expect(getTargeted()).toEqual([0, 1, 1]);
    });

    it('reports how close the most targeted validator is when several are named', async () => {
      createMonitor([committee[6], committee[7]]);
      slashingProposer.getVoteAt
        .mockResolvedValueOnce([voteAgainst(committee[6]), voteAgainst(committee[7])])
        .mockResolvedValueOnce([voteAgainst(committee[7])]);

      await monitor.handleVoteCast(round, 0n);
      await monitor.handleVoteCast(round, 1n);

      expect(getVotesMax().at(-1)).toEqual(2);
    });

    it('does not warn when votes only name other validators', async () => {
      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(committee[1])]);

      await monitor.handleVoteCast(round, 0n);

      expect(warnSpy).not.toHaveBeenCalled();
      expect(getTargeted()).toEqual([0]);
      expect(getVotesMax()).toEqual([0, 0]);
    });
  });

  describe('rounds', () => {
    it('resets the tally and zeroes the gauge when the clock announces a new round', async () => {
      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(ownValidator)]);

      await monitor.handleVoteCast(round, 0n);
      monitor.handleNewRound(round + 1n);

      expect(getVotesMax()).toEqual([0, 1, 0]);
      // The quorum gauge is re-recorded on every rollover so it does not go stale between export cycles
      expect(getValues(Metrics.SLASHER_QUORUM_SIZE.name)).toEqual([
        settings.slashingQuorumSize,
        settings.slashingQuorumSize,
      ]);
    });

    it('keeps the tally when the clock announces the round a vote already rolled to', async () => {
      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(ownValidator)]);

      await monitor.handleVoteCast(round + 1n, 0n);
      monitor.handleNewRound(round + 1n);
      await monitor.handleVoteCast(round + 1n, 1n);

      expect(getVotesMax().at(-1)).toEqual(2);
    });

    it('rolls the tally and reads from the first vote when an event beats the clock to a new round', async () => {
      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(ownValidator)]);

      await monitor.handleVoteCast(round, 1n);
      await monitor.handleVoteCast(round + 1n, 0n);

      expect(slashingProposer.getVoteAt.mock.calls).toEqual([
        [round, 0n],
        [round, 1n],
        [round + 1n, 0n],
      ]);
      expect(getVotesMax().at(-1)).toEqual(1);
    });

    it('ignores votes cast for a round that has already closed', async () => {
      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(ownValidator)]);

      await monitor.handleVoteCast(round + 1n, 0n);
      await monitor.handleVoteCast(round, 0n);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(slashingProposer.getVoteAt.mock.calls).toEqual([[round + 1n, 0n]]);
    });

    it('drops a vote whose round closes while it is being read', async () => {
      const pendingVote = promiseWithResolvers<SlashVoteTarget[]>();
      slashingProposer.getVoteAt.mockReturnValue(pendingVote.promise);

      const drain = monitor.handleVoteCast(round, 0n);
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
      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(ownValidator)]);

      await monitor.handleVoteCast(round, 0n);
      await monitor.handleVoteCast(round, 0n);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(slashingProposer.getVoteAt).toHaveBeenCalledTimes(1);
    });

    it('catches up on votes whose events never arrived', async () => {
      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(ownValidator)]);

      await monitor.handleVoteCast(round, 0n);
      await monitor.handleVoteCast(round, 2n);

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

    it('ignores an event for a vote the cursor already passed', async () => {
      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(ownValidator)]);

      await monitor.handleVoteCast(round, 1n);
      await monitor.handleVoteCast(round, 0n);

      expect(slashingProposer.getVoteAt.mock.calls).toEqual([
        [round, 0n],
        [round, 1n],
      ]);
      expect(warnSpy).toHaveBeenCalledTimes(2);
    });

    it('retries a vote whose read failed on the next event', async () => {
      slashingProposer.getVoteAt.mockRejectedValueOnce(new Error('L1 unavailable'));

      await monitor.handleVoteCast(round, 0n);

      expect(warnSpy).not.toHaveBeenCalled();

      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(ownValidator)]);
      await monitor.handleVoteCast(round, 1n);

      expect(warnSpy).toHaveBeenCalledTimes(2);
      expect(slashingProposer.getVoteAt.mock.calls).toEqual([
        [round, 0n],
        [round, 0n],
        [round, 1n],
      ]);
    });

    it('processes one drain at a time, in the order the events arrived', async () => {
      const pendingVote = promiseWithResolvers<SlashVoteTarget[]>();
      slashingProposer.getVoteAt
        .mockReturnValueOnce(pendingVote.promise)
        .mockResolvedValue([voteAgainst(ownValidator)]);

      const first = monitor.handleVoteCast(round, 0n);
      const second = monitor.handleVoteCast(round, 1n);
      await sleep(1);

      // The second drain cannot read its vote while the first one is still in flight
      expect(slashingProposer.getVoteAt).toHaveBeenCalledTimes(1);

      pendingVote.resolve([voteAgainst(ownValidator)]);
      await first;
      await second;

      expect(slashingProposer.getVoteAt).toHaveBeenCalledTimes(2);
      expect(warnSpy.mock.calls.map(([message]) => message)).toEqual([
        expect.stringContaining('(1 of 10 votes needed to slash)'),
        expect.stringContaining('(2 of 10 votes needed to slash)'),
      ]);
    });
  });

  describe('start', () => {
    it('records the quorum size without reading from L1', () => {
      monitor.start(round);

      expect(getValues(Metrics.SLASHER_QUORUM_SIZE.name)).toEqual([settings.slashingQuorumSize]);
      expect(getVotesMax()).toEqual([0]);
      expect(slashingProposer.getVoteAt).not.toHaveBeenCalled();
    });

    it('skips the votes already cast when starting mid-round', async () => {
      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(ownValidator)]);

      monitor.start(round);
      await monitor.handleVoteCast(round, 4n);

      expect(slashingProposer.getVoteAt.mock.calls).toEqual([[round, 4n]]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(getVotesMax()).toEqual([0, 1]);
    });
  });

  describe('stop', () => {
    it('waits for the drain in flight and drops its vote', async () => {
      const pendingVote = promiseWithResolvers<SlashVoteTarget[]>();
      slashingProposer.getVoteAt.mockReturnValue(pendingVote.promise);

      const drain = monitor.handleVoteCast(round, 0n);
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
      slashingProposer.getVoteAt
        .mockReturnValueOnce(pendingVote.promise)
        .mockResolvedValue([voteAgainst(ownValidator)]);

      const inFlight = monitor.handleVoteCast(round, 0n);
      const queued = monitor.handleVoteCast(round, 1n);
      await sleep(1);
      const stopped = monitor.stop();
      pendingVote.resolve([voteAgainst(ownValidator)]);
      await stopped;
      // Both callers' promises resolve: the queued drain is run rather than discarded, and returns doing nothing
      await inFlight;
      await queued;

      expect(slashingProposer.getVoteAt).toHaveBeenCalledTimes(1);
      expect(warnSpy).not.toHaveBeenCalled();
      expect(getVotesMax()).toEqual([0]);
    });

    it('ignores events and executed slashes after stop and tracks fresh state after a restart', async () => {
      slashingProposer.getVoteAt.mockResolvedValue([voteAgainst(ownValidator)]);

      await monitor.stop();
      await monitor.handleVoteCast(round, 0n);
      monitor.handleSlashes(round, [{ attester: ownValidator, amount: slashingUnit }], '0x1');
      expect(slashingProposer.getVoteAt).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();

      monitor.start(round);
      await monitor.handleVoteCast(round, 0n);
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
      monitor.start(round);
      monitor.handleNewRound(round + 1n);
      await monitor.handleVoteCast(round + 1n, 0n);
      monitor.handleSlashes(round + 1n, [{ attester: ownValidator, amount: slashingUnit }], '0x1');

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
