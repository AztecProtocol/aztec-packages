import type { ViemClient } from '@aztec/ethereum';
import type { EthCheatCodes } from '@aztec/ethereum/eth-cheatcodes';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import type { TestDateProvider } from '@aztec/foundation/timer';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';

import { type GetContractReturnType, getAddress, getContract } from 'viem';

import { RollupCheatCodes } from './rollup_cheat_codes.js';

/**
 * Represents a watcher for a rollup contract.
 *
 * It started on a network like anvil where time traveling is allowed, and auto-mine is turned on
 * it will periodically check if the current slot have already been filled, e.g., there was an L2
 * block within the slot. And if so, it will time travel into the next slot.
 */
export class AnvilTestWatcher {
  private isSandbox: boolean = false;

  private rollup: GetContractReturnType<typeof RollupAbi, ViemClient>;
  private rollupCheatCodes: RollupCheatCodes;

  private filledRunningPromise?: RunningPromise;
  private mineIfOutdatedPromise?: RunningPromise;
  private markingAsProvenRunningPromise?: RunningPromise;

  private logger: Logger = createLogger(`aztecjs:utils:watcher`);

  private isMarkingAsProven = true;

  constructor(
    private cheatcodes: EthCheatCodes,
    rollupAddress: EthAddress,
    l1Client: ViemClient,
    private dateProvider?: TestDateProvider,
  ) {
    this.rollup = getContract({
      address: getAddress(rollupAddress.toString()),
      abi: RollupAbi,
      client: l1Client,
    });

    this.rollupCheatCodes = new RollupCheatCodes(this.cheatcodes, {
      rollupAddress,
    });

    this.logger.debug(`Watcher created for rollup at ${rollupAddress}`);
  }

  setIsMarkingAsProven(isMarkingAsProven: boolean) {
    this.isMarkingAsProven = isMarkingAsProven;
  }

  setIsSandbox(isSandbox: boolean) {
    this.isSandbox = isSandbox;
  }

  async start() {
    if (this.filledRunningPromise) {
      throw new Error('Watcher already watching for filled slot');
    }

    // If auto mining is not supported (e.g., we are on a real network), then we
    // will simple do nothing. But if on an anvil or the like, this make sure that
    // the sandbox and tests don't break because time is frozen and we never get to
    // the next slot.
    const isAutoMining = await this.cheatcodes.isAutoMining();

    if (isAutoMining) {
      this.filledRunningPromise = new RunningPromise(() => this.warpTimeIfNeeded(), this.logger, 200);
      this.filledRunningPromise.start();
      this.mineIfOutdatedPromise = new RunningPromise(() => this.mineIfOutdated(), this.logger, 200);
      this.mineIfOutdatedPromise.start();
      this.markingAsProvenRunningPromise = new RunningPromise(() => this.markAsProven(), this.logger, 200);
      this.markingAsProvenRunningPromise.start();
      this.logger.info(`Watcher started for rollup at ${this.rollup.address}`);
    } else {
      this.logger.info(`Watcher not started because not auto mining`);
    }
  }

  async stop() {
    await this.filledRunningPromise?.stop();
    await this.mineIfOutdatedPromise?.stop();
    await this.markingAsProvenRunningPromise?.stop();
  }

  async trigger() {
    await this.filledRunningPromise?.trigger();
    await this.mineIfOutdatedPromise?.trigger();
    await this.markingAsProvenRunningPromise?.trigger();
  }

  async markAsProven() {
    if (!this.isMarkingAsProven) {
      return;
    }
    await this.rollupCheatCodes.markAsProven();
  }

  async mineIfOutdated() {
    // this doesn't apply to the sandbox, because we don't have a date provider in the sandbox
    if (!this.dateProvider) {
      return;
    }

    const l1Time = (await this.cheatcodes.timestamp()) * 1000;
    const wallTime = this.dateProvider.now();

    // If the wall time is more than 24 seconds away from L1 time,
    // mine a block and sync the clocks
    if (Math.abs(wallTime - l1Time) > 24 * 1000) {
      this.logger.warn(`Wall time is more than 24 seconds away from L1 time, mining a block and syncing clocks`);
      await this.cheatcodes.evmMine();
      const newL1Time = await this.cheatcodes.timestamp();
      this.logger.info(`New L1 time: ${newL1Time}`);
      this.dateProvider.setTime(newL1Time * 1000);
    }
  }

  async warpTimeIfNeeded() {
    try {
      const currentSlot = await this.rollup.read.getCurrentSlot();
      const pendingBlockNumber = BigInt(await this.rollup.read.getPendingBlockNumber());
      const blockLog = await this.rollup.read.getBlock([pendingBlockNumber]);
      const nextSlotTimestamp = Number(await this.rollup.read.getTimestampForSlot([currentSlot + 1n]));

      if (currentSlot === blockLog.slotNumber) {
        // We should jump to the next slot
        try {
          await this.cheatcodes.warp(nextSlotTimestamp);
          this.dateProvider?.setTime(nextSlotTimestamp * 1000);
        } catch (e) {
          this.logger.error(`Failed to warp to timestamp ${nextSlotTimestamp}: ${e}`);
        }

        this.logger.info(`Slot ${currentSlot} was filled, jumped to next slot`);
        return;
      }

      // If we are not in sandbox, we don't need to warp time
      if (!this.isSandbox) {
        return;
      }

      const currentTimestamp = this.dateProvider?.now() ?? Date.now();
      if (currentTimestamp > nextSlotTimestamp * 1000) {
        try {
          await this.cheatcodes.warp(nextSlotTimestamp);
          this.dateProvider?.setTime(nextSlotTimestamp * 1000);
        } catch (e) {
          this.logger.error(`Failed to warp to timestamp ${nextSlotTimestamp}: ${e}`);
        }

        this.logger.info(`Slot ${currentSlot} was missed, jumped to next slot`);
      }
    } catch {
      this.logger.error('mineIfSlotFilled failed');
    }
  }
}
