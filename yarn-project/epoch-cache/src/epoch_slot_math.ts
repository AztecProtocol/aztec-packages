import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { DateProvider } from '@aztec/foundation/timer';
import {
  type L1RollupConstants,
  getEpochAtSlot,
  getEpochNumberAtTimestamp,
  getNextL1SlotTimestamp,
  getSlotAtNextL1Block,
  getSlotAtTimestamp,
  getTimestampForSlot,
} from '@aztec/stdlib/epoch-helpers';

/** The proposer pipelines by building one slot ahead. */
export const PROPOSER_PIPELINING_SLOT_OFFSET = 1;

/** Flat return type for compound epoch/slot getters. */
export type EpochAndSlot = {
  slot: SlotNumber;
  epoch: EpochNumber;
  ts: bigint;
};

/**
 * The L1-free half of the epoch cache: slot and epoch arithmetic derived purely from the rollup's
 * `L1RollupConstants` and the wall clock. Consumers that only need to know which slot or epoch it is depend on
 * this instead of on the full `EpochCacheInterface`, so they cannot reach a committee getter — which would
 * require an L1 connection. A follower node, for instance, is handed a bare {@link EpochSlotMath} seeded with
 * the constants reported by its upstream.
 */
export interface EpochSlotMathInterface {
  /** Returns the rollup constants all the arithmetic below is derived from. */
  getL1Constants(): L1RollupConstants;
  /** Returns the L2 slot at the current wall-clock time. */
  getSlotNow(): SlotNumber;
  /** Returns the slot a proposer building now would target: the current slot plus the pipelining offset. */
  getTargetSlot(): SlotNumber;
  /** Returns the epoch at the current wall-clock time. */
  getEpochNow(): EpochNumber;
  /** Returns the epoch containing {@link EpochSlotMathInterface.getTargetSlot}. */
  getTargetEpoch(): EpochNumber;
  /** Returns epoch, slot and slot timestamp at the current wall-clock time, plus that time in milliseconds. */
  getEpochAndSlotNow(): EpochAndSlot & { nowMs: bigint };
  /** Returns epoch/slot info for the L2 slot that the next L1 slot falls into. */
  getEpochAndSlotInNextL1Slot(): EpochAndSlot & { nowSeconds: bigint };
  /** Returns epoch/slot info for the next L1 slot with pipeline offset applied. */
  getTargetEpochAndSlotInNextL1Slot(): EpochAndSlot & { nowSeconds: bigint };
  /** Returns the current L2 slot and the L2 slot at the next L1 block. */
  getCurrentAndNextSlot(): { currentSlot: SlotNumber; nextSlot: SlotNumber };
  /** Returns the current and next L2 slot with the proposer pipelining offset applied to both. */
  getTargetAndNextSlot(): { targetSlot: SlotNumber; nextSlot: SlotNumber };
}

/**
 * Constants-only slot/epoch clock. Makes no network calls of any kind: everything it returns follows from the
 * rollup constants it was built with and the system clock, so it is safe to use on a node with no L1
 * connection. `EpochCache` extends it with the committee lookups that do read L1.
 *
 * Note: like `EpochCache`, this is very dependent on the system clock being in sync.
 */
export class EpochSlotMath<TConstants extends L1RollupConstants = L1RollupConstants> implements EpochSlotMathInterface {
  constructor(
    protected readonly l1constants: TConstants,
    protected readonly dateProvider: DateProvider = new DateProvider(),
  ) {}

  public getL1Constants(): L1RollupConstants {
    return this.l1constants;
  }

  public getSlotNow(): SlotNumber {
    return this.getEpochAndSlotNow().slot;
  }

  public getTargetSlot(): SlotNumber {
    return SlotNumber(this.getSlotNow() + PROPOSER_PIPELINING_SLOT_OFFSET);
  }

  public getEpochNow(): EpochNumber {
    return this.getEpochAndSlotNow().epoch;
  }

  public getTargetEpoch(): EpochNumber {
    return getEpochAtSlot(this.getTargetSlot(), this.l1constants);
  }

  public getEpochAndSlotNow(): EpochAndSlot & { nowMs: bigint } {
    const nowMs = BigInt(this.dateProvider.now());
    const nowSeconds = nowMs / 1000n;
    return { ...this.getEpochAndSlotAtTimestamp(nowSeconds), nowMs };
  }

  public getEpochAndSlotInNextL1Slot(): EpochAndSlot & { nowSeconds: bigint } {
    const nowSeconds = this.dateProvider.nowInSeconds();
    const nextSlotTs = getNextL1SlotTimestamp(nowSeconds, this.l1constants);
    return { ...this.getEpochAndSlotAtTimestamp(nextSlotTs), nowSeconds: BigInt(nowSeconds) };
  }

  public getTargetEpochAndSlotInNextL1Slot(): EpochAndSlot & { nowSeconds: bigint } {
    const result = this.getEpochAndSlotInNextL1Slot();
    const targetSlot = SlotNumber(result.slot + PROPOSER_PIPELINING_SLOT_OFFSET);
    return { ...result, slot: targetSlot, epoch: getEpochAtSlot(targetSlot, this.l1constants) };
  }

  /** Returns the current and next L2 slot in next eth L1 Slot. */
  public getCurrentAndNextSlot(): { currentSlot: SlotNumber; nextSlot: SlotNumber } {
    const currentSlot = this.getSlotNow();
    const next = this.getEpochAndSlotInNextL1Slot();

    return {
      currentSlot,
      nextSlot: next.slot,
    };
  }

  /** Returns the target and next L2 slot in the next L1 slot. */
  public getTargetAndNextSlot(): { targetSlot: SlotNumber; nextSlot: SlotNumber } {
    const nowSeconds = BigInt(this.dateProvider.nowInSeconds());
    const offset = PROPOSER_PIPELINING_SLOT_OFFSET;

    const currentSlot = getSlotAtTimestamp(nowSeconds, this.l1constants);
    const targetSlot = SlotNumber(currentSlot + offset);

    const nextL2SlotOnL1 = getSlotAtNextL1Block(nowSeconds, this.l1constants);
    const nextSlot = SlotNumber(nextL2SlotOnL1 + offset);

    return { targetSlot, nextSlot };
  }

  protected getEpochAndSlotAtSlot(slot: SlotNumber): EpochAndSlot {
    return this.getEpochAndSlotAtTimestamp(getTimestampForSlot(slot, this.l1constants));
  }

  protected getEpochAndSlotAtTimestamp(ts: bigint): EpochAndSlot {
    const slot = getSlotAtTimestamp(ts, this.l1constants);
    const epoch = getEpochNumberAtTimestamp(ts, this.l1constants);
    return {
      slot,
      epoch,
      ts: getTimestampForSlot(slot, this.l1constants),
    };
  }
}
