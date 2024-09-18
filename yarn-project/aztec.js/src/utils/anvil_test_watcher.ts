import { type DebugLogger, type EthCheatCodes, createDebugLogger } from '@aztec/aztec.js';
import { type EthAddress } from '@aztec/circuits.js';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { RollupAbi } from '@aztec/l1-artifacts';

import { type GetContractReturnType, type HttpTransport, type PublicClient, getAddress, getContract } from 'viem';
import type * as chains from 'viem/chains';

/**
 * Represents a watcher for a rollup contract.
 *
 * It started on a network like anvil where time traveling is allowed, and auto-mine is turned on
 * it will periodically check if the current slot have already been filled, e.g., there was an L2
 * block within the slot. And if so, it will time travel into the next slot.
 */
export class AnvilTestWatcher {
  private rollup: GetContractReturnType<typeof RollupAbi, PublicClient<HttpTransport, chains.Chain>>;

  private filledRunningPromise?: RunningPromise;

  private logger: DebugLogger = createDebugLogger(`aztec:utils:watcher`);

  constructor(
    private cheatcodes: EthCheatCodes,
    rollupAddress: EthAddress,
    publicClient: PublicClient<HttpTransport, chains.Chain>,
  ) {
    this.rollup = getContract({
      address: getAddress(rollupAddress.toString()),
      abi: RollupAbi,
      client: publicClient,
    });

    this.logger.info(`Watcher created for rollup at ${rollupAddress}`);
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
      this.filledRunningPromise = new RunningPromise(() => this.mineIfSlotFilled(), 1000);
      this.filledRunningPromise.start();
      this.logger.info(`Watcher started`);
    } else {
      this.logger.info(`Watcher not started because not auto mining`);
    }
  }

  async stop() {
    await this.filledRunningPromise?.stop();
  }

  async mineIfSlotFilled() {
    try {
      const currentSlot = await this.rollup.read.getCurrentSlot();
      const pendingBlockNumber = BigInt(await this.rollup.read.getPendingBlockNumber());
      const [, , lastSlotNumber] = await this.rollup.read.blocks([pendingBlockNumber]);

      if (currentSlot === lastSlotNumber) {
        // We should jump to the next slot
        const timestamp = await this.rollup.read.getTimestampForSlot([currentSlot + 1n]);
        try {
          await this.cheatcodes.warp(Number(timestamp));
        } catch (e) {
          this.logger.error(`Failed to warp to timestamp ${timestamp}: ${e}`);
        }

        this.logger.info(`Slot ${currentSlot} was filled, jumped to next slot`);
      }
    } catch (err) {
      this.logger.error('mineIfSlotFilled failed');
    }
  }
}
