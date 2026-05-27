import { EthCheatCodes, RollupCheatCodes } from '@aztec/ethereum/test';
import type { ViemClient } from '@aztec/ethereum/types';
import { SlotNumber } from '@aztec/foundation/branded-types';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import type { TestDateProvider } from '@aztec/foundation/timer';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';

import { type GetContractReturnType, getAddress, getContract } from 'viem';

export type AnvilTestWatcherOpts = {
  isLocalNetwork?: boolean;
  isMarkingAsProven?: boolean;
};

/**
 * Represents a watcher for a rollup contract.
 *
 * It started on a network like anvil where time traveling is allowed, and auto-mine is turned on
 * it will periodically check if the current slot have already been filled, e.g., there was an L2
 * block within the slot. And if so, it will time travel into the next slot.
 */
export class AnvilTestWatcher {
  private isLocalNetwork;
  private isMarkingAsProven;

  private rollup: GetContractReturnType<typeof RollupAbi, ViemClient>;
  private rollupCheatCodes: RollupCheatCodes;
  private l2SlotDuration!: number;

  private filledRunningPromise?: RunningPromise;
  private syncDateProviderPromise?: RunningPromise;
  private markingAsProvenRunningPromise?: RunningPromise;

  private logger: Logger = createLogger(`aztecjs:utils:watcher`);

  // Optional callback to check if there are pending txs in the mempool.
  private getPendingTxCount?: () => Promise<number>;

  // Optional callback to check if the sequencer is actively building a block.
  private isSequencerBuilding?: () => boolean;

  // Tracks when we first observed the current unfilled slot with pending txs (real wall time).
  private unfilledSlotFirstSeen?: { slot: number; realTime: number };

  // Latest target slot for which the proposer has built a block destined for L1 but which has
  // not yet been committed. Set by the proposer-pipelining hook from `block-proposed` events so
  // the watcher can advance L1 (and the injected date provider) to the target slot ahead of the
  // publisher's `sendRequestsAt` sleep, instead of waiting a full wall-clock slot.
  private proposedTargetSlot?: number;

  constructor(
    private cheatcodes: EthCheatCodes,
    rollupAddress: EthAddress,
    l1Client: ViemClient,
    private dateProvider?: TestDateProvider,
    opts: AnvilTestWatcherOpts = {},
  ) {
    this.rollup = getContract({
      address: getAddress(rollupAddress.toString()),
      abi: RollupAbi,
      client: l1Client,
    });

    this.rollupCheatCodes = new RollupCheatCodes(this.cheatcodes, {
      rollupAddress,
    });

    this.isLocalNetwork = opts.isLocalNetwork ?? false;
    this.isMarkingAsProven = opts.isMarkingAsProven ?? true;

    this.logger.debug(`Watcher created for rollup at ${rollupAddress}`);
  }

  setIsMarkingAsProven(isMarkingAsProven: boolean) {
    this.logger.warn(`Watcher is now ${isMarkingAsProven ? 'marking' : 'not marking'} blocks as proven`);
    this.isMarkingAsProven = isMarkingAsProven;
  }

  setisLocalNetwork(isLocalNetwork: boolean) {
    this.isLocalNetwork = isLocalNetwork;
  }

  /** Sets a callback to check for pending txs, used to skip unfilled slots faster when txs are waiting. */
  setGetPendingTxCount(fn: () => Promise<number>) {
    this.getPendingTxCount = fn;
  }

  /** Sets a callback to check if the sequencer is actively building, to avoid warping while it works. */
  setIsSequencerBuilding(fn: () => boolean) {
    this.isSequencerBuilding = fn;
  }

  /**
   * Records the target slot for which the proposer has built a block destined for L1. Used by
   * the local-network watcher to fast-forward L1 (and the injected date provider) ahead of the
   * pipelined publisher's `sendRequestsAt` sleep so it ends promptly instead of waiting a full
   * wall-clock slot. Only ratchets up — late warps for stale slots are no-ops.
   */
  setProposedTargetSlot(slot: number) {
    if (this.proposedTargetSlot === undefined || slot > this.proposedTargetSlot) {
      this.proposedTargetSlot = slot;
    }
  }

  async start() {
    if (this.filledRunningPromise) {
      throw new Error('Watcher already watching for filled slot');
    }

    const config = await this.rollupCheatCodes.getConfig();
    this.l2SlotDuration = config.slotDuration;

    // If auto mining is not supported (e.g., we are on a real network), then we
    // will simple do nothing. But if on an anvil or the like, this make sure that
    // the local network and tests don't break because time is frozen and we never get to
    // the next slot.
    const isAutoMining = await this.cheatcodes.isAutoMining();

    if (isAutoMining) {
      this.filledRunningPromise = new RunningPromise(() => this.warpTimeIfNeeded(), this.logger, 200);
      this.filledRunningPromise.start();
      this.syncDateProviderPromise = new RunningPromise(() => this.syncDateProviderToL1IfBehind(), this.logger, 200);
      this.syncDateProviderPromise.start();
      this.markingAsProvenRunningPromise = new RunningPromise(() => this.markAsProven(), this.logger, 200);
      this.markingAsProvenRunningPromise.start();
      this.logger.info(`Watcher started for rollup at ${this.rollup.address}`);
    } else {
      this.logger.info(`Watcher not started because not auto mining`);
    }
  }

  async stop() {
    await this.filledRunningPromise?.stop();
    await this.syncDateProviderPromise?.stop();
    await this.markingAsProvenRunningPromise?.stop();
  }

  async trigger() {
    await this.filledRunningPromise?.trigger();
    await this.syncDateProviderPromise?.trigger();
    await this.markingAsProvenRunningPromise?.trigger();
  }

  async markAsProven() {
    if (!this.isMarkingAsProven) {
      return;
    }
    await this.rollupCheatCodes.markAsProven();
  }

  async syncDateProviderToL1IfBehind() {
    // this doesn't apply to the local network, because we don't have a date provider in the local network
    if (!this.dateProvider) {
      return;
    }

    const l1Time = (await this.cheatcodes.lastBlockTimestamp()) * 1000;
    const wallTime = this.dateProvider.now();
    if (l1Time > wallTime) {
      this.logger.warn(`L1 is ahead of wall time. Syncing wall time to L1 time`);
      this.dateProvider.setTime(l1Time);
    } else if (l1Time + Number(this.l2SlotDuration) * 1000 < wallTime) {
      // Warp L1 to the slot boundary at-or-before wall time. Rounding to a slot boundary (rather than
      // `ceil(wallTime / 1000)`) keeps this loop's target aligned with `warpTimeIfNeeded`'s
      // `nextSlotTimestamp` target, avoiding a race where the two loops pick timestamps a fraction of
      // a second apart and one of them is then rejected by anvil as non-monotonic.
      const wallSec = Math.floor(wallTime / 1000);
      const targetSlot = await this.rollup.read.getSlotAt([BigInt(wallSec)]);
      const targetTimestamp = Number(await this.rollup.read.getTimestampForSlot([targetSlot]));
      this.logger.warn(`L1 is more than 1 L2 slot behind wall time. Warping to slot ${targetSlot} boundary`);
      await this.warpToTimestamp(targetTimestamp);
    }
  }

  async warpTimeIfNeeded() {
    try {
      const currentSlot = SlotNumber.fromBigInt(await this.rollup.read.getCurrentSlot());
      const pendingCheckpointNumber = await this.rollup.read.getPendingCheckpointNumber();
      const checkpointLog = await this.rollup.read.getCheckpoint([pendingCheckpointNumber]);
      const nextSlot = SlotNumber(currentSlot + 1);
      const nextSlotTimestamp = Number(await this.rollup.read.getTimestampForSlot([BigInt(nextSlot)]));

      if (BigInt(currentSlot) === checkpointLog.slotNumber) {
        // The current slot has been filled, we should jump to the next slot.
        if (await this.warpToTimestamp(nextSlotTimestamp)) {
          this.logger.info(`Slot ${currentSlot} was filled, jumped to next slot`);
        }
        return;
      }

      // If we are not in local network, we don't need to warp time
      if (!this.isLocalNetwork) {
        return;
      }

      // Pipelined-publish shortcut: if the proposer has built a block destined for a slot
      // beyond the current L1 slot, fast-forward L1 to that slot's timestamp so the publisher's
      // `sendRequestsAt(targetSlot)` sleep ends and the multicall mines inside the target slot.
      // Without this, the publisher waits up to a full real-time slot for wall clock to catch up.
      if (this.proposedTargetSlot !== undefined && this.proposedTargetSlot > currentSlot) {
        const targetSlotTimestamp = Number(
          await this.rollup.read.getTimestampForSlot([BigInt(this.proposedTargetSlot)]),
        );
        if (await this.warpToTimestamp(targetSlotTimestamp)) {
          this.logger.info(`Warped L1 to target slot ${this.proposedTargetSlot} for pipelined publish`);
        }
        return;
      }

      // If there are pending txs and the sequencer missed them, warp quickly (after a 2s real-time debounce) so the
      // sequencer can retry in the next slot. Without this, we'd have to wait a full real-time slot duration (~36s) for
      // the dateProvider to catch up to the next slot timestamp. We skip the warp if the sequencer is actively building
      // to avoid invalidating its in-progress work.
      if (this.getPendingTxCount) {
        const pendingTxs = await this.getPendingTxCount();
        if (pendingTxs > 0) {
          if (this.isSequencerBuilding?.()) {
            this.unfilledSlotFirstSeen = undefined;
            return;
          }

          const realNow = Date.now();
          if (!this.unfilledSlotFirstSeen || this.unfilledSlotFirstSeen.slot !== currentSlot) {
            this.unfilledSlotFirstSeen = { slot: currentSlot, realTime: realNow };
            return;
          }

          if (realNow - this.unfilledSlotFirstSeen.realTime > 2000) {
            if (await this.warpToTimestamp(nextSlotTimestamp)) {
              this.logger.info(`Slot ${currentSlot} was missed with pending txs, jumped to next slot`);
            }
            this.unfilledSlotFirstSeen = undefined;
          }

          return;
        }
      }

      // Fallback: warp when the dateProvider time has passed the next slot timestamp.
      const currentTimestamp = this.dateProvider?.now() ?? Date.now();
      if (currentTimestamp > nextSlotTimestamp * 1000) {
        if (await this.warpToTimestamp(nextSlotTimestamp)) {
          this.logger.info(`Slot ${currentSlot} was missed, jumped to next slot`);
        }
      }
    } catch {
      this.logger.error('mineIfSlotFilled failed');
    }
  }

  /**
   * Warps L1 to `timestamp`, unless L1 is already at or past it. Returns true when a warp actually
   * happened, false when skipped or on error. Callers use the return value to gate success logs.
   */
  private async warpToTimestamp(timestamp: number): Promise<boolean> {
    try {
      // Anvil rejects evm_setNextBlockTimestamp values <= the current block's timestamp. The two
      // watcher loops can race and pick targets a fraction of a second apart; skip here rather than
      // letting the second one error out noisily.
      const lastTimestamp = await this.cheatcodes.lastBlockTimestamp();
      if (timestamp <= lastTimestamp) {
        return false;
      }
      await this.cheatcodes.warp(timestamp, { resetBlockInterval: true });
      return true;
    } catch (e) {
      this.logger.error(`Failed to warp to timestamp ${timestamp}: ${e}`);
      return false;
    }
  }
}
