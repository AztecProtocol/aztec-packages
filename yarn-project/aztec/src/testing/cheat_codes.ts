import { EthCheatCodes, RollupCheatCodes } from '@aztec/ethereum/test';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { createLogger } from '@aztec/foundation/log';
import type { DateProvider } from '@aztec/foundation/timer';
import type { AztecNode, AztecNodeDebug } from '@aztec/stdlib/interfaces/client';

/**
 * A class that provides utility functions for interacting with the chain.
 * @deprecated There used to be 3 kinds of cheat codes: eth, rollup and aztec. We have nuked the Aztec ones because
 * they became unused (we now have better testing tools). If you are introducing a new functionality to the cheat
 * codes, please consider whether it makes sense to just introduce new utils in your tests instead.
 */
export class CheatCodes {
  private logger = createLogger('aztecjs:cheat_codes');

  constructor(
    /** Cheat codes for L1.*/
    public eth: EthCheatCodes,
    /** Cheat codes for the Aztec Rollup contract on L1. */
    public rollup: RollupCheatCodes,
  ) {}

  static async create(rpcUrls: string[], node: AztecNode, dateProvider: DateProvider): Promise<CheatCodes> {
    const ethCheatCodes = new EthCheatCodes(rpcUrls, dateProvider);
    const rollupCheatCodes = new RollupCheatCodes(
      ethCheatCodes,
      await node.getNodeInfo().then(n => n.l1ContractAddresses),
    );
    return new CheatCodes(ethCheatCodes, rollupCheatCodes);
  }

  /**
   * Warps the L1 timestamp to a target timestamp and mines an L2 block that advances the L2 timestamp to at least
   * the target timestamp. If the target timestamp falls within the current L2 slot (which already has a block),
   * the timestamp is automatically adjusted forward to the start of the next slot so that `mineBlock()` succeeds.
   * @param node - The Aztec node used to force an empty block to be mined.
   * @param targetTimestamp - The target timestamp to warp to (in seconds)
   */
  async warpL2TimeAtLeastTo(node: AztecNodeDebug, targetTimestamp: bigint | number) {
    const targetBigInt = BigInt(targetTimestamp);
    const currentTimestamp = BigInt(await this.eth.lastBlockTimestamp());

    if (targetBigInt <= currentTimestamp) {
      throw new Error(
        `warpL2TimeAtLeastTo: target timestamp ${targetBigInt} is not in the future (current L1 timestamp is ${currentTimestamp}).`,
      );
    }

    const currentSlot = await this.rollup.getSlot();
    const targetSlot = await this.rollup.getSlotAt(targetBigInt);

    let effectiveTimestamp = targetBigInt;

    if (targetSlot <= currentSlot) {
      // Target lands in the same (or earlier) slot — auto-adjust to the next slot's start.
      const nextSlot = SlotNumber(currentSlot + 1);
      const nextSlotTimestamp = await this.rollup.getTimestampForSlot(nextSlot);
      this.logger.warn(
        `warpL2TimeAtLeastTo: target timestamp ${targetBigInt} falls in current slot ${currentSlot}. ` +
          `Auto-adjusting to start of slot ${nextSlot} at timestamp ${nextSlotTimestamp}.`,
      );
      effectiveTimestamp = nextSlotTimestamp;
    }

    await this.eth.warp(effectiveTimestamp, { resetBlockInterval: true });
    await node.mineBlock();
  }

  /**
   * Warps the L1 timestamp forward by a specified duration and mines an L2 block that advances the L2 timestamp at
   * least by the duration. If the duration is too short to cross an L2 slot boundary, the warp is automatically
   * extended to the start of the next slot so that `mineBlock()` succeeds.
   * @param node - The Aztec node used to force an empty block to be mined.
   * @param duration - The duration to advance time by (in seconds)
   */
  async warpL2TimeAtLeastBy(node: AztecNodeDebug, duration: bigint | number) {
    if (BigInt(duration) <= 0n) {
      throw new Error(`warpL2TimeAtLeastBy: duration must be positive, got ${duration} seconds.`);
    }

    const currentTimestamp = await this.eth.lastBlockTimestamp();
    const targetTimestamp = BigInt(currentTimestamp) + BigInt(duration);
    await this.warpL2TimeAtLeastTo(node, targetTimestamp);
  }
}
