import type { CheckpointLog, FeeHeader, RollupFeeRead, RollupFeeReadResult } from '@aztec/ethereum/contracts';
import type { L1SyncSnapshot, L1SyncSnapshotProvider } from '@aztec/ethereum/l1-types';
import { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { ManualDateProvider } from '@aztec/foundation/timer';
import { FEE_ORACLE_LAG, ManaUsageEstimate } from '@aztec/stdlib/gas';

import {
  FeeSnapshotComputationStaleError,
  FeeSnapshotConfigError,
  FeeSnapshotFutureHeadError,
  FeeSnapshotL1HeadStaleError,
  type FeeSnapshotServiceConfig,
  FeeSnapshotStoppedError,
  FeeSnapshotUnavailableError,
  getDefaultFeeSnapshotServiceConfig,
} from './fee_snapshot.js';
import { FeeSnapshotService, type RollupFeeReader } from './fee_snapshot_service.js';

const L1_GENESIS_TIME = 0n;
const SLOT_DURATION = 24;
const ETHEREUM_SLOT_DURATION = 12;
const EPOCH_DURATION = 32;

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

/** Deterministic in-memory rollup reader. `getManaMinFeeAt` returns the slot number so current fees are identifiable. */
class FakeRollup implements RollupFeeReader {
  public callCount = 0;
  public calls: { blockNumber: bigint; reads: RollupFeeRead[] }[] = [];
  public tips = { pending: CheckpointNumber(5), proven: CheckpointNumber(3) };
  public pendingSlot = 100;
  public provenSlot = 90;
  public manaTarget = 1000n;
  public manaLimit = 2000n;
  public provingCost = 5n;
  public canPrune = false;
  /** Number of upcoming readFeeInputs calls to fail. */
  public failNext = 0;
  /** Optional gate: when set, readFeeInputs waits on this before resolving. */
  public gate: Promise<void> | undefined;
  /** Wave-2 tips override to simulate fork mixing (applied once). */
  public wave2TipsOnce: { pending: CheckpointNumber; proven: CheckpointNumber } | undefined;

  async readFeeInputs(reads: RollupFeeRead[], options: { blockNumber: bigint }): Promise<RollupFeeReadResult[]> {
    this.callCount++;
    this.calls.push({ blockNumber: options.blockNumber, reads });
    if (this.gate) {
      await this.gate;
    }
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error('L1 read failed');
    }
    const isWave2 = reads.some(r => r.kind === 'checkpoint');
    return reads.map(r => this.resolve(r, isWave2));
  }

  private resolve(read: RollupFeeRead, isWave2: boolean): RollupFeeReadResult {
    switch (read.kind) {
      case 'tips': {
        if (isWave2 && this.wave2TipsOnce) {
          const value = this.wave2TipsOnce;
          this.wave2TipsOnce = undefined;
          return { kind: 'tips', value };
        }
        return { kind: 'tips', value: this.tips };
      }
      case 'manaTarget':
        return { kind: 'manaTarget', value: this.manaTarget };
      case 'manaLimit':
        return { kind: 'manaLimit', value: this.manaLimit };
      case 'provingCostPerManaEth':
        return { kind: 'provingCostPerManaEth', value: this.provingCost };
      case 'manaMinFeeAt':
        return { kind: 'manaMinFeeAt', timestamp: read.timestamp, value: BigInt(slotOfTimestamp(read.timestamp)) };
      case 'canPruneAtTime':
        return { kind: 'canPruneAtTime', timestamp: read.timestamp, value: this.canPrune };
      case 'l1FeesAt':
        return { kind: 'l1FeesAt', timestamp: read.timestamp, value: { baseFee: 1n, blobFee: 1n } };
      case 'checkpoint': {
        const slot = Number(read.checkpointNumber) === Number(this.tips.pending) ? this.pendingSlot : this.provenSlot;
        return { kind: 'checkpoint', checkpointNumber: read.checkpointNumber, value: makeCheckpoint(slot) };
      }
    }
  }
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
  let service: FeeSnapshotService;

  const PINNED_SLOT = 100;

  function makeService(overrides: Partial<FeeSnapshotServiceConfig> = {}): FeeSnapshotService {
    const config: FeeSnapshotServiceConfig = {
      ...getDefaultFeeSnapshotServiceConfig({
        slotDuration: SLOT_DURATION,
        l1GenesisTime: L1_GENESIS_TIME,
        ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
        epochDuration: EPOCH_DURATION,
      }),
      clockDriftAllowanceSeconds: 0,
      refreshTimeoutMs: 100,
      pollIntervalMs: 10_000_000,
      ...overrides,
    };
    return new FeeSnapshotService(rollup, identity, dateProvider, config);
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
    // pendingSlot = 100, so wantedCurrent = max(101, slotAtNextL1Block(now)=100) = 101.
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
    expect(afterFirst).toBeGreaterThan(0);
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
    // A normal refresh is two waves (wave1 + wave2); single-flight collapses the 20 callers into one refresh.
    expect(rollup.callCount).toBe(2);
  });

  it('refreshes once on an archiver identity change and shares the completion', async () => {
    await service.getCurrentMinFees();
    const before = rollup.callCount;
    identity.snapshot = makeIdentity(2n, PINNED_SLOT);
    const results = await Promise.all(Array.from({ length: 10 }, () => service.getCurrentMinFees()));
    for (const fees of results) {
      expect(fees.feePerL2Gas).toBe(101n);
    }
    expect(rollup.callCount).toBe(before + 2);
    expect(service.getSnapshot()!.l1.blockNumber).toBe(2n);
  });

  it('refreshes on same block number but different hash', async () => {
    await service.getCurrentMinFees();
    const before = rollup.callCount;
    identity.snapshot = makeIdentity(1n, PINNED_SLOT, Buffer32.fromNumber(999));
    await service.getCurrentMinFees();
    expect(rollup.callCount).toBe(before + 2);
    expect(service.getSnapshot()!.l1.blockHash.equals(Buffer32.fromNumber(999))).toBe(true);
  });

  it('the RPC path issues no L1 request itself during an identity transition', async () => {
    await service.getCurrentMinFees();
    // The archiver publishes a new identity; the RPC lookup observes it before any poll tick.
    identity.snapshot = makeIdentity(2n, PINNED_SLOT);
    const statsBefore = service.getStats().readTriggeredRefreshes;
    await service.getCurrentMinFees();
    // The read triggered exactly one refresh (shared), and did not fan out its own read chain.
    expect(service.getStats().readTriggeredRefreshes).toBe(statsBefore + 1);
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
    // Recovery: next call refreshes successfully to the new identity.
    const fees = await service.getCurrentMinFees();
    expect(fees.feePerL2Gas).toBe(101n);
    expect(service.getSnapshot()!.l1.blockNumber).toBe(2n);
  });

  it('discards and restarts the refresh when wave-2 tips differ from wave-1', async () => {
    rollup.wave2TipsOnce = { pending: CheckpointNumber(6), proven: CheckpointNumber(3) };
    const fees = await service.getCurrentMinFees();
    expect(fees.feePerL2Gas).toBe(101n);
    expect(service.getStats().tipsMismatchDiscards).toBe(1);
  });

  describe('first-snapshot promise', () => {
    it('times out with a typed error while the first refresh keeps failing, then serves once it succeeds', async () => {
      rollup.failNext = 100;
      await expect(service.getCurrentMinFees()).rejects.toBeInstanceOf(FeeSnapshotUnavailableError);
      rollup.failNext = 0;
      const fees = await service.getCurrentMinFees();
      expect(fees.feePerL2Gas).toBe(101n);
    });

    it('reports unavailable when there is no L1 identity yet', async () => {
      identity.snapshot = undefined;
      await expect(service.getCurrentMinFees()).rejects.toBeInstanceOf(FeeSnapshotUnavailableError);
    });
  });

  describe('stop', () => {
    it('rejects the first-snapshot waiter on stop', async () => {
      // No L1 identity yet, so no refresh is triggered and the caller parks on the first-snapshot promise.
      service = makeService({ refreshTimeoutMs: 10_000 });
      identity.snapshot = undefined;
      const pending = service.getCurrentMinFees();
      await service.stop();
      await expect(pending).rejects.toBeInstanceOf(FeeSnapshotStoppedError);
    });
  });

  describe('staleness', () => {
    it('fails closed when the computation age exceeds the bound', async () => {
      service = makeService({ maxRefreshAgeMs: 1_000, maxL1HeadAgeSeconds: 0, futureHeadAllowanceSeconds: 0 });
      await service.getCurrentMinFees();
      dateProvider.advanceTimeMs(2_000);
      await expect(service.getCurrentMinFees()).rejects.toBeInstanceOf(FeeSnapshotComputationStaleError);
    });

    it('fails closed when the L1 head age exceeds the bound', async () => {
      service = makeService({ maxRefreshAgeMs: 0, maxL1HeadAgeSeconds: 60, futureHeadAllowanceSeconds: 0 });
      await service.getCurrentMinFees();
      dateProvider.advanceTime(120);
      await expect(service.getCurrentMinFees()).rejects.toBeInstanceOf(FeeSnapshotL1HeadStaleError);
    });

    it('fails closed when the L1 head is dated too far into the future', async () => {
      service = makeService({ maxRefreshAgeMs: 0, maxL1HeadAgeSeconds: 0, futureHeadAllowanceSeconds: 10 });
      await service.getCurrentMinFees();
      // Step the wall clock backwards so the pinned head is far ahead of "now".
      dateProvider.advanceTime(-120);
      await expect(service.getCurrentMinFees()).rejects.toBeInstanceOf(FeeSnapshotFutureHeadError);
    });

    it('disables each staleness check independently when its config is 0', async () => {
      service = makeService({ maxRefreshAgeMs: 0, maxL1HeadAgeSeconds: 0, futureHeadAllowanceSeconds: 0 });
      await service.getCurrentMinFees();
      dateProvider.advanceTime(100_000);
      // With all checks disabled, a very old snapshot is still served for the covered slot.
      await expect(service.getCurrentMinFees()).resolves.toBeDefined();
    });
  });

  describe('drift window', () => {
    it('rejects a configuration whose drift enumerates more candidates than the cap', () => {
      expect(() => makeService({ clockDriftAllowanceSeconds: 1000, maxClockCandidates: 2 })).toThrow(
        FeeSnapshotConfigError,
      );
    });

    it('drift 0 reduces to the single-anchor selection', async () => {
      const fees = await service.getCurrentMinFees();
      expect(fees.feePerL2Gas).toBe(101n);
    });

    it('enumerates every slot across a multi-slot drift window and takes the element-wise max', async () => {
      // Lower the pending checkpoint so the wall clock (not the floor) drives the enumerated window.
      rollup.pendingSlot = 90;
      // A drift of one slot each way spans multiple candidate slots; current fee == slot, so max == highest slot.
      service = makeService({ clockDriftAllowanceSeconds: SLOT_DURATION, maxClockCandidates: 8 });
      const fees = await service.getCurrentMinFees();
      const nowSeconds = BigInt(dateProvider.nowInSeconds());
      const highBoundary = nowSeconds + BigInt(SLOT_DURATION) + BigInt(ETHEREUM_SLOT_DURATION);
      const expectedHigh = Math.max(rollup.pendingSlot + 1, slotOfTimestamp(highBoundary));
      expect(fees.feePerL2Gas).toBe(BigInt(expectedHigh));
    });
  });
});
