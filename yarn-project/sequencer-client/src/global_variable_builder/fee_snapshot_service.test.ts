import type {
  CheckpointLog,
  FeeHeader,
  L1FeeData,
  RollupChainTips,
  RollupContract,
  RollupFeeGlobals,
  RollupSlotFeeInputs,
} from '@aztec/ethereum/contracts';
import type { L1SyncSnapshot, L1SyncSnapshotProvider } from '@aztec/ethereum/l1-types';
import { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { ManualDateProvider } from '@aztec/foundation/timer';
import { type ArchiverEmitter, L2BlockSourceEvents } from '@aztec/stdlib/block';
import { FEE_ORACLE_LAG, ManaUsageEstimate } from '@aztec/stdlib/gas';

import { mock } from 'jest-mock-extended';
import { EventEmitter } from 'node:events';

import { TestFeeSnapshotService } from '../test/test_fee_snapshot_service.js';
import {
  FeeQuoteUnavailableError,
  type FeeSnapshotServiceConfig,
  getDefaultFeeSnapshotServiceConfig,
} from './fee_snapshot_types.js';

const L1_GENESIS_TIME = 0n;
const SLOT_DURATION = 24;
const ETHEREUM_SLOT_DURATION = 12;
const EPOCH_DURATION = 32;

/**
 * Round trips of a first refresh: globals (with no speculative checkpoints yet), the checkpoints those tips
 * name, per-slot fee inputs, and L1 fees + trailing tips.
 */
const STAGES_FIRST_REFRESH = 4;

/** Round trips of a refresh whose tip speculation hits: the dedicated checkpoints read is skipped. */
const STAGES_WARM_REFRESH = 3;

const FEE_HEADER: FeeHeader = {
  excessMana: 0n,
  manaUsed: 0n,
  ethPerFeeAsset: 1_000_000_000_000n,
  congestionCost: 0n,
  proverCost: 0n,
};

function slotOfTimestamp(ts: bigint): number {
  return Number((ts - L1_GENESIS_TIME) / BigInt(SLOT_DURATION));
}

function makeCheckpoint(slot: number): CheckpointLog {
  return {
    archive: Fr.ZERO,
    headerHash: Buffer32.ZERO,
    blobCommitmentsHash: Buffer32.ZERO,
    attestationsHash: Buffer32.ZERO,
    payloadDigest: Buffer32.ZERO,
    slotNumber: SlotNumber(slot),
    feeHeader: FEE_HEADER,
  };
}

/** Deterministic in-memory rollup reader. `manaMinFee` returns the slot number so current fees are identifiable. */
class FakeRollup {
  /** Number of stage round trips made (see {@link STAGES_FIRST_REFRESH} and {@link STAGES_WARM_REFRESH}). */
  public callCount = 0;
  public blockNumbers: bigint[] = [];
  public tips: RollupChainTips = { pending: CheckpointNumber(5), proven: CheckpointNumber(3) };
  public pendingSlot = 100;
  public provenSlot = 90;
  public manaTarget = 1000n;
  public manaLimit = 2000n;
  public provingCost = 5n;
  public canPrune = false;
  /** Number of upcoming stage calls to fail. */
  public failNext = 0;
  /** Optional gate: when set, every stage waits on this before resolving. */
  public gate: Promise<void> | undefined;
  /** Tips reported by the trailing re-read of the last stage, to simulate divergence across stages. */
  public tailTips: RollupChainTips | undefined;

  async getFeeGlobalsAndCheckpoints(
    speculativeCheckpointNumbers: CheckpointNumber[],
    options: { blockNumber: bigint },
  ): Promise<{ globals: RollupFeeGlobals; checkpoints: (CheckpointLog | undefined)[] }> {
    await this.stage(options);
    return {
      globals: {
        tips: this.tips,
        manaTarget: this.manaTarget,
        manaLimit: this.manaLimit,
        provingCostPerManaEth: this.provingCost,
      },
      // Like the contract, only numbers the current tips name resolve to meaningful data.
      checkpoints: speculativeCheckpointNumbers.map(checkpointNumber => this.checkpointFor(checkpointNumber)),
    };
  }

  private checkpointFor(checkpointNumber: CheckpointNumber): CheckpointLog | undefined {
    if (Number(checkpointNumber) === Number(this.tips.pending)) {
      return makeCheckpoint(this.pendingSlot);
    }
    if (Number(checkpointNumber) === Number(this.tips.proven)) {
      return makeCheckpoint(this.provenSlot);
    }
    return undefined;
  }

  async getCheckpoints(
    checkpointNumbers: CheckpointNumber[],
    options: { blockNumber: bigint },
  ): Promise<CheckpointLog[]> {
    await this.stage(options);
    return checkpointNumbers.map(n =>
      makeCheckpoint(Number(n) === Number(this.tips.pending) ? this.pendingSlot : this.provenSlot),
    );
  }

  async getSlotFeeInputs(timestamps: bigint[], options: { blockNumber: bigint }): Promise<RollupSlotFeeInputs[]> {
    await this.stage(options);
    return timestamps.map(ts => ({ manaMinFee: BigInt(slotOfTimestamp(ts)), canPrune: this.canPrune }));
  }

  async getL1FeesAndTips(
    timestamps: bigint[],
    options: { blockNumber: bigint },
  ): Promise<{ l1Fees: L1FeeData[]; tips: RollupChainTips }> {
    await this.stage(options);
    return {
      l1Fees: timestamps.map(() => ({ baseFee: 1n, blobFee: 1n })),
      tips: this.tailTips ?? this.tips,
    };
  }

  private async stage(options: { blockNumber: bigint }): Promise<void> {
    this.callCount++;
    this.blockNumbers.push(options.blockNumber);
    if (this.gate) {
      await this.gate;
    }
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error('L1 read failed');
    }
  }
}

/** Wraps the fake in a {@link RollupContract} mock so the service can take the real contract type. */
function asRollupContract(fake: FakeRollup): RollupContract {
  const rollup = mock<RollupContract>();
  rollup.getFeeGlobalsAndCheckpoints.mockImplementation((speculativeCheckpointNumbers, options) =>
    fake.getFeeGlobalsAndCheckpoints(speculativeCheckpointNumbers, options),
  );
  rollup.getCheckpoints.mockImplementation((checkpointNumbers, options) =>
    fake.getCheckpoints(checkpointNumbers, options),
  );
  rollup.getSlotFeeInputs.mockImplementation((timestamps, options) => fake.getSlotFeeInputs(timestamps, options));
  rollup.getL1FeesAndTips.mockImplementation((timestamps, options) => fake.getL1FeesAndTips(timestamps, options));
  return rollup;
}

class FakeIdentityProvider implements L1SyncSnapshotProvider {
  public snapshot: L1SyncSnapshot | undefined;
  getL1SyncSnapshot(): L1SyncSnapshot | undefined {
    return this.snapshot;
  }
}

function makeIdentity(blockNumber: bigint, pinnedSlot: number, hash?: Buffer32): L1SyncSnapshot {
  return {
    blockNumber,
    blockHash: hash ?? Buffer32.fromNumber(Number(blockNumber)),
    blockTimestamp: BigInt(pinnedSlot * SLOT_DURATION),
  };
}

describe('FeeSnapshotService', () => {
  let rollup: FakeRollup;
  let identity: FakeIdentityProvider;
  let dateProvider: ManualDateProvider;
  let service: TestFeeSnapshotService;

  const PINNED_SLOT = 100;

  function makeService(
    overrides: Partial<FeeSnapshotServiceConfig> = {},
    events?: ArchiverEmitter,
  ): TestFeeSnapshotService {
    const config: FeeSnapshotServiceConfig = {
      ...getDefaultFeeSnapshotServiceConfig({
        slotDuration: SLOT_DURATION,
        l1GenesisTime: L1_GENESIS_TIME,
        ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
        epochDuration: EPOCH_DURATION,
      }),
      refreshTimeoutMs: 100,
      pollIntervalMs: 10_000_000,
      ...overrides,
    };
    return new TestFeeSnapshotService(asRollupContract(rollup), identity, dateProvider, config, undefined, events);
  }

  function coveredSlots(): number[] {
    return [...service.getSnapshot()!.candidates.keys()].sort((a, b) => a - b);
  }

  beforeEach(() => {
    rollup = new FakeRollup();
    identity = new FakeIdentityProvider();
    dateProvider = new ManualDateProvider();
    // Align wall clock with the pinned L1 timestamp.
    dateProvider.setTime(PINNED_SLOT * SLOT_DURATION * 1000);
    identity.snapshot = makeIdentity(1n, PINNED_SLOT);
    service = makeService();
  });

  afterEach(async () => {
    await service.stop();
  });

  it('serves the current fee floored on the pending checkpoint slot', async () => {
    // pendingSlot = 100, so the current anchor is max(101, slotAtNextL1Block(now) = 100) = 101.
    const fees = await service.getCurrentMinFees();
    expect(fees.feePerL2Gas).toBe(101n);
  });

  it('returns current fee followed by FEE_ORACLE_LAG predictions', async () => {
    const fees = await service.getPredictedMinFees(ManaUsageEstimate.Limit);
    expect(fees).toHaveLength(1 + FEE_ORACLE_LAG);
    expect(fees[0].feePerL2Gas).toBe(101n);
  });

  it('warm calls issue zero L1 requests', async () => {
    await service.getCurrentMinFees();
    const afterFirst = rollup.callCount;
    expect(afterFirst).toBe(STAGES_FIRST_REFRESH);
    for (let i = 0; i < 20; i++) {
      await service.getPredictedMinFees(ManaUsageEstimate.Target);
    }
    expect(rollup.callCount).toBe(afterFirst);
  });

  it('shares a single refresh across concurrent cold calls (single-flight)', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => service.getCurrentMinFees()));
    for (const fees of results) {
      expect(fees.feePerL2Gas).toBe(101n);
    }
    expect(rollup.callCount).toBe(STAGES_FIRST_REFRESH);
  });

  it('refreshes once on an archiver identity change and shares the completion', async () => {
    await service.getCurrentMinFees();
    const before = rollup.callCount;
    identity.snapshot = makeIdentity(2n, PINNED_SLOT);
    const results = await Promise.all(Array.from({ length: 10 }, () => service.getCurrentMinFees()));
    for (const fees of results) {
      expect(fees.feePerL2Gas).toBe(101n);
    }
    expect(rollup.callCount).toBe(before + STAGES_WARM_REFRESH);
    expect(service.getSnapshot()!.l1.blockNumber).toBe(2n);
  });

  it('refreshes on same block number but different hash', async () => {
    await service.getCurrentMinFees();
    const before = rollup.callCount;
    identity.snapshot = makeIdentity(1n, PINNED_SLOT, Buffer32.fromNumber(999));
    await service.getCurrentMinFees();
    expect(rollup.callCount).toBe(before + STAGES_WARM_REFRESH);
    expect(service.getSnapshot()!.l1.blockHash.equals(Buffer32.fromNumber(999))).toBe(true);
  });

  it('skips the checkpoints read when the previous tips still hold, and refetches when they change', async () => {
    await service.getCurrentMinFees();
    expect(rollup.callCount).toBe(STAGES_FIRST_REFRESH);

    // Same tips at a new identity: the speculative read resolves the checkpoints, saving a round trip.
    identity.snapshot = makeIdentity(2n, PINNED_SLOT);
    expect((await service.getCurrentMinFees()).feePerL2Gas).toBe(101n);
    expect(rollup.callCount).toBe(STAGES_FIRST_REFRESH + STAGES_WARM_REFRESH);

    // Tips moved: the speculation misses and the dedicated checkpoints read runs again.
    rollup.tips = { pending: CheckpointNumber(6), proven: CheckpointNumber(3) };
    rollup.pendingSlot = 101;
    identity.snapshot = makeIdentity(3n, PINNED_SLOT);
    expect((await service.getCurrentMinFees()).feePerL2Gas).toBe(102n);
    expect(rollup.callCount).toBe(STAGES_FIRST_REFRESH + STAGES_WARM_REFRESH + STAGES_FIRST_REFRESH);
  });

  it('wakes the refresh loop immediately on an archiver L1 sync point event', async () => {
    const events = new EventEmitter() as ArchiverEmitter;
    service = makeService({}, events);
    service.start();
    await retryUntil(() => service.getSnapshot()?.l1.blockNumber === 1n, 'initial refresh', 10, 0.02);

    // The poll interval is effectively infinite, so only the event can drive the next refresh.
    identity.snapshot = makeIdentity(2n, PINNED_SLOT);
    events.emit(L2BlockSourceEvents.L1SyncPointUpdated, {
      type: L2BlockSourceEvents.L1SyncPointUpdated,
      l1BlockNumber: identity.snapshot.blockNumber,
      l1BlockHash: identity.snapshot.blockHash,
      l1BlockTimestamp: identity.snapshot.blockTimestamp,
    });
    await retryUntil(() => service.getSnapshot()?.l1.blockNumber === 2n, 'event-driven refresh', 10, 0.02);
  });

  it('keeps serving the last-good snapshot when a refresh fails, then recovers on the next read', async () => {
    await service.getCurrentMinFees();
    const good = service.getSnapshot();
    identity.snapshot = makeIdentity(2n, PINNED_SLOT);
    rollup.failNext = 1;
    await expect(service.getCurrentMinFees()).rejects.toThrow('L1 read failed');
    // Last-good snapshot is preserved (identity 1).
    expect(service.getSnapshot()).toBe(good);
    // Recovery: the very next call refreshes successfully to the new identity.
    const fees = await service.getCurrentMinFees();
    expect(fees.feePerL2Gas).toBe(101n);
    expect(service.getSnapshot()!.l1.blockNumber).toBe(2n);
  });

  it('funnels reads during a failing L1 into one serial refresh chain', async () => {
    await service.getCurrentMinFees();
    identity.snapshot = makeIdentity(2n, PINNED_SLOT);
    rollup.failNext = 2;

    // Concurrent reads share the single failing refresh and all receive its error: one L1 request, not ten.
    const calls = rollup.callCount;
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => service.getCurrentMinFees()));
    expect(results.every(result => result.status === 'rejected')).toBe(true);
    expect(rollup.callCount).toBe(calls + 1);

    // Each subsequent read retries immediately with its own single refresh — serial, at most one at a time.
    await expect(service.getCurrentMinFees()).rejects.toThrow('L1 read failed');
    expect(rollup.callCount).toBe(calls + 2);

    // Once L1 recovers, the next read succeeds with no waiting.
    const fees = await service.getCurrentMinFees();
    expect(fees.feePerL2Gas).toBe(101n);
    expect(service.getSnapshot()!.l1.blockNumber).toBe(2n);
  });

  it('recovers when the very first refresh fails', async () => {
    rollup.failNext = 1;
    await expect(service.getCurrentMinFees()).rejects.toThrow('L1 read failed');
    const fees = await service.getCurrentMinFees();
    expect(fees.feePerL2Gas).toBe(101n);
  });

  it('publishes and serves a rollback to a lower L1 block number', async () => {
    identity.snapshot = makeIdentity(5n, PINNED_SLOT);
    await service.getCurrentMinFees();
    expect(service.getSnapshot()!.l1.blockNumber).toBe(5n);
    // L1 identity is hash-authoritative: a reorg or lagging fallback backend can move the height backwards.
    identity.snapshot = makeIdentity(4n, PINNED_SLOT, Buffer32.fromNumber(444));
    const fees = await service.getCurrentMinFees();
    expect(fees.feePerL2Gas).toBe(101n);
    expect(service.getSnapshot()!.l1.blockNumber).toBe(4n);
  });

  it('reports unavailable when there is no L1 identity yet', async () => {
    identity.snapshot = undefined;
    await expect(service.getCurrentMinFees()).rejects.toBeInstanceOf(FeeQuoteUnavailableError);
  });

  it('does not continue refreshing after a read times out', async () => {
    service = makeService({ refreshTimeoutMs: 20 });
    const gate = promiseWithResolvers<void>();
    rollup.gate = gate.promise;

    const read = service.getCurrentMinFees();
    identity.snapshot = makeIdentity(2n, PINNED_SLOT);
    await expect(read).rejects.toBeInstanceOf(FeeQuoteUnavailableError);

    rollup.gate = undefined;
    gate.resolve();
    await retryUntil(() => service.stats.refreshes === 1, 'timed-out refresh completion', 10, 0.02);
    await sleep(0);

    expect(service.stats.refreshes).toBe(1);
    expect(rollup.callCount).toBe(STAGES_FIRST_REFRESH);
    expect(service.getSnapshot()!.l1.blockNumber).toBe(1n);
  });

  it('reports unavailable for reads after the service is stopped', async () => {
    await service.getCurrentMinFees();
    await service.stop();
    await expect(service.getCurrentMinFees()).rejects.toBeInstanceOf(FeeQuoteUnavailableError);
  });

  it('fails closed when the pinned L1 head age exceeds the bound', async () => {
    service = makeService({ maxL1HeadAgeSeconds: 60 });
    await service.getCurrentMinFees();
    dateProvider.advanceTime(120);
    await expect(service.getCurrentMinFees()).rejects.toThrow('pinned L1 head age 120s exceeds max 60s');
  });

  it('does not touch L1 for a stale frozen identity, even with the wanted slot uncovered', async () => {
    service = makeService({ maxL1HeadAgeSeconds: 60 });
    await service.getCurrentMinFees();
    const calls = rollup.callCount;
    // Advance past both the candidate headroom and the age bound with the identity frozen: a refresh could
    // rebuild coverage, but only at the same stale head, so the read must fail without issuing one.
    dateProvider.advanceTime(10 * SLOT_DURATION);
    await expect(service.getCurrentMinFees()).rejects.toThrow(/pinned L1 head age/);
    expect(rollup.callCount).toBe(calls);
  });

  it('fails a cold read without touching L1 when the identity is already stale', async () => {
    service = makeService({ maxL1HeadAgeSeconds: 60 });
    dateProvider.advanceTime(120);
    await expect(service.getCurrentMinFees()).rejects.toThrow(/pinned L1 head age/);
    expect(rollup.callCount).toBe(0);
  });

  it('serves an arbitrarily old pinned head when the age bound is disabled', async () => {
    service = makeService({ maxL1HeadAgeSeconds: 0 });
    await service.getCurrentMinFees();
    dateProvider.advanceTime(100_000);
    await expect(service.getCurrentMinFees()).resolves.toBeDefined();
  });

  it('fails the refresh when the trailing tips differ, keeping the stored snapshot until it can be replaced', async () => {
    await service.getCurrentMinFees();
    const stored = service.getSnapshot();
    rollup.tailTips = { pending: CheckpointNumber(6), proven: CheckpointNumber(3) };

    // (a) With the identity unchanged and the wanted slots covered, reads keep serving the identity-1 snapshot.
    const callsAfterGood = rollup.callCount;
    await expect(service.getCurrentMinFees()).resolves.toBeDefined();
    expect(rollup.callCount).toBe(callsAfterGood);

    // (b) On a new identity the read must refresh, and that refresh fails on the tips comparison: the caller
    // gets the refresh error rather than the superseded quote, and the stored snapshot is left alone. While the
    // divergence persists, every read keeps failing the same way.
    identity.snapshot = makeIdentity(2n, PINNED_SLOT);
    await expect(service.getCurrentMinFees()).rejects.toThrow(/Chain tips changed/);
    expect(service.stats.refreshFailures).toBe(1);
    expect(service.getSnapshot()).toBe(stored);
    await expect(service.getCurrentMinFees()).rejects.toThrow(/Chain tips changed/);
    expect(service.stats.refreshFailures).toBe(2);
    expect(service.getSnapshot()).toBe(stored);

    // (c) Once the divergence clears, the next read serves the new identity.
    rollup.tailTips = undefined;
    await expect(service.getCurrentMinFees()).resolves.toBeDefined();
    expect(service.getSnapshot()!.l1.blockNumber).toBe(2n);
  });

  describe('identity change during an in-flight refresh', () => {
    /** Gates the first refresh, publishes `next` while it is in flight, and asserts the read lands on `next`. */
    async function assertReadLandsOn(next: L1SyncSnapshot): Promise<void> {
      service = makeService({ refreshTimeoutMs: 5_000 });
      const gate = promiseWithResolvers<void>();
      rollup.gate = gate.promise;

      const read = service.getCurrentMinFees();
      await sleep(1);
      identity.snapshot = next;
      rollup.gate = undefined;
      gate.resolve();

      const fees = await read;
      expect(fees.feePerL2Gas).toBe(101n);
      expect(service.getSnapshot()!.l1.blockHash.equals(next.blockHash)).toBe(true);
      // One refresh for the old identity plus one corrective refresh: no fan-out per caller.
      expect(service.stats.refreshes).toBe(2);
    }

    it('lands on a higher block number published mid-refresh', async () => {
      await assertReadLandsOn(makeIdentity(2n, PINNED_SLOT));
    });

    it('lands on a same-height reorg published mid-refresh', async () => {
      await assertReadLandsOn(makeIdentity(1n, PINNED_SLOT, Buffer32.fromNumber(777)));
    });
  });

  describe('coverage across an L1 stall', () => {
    it('serves the advancing wanted slot from headroom, then extends coverage from the poll tick', async () => {
      service = makeService({ pollIntervalMs: 10 });
      await service.getCurrentMinFees();
      // Anchors at slot 101 (current) and 100 (prediction), each with two slots of headroom.
      expect(coveredSlots()).toEqual([100, 101, 102, 103]);

      // The identity stays frozen: the wall clock alone moves the wanted slot up through the headroom.
      const calls = rollup.callCount;
      dateProvider.advanceTime(SLOT_DURATION);
      expect((await service.getCurrentMinFees()).feePerL2Gas).toBe(101n);
      dateProvider.advanceTime(SLOT_DURATION);
      expect((await service.getCurrentMinFees()).feePerL2Gas).toBe(102n);
      expect(rollup.callCount).toBe(calls);

      // One more slot leaves the wanted slot covered but the tick's one-slot lookahead uncovered, so the
      // background loop re-centres the window on the same pinned block.
      service.start();
      dateProvider.advanceTime(SLOT_DURATION);
      await retryUntil(() => service.stats.refreshes >= 2, 'coverage refresh', 10, 0.02);
      expect(service.getSnapshot()!.l1.blockNumber).toBe(1n);
      expect(coveredSlots()).toEqual([103, 104, 105]);
    });

    it('serves a read landing exactly on a slot boundary while a coverage refresh is in flight', async () => {
      service = makeService({ pollIntervalMs: 10 });
      await service.getCurrentMinFees();

      const gate = promiseWithResolvers<void>();
      rollup.gate = gate.promise;
      service.start();
      // Slot 103 starts exactly at this timestamp: the read wants a covered slot while the tick's lookahead
      // (slot 104) does not, so the gated coverage refresh is in flight when the read arrives.
      dateProvider.advanceTime(3 * SLOT_DURATION);
      await retryUntil(() => rollup.callCount > STAGES_FIRST_REFRESH, 'gated refresh started', 10, 0.02);

      const fees = await service.getCurrentMinFees();
      expect(fees.feePerL2Gas).toBe(103n);
      expect(service.stats.refreshes).toBe(1);

      rollup.gate = undefined;
      gate.resolve();
    });
  });
});
