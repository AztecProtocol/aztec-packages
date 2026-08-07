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
import { FEE_ORACLE_LAG, ManaUsageEstimate } from '@aztec/stdlib/gas';

import { mock } from 'jest-mock-extended';

import { TestFeeSnapshotService } from '../test/test_fee_snapshot_service.js';
import {
  FeeQuoteStaleError,
  FeeQuoteUnavailableError,
  type FeeSnapshotServiceConfig,
  getDefaultFeeSnapshotServiceConfig,
} from './fee_snapshot_types.js';

const L1_GENESIS_TIME = 0n;
const SLOT_DURATION = 24;
const ETHEREUM_SLOT_DURATION = 12;
const EPOCH_DURATION = 32;

/** Round trips one refresh makes: globals, checkpoints, per-slot fee inputs, L1 fees + trailing tips. */
const STAGES_PER_REFRESH = 4;

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
  /** Number of stage round trips made (one refresh is {@link STAGES_PER_REFRESH}). */
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

  async getFeeGlobals(options: { blockNumber: bigint }): Promise<RollupFeeGlobals> {
    await this.stage(options);
    return {
      tips: this.tips,
      manaTarget: this.manaTarget,
      manaLimit: this.manaLimit,
      provingCostPerManaEth: this.provingCost,
    };
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
  rollup.getFeeGlobals.mockImplementation(options => fake.getFeeGlobals(options));
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

  function makeService(overrides: Partial<FeeSnapshotServiceConfig> = {}): TestFeeSnapshotService {
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
    return new TestFeeSnapshotService(asRollupContract(rollup), identity, dateProvider, config);
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
    expect(afterFirst).toBe(STAGES_PER_REFRESH);
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
    expect(rollup.callCount).toBe(STAGES_PER_REFRESH);
  });

  it('refreshes once on an archiver identity change and shares the completion', async () => {
    await service.getCurrentMinFees();
    const before = rollup.callCount;
    identity.snapshot = makeIdentity(2n, PINNED_SLOT);
    const results = await Promise.all(Array.from({ length: 10 }, () => service.getCurrentMinFees()));
    for (const fees of results) {
      expect(fees.feePerL2Gas).toBe(101n);
    }
    expect(rollup.callCount).toBe(before + STAGES_PER_REFRESH);
    expect(service.getSnapshot()!.l1.blockNumber).toBe(2n);
  });

  it('refreshes on same block number but different hash', async () => {
    await service.getCurrentMinFees();
    const before = rollup.callCount;
    identity.snapshot = makeIdentity(1n, PINNED_SLOT, Buffer32.fromNumber(999));
    await service.getCurrentMinFees();
    expect(rollup.callCount).toBe(before + STAGES_PER_REFRESH);
    expect(service.getSnapshot()!.l1.blockHash.equals(Buffer32.fromNumber(999))).toBe(true);
  });

  it('the RPC path issues no L1 request itself during an identity transition', async () => {
    await service.getCurrentMinFees();
    // The archiver publishes a new identity; the RPC lookup observes it before any poll tick.
    identity.snapshot = makeIdentity(2n, PINNED_SLOT);
    const statsBefore = service.stats.readTriggeredRefreshes;
    await service.getCurrentMinFees();
    // The read triggered exactly one refresh (shared), and did not fan out its own read chain.
    expect(service.stats.readTriggeredRefreshes).toBe(statsBefore + 1);
    expect(service.getSnapshot()!.l1.blockNumber).toBe(2n);
  });

  it('keeps serving the last-good snapshot when a refresh fails, then recovers', async () => {
    await service.getCurrentMinFees();
    const good = service.getSnapshot();
    identity.snapshot = makeIdentity(2n, PINNED_SLOT);
    rollup.failNext = 1;
    await expect(service.getCurrentMinFees()).rejects.toThrow('L1 read failed');
    // Last-good snapshot is preserved (identity 1).
    expect(service.getSnapshot()).toBe(good);
    // Recovery: once the failure backoff elapses, the next call refreshes successfully to the new identity.
    dateProvider.advanceTimeMs(1_000);
    const fees = await service.getCurrentMinFees();
    expect(fees.feePerL2Gas).toBe(101n);
    expect(service.getSnapshot()!.l1.blockNumber).toBe(2n);
  });

  it('read-triggered refreshes respect the failure backoff and do not hammer L1', async () => {
    await service.getCurrentMinFees();
    identity.snapshot = makeIdentity(2n, PINNED_SLOT);
    rollup.failNext = 1;
    await expect(service.getCurrentMinFees()).rejects.toThrow('L1 read failed');
    // During the backoff window, reads fail fast with a typed error and issue no L1 requests.
    const calls = rollup.callCount;
    await expect(service.getCurrentMinFees()).rejects.toBeInstanceOf(FeeQuoteUnavailableError);
    expect(rollup.callCount).toBe(calls);
    // After the backoff elapses, reads refresh again.
    dateProvider.advanceTimeMs(1_000);
    const fees = await service.getCurrentMinFees();
    expect(fees.feePerL2Gas).toBe(101n);
  });

  it('recovers when the very first refresh fails', async () => {
    rollup.failNext = 100;
    await expect(service.getCurrentMinFees()).rejects.toThrow('L1 read failed');
    rollup.failNext = 0;
    dateProvider.advanceTimeMs(1_000);
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

  it('reports unavailable for reads after the service is stopped', async () => {
    await service.getCurrentMinFees();
    await service.stop();
    await expect(service.getCurrentMinFees()).rejects.toBeInstanceOf(FeeQuoteUnavailableError);
  });

  it('fails closed when the pinned L1 head age exceeds the bound', async () => {
    service = makeService({ maxL1HeadAgeSeconds: 60 });
    await service.getCurrentMinFees();
    dateProvider.advanceTime(120);
    await expect(service.getCurrentMinFees()).rejects.toBeInstanceOf(FeeQuoteStaleError);
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
    // gets the refresh error rather than the superseded quote, and the stored snapshot is left alone.
    identity.snapshot = makeIdentity(2n, PINNED_SLOT);
    await expect(service.getCurrentMinFees()).rejects.toThrow(/Chain tips changed/);
    expect(service.stats.refreshFailures).toBe(1);
    expect(service.getSnapshot()).toBe(stored);
    await expect(service.getCurrentMinFees()).rejects.toBeInstanceOf(FeeQuoteUnavailableError);
    expect(service.getSnapshot()).toBe(stored);

    // (c) Once the divergence clears and the backoff elapses, the next read serves the new identity.
    rollup.tailTips = undefined;
    dateProvider.advanceTimeMs(1_000);
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
      await retryUntil(() => rollup.callCount > STAGES_PER_REFRESH, 'gated refresh started', 10, 0.02);

      const fees = await service.getCurrentMinFees();
      expect(fees.feePerL2Gas).toBe(103n);
      expect(service.stats.refreshes).toBe(1);

      rollup.gate = undefined;
      gate.resolve();
    });
  });
});
