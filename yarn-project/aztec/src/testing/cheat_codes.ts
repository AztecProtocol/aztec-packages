import { EthCheatCodes, RollupCheatCodes } from '@aztec/ethereum/test';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { createLogger } from '@aztec/foundation/log';
import type { DateProvider } from '@aztec/foundation/timer';
import type { AutomineSequencer } from '@aztec/sequencer-client/automine';
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
    /** When wired, redirects time-warps through the AutomineSequencer queue (test-only). */
    private automine?: AutomineSequencer,
  ) {}

  static async create(
    rpcUrls: string[],
    node: AztecNode,
    dateProvider: DateProvider,
    automine?: AutomineSequencer,
  ): Promise<CheatCodes> {
    const ethCheatCodes = new EthCheatCodes(rpcUrls, dateProvider);
    const rollupCheatCodes = new RollupCheatCodes(
      ethCheatCodes,
      await node.getNodeInfo().then(n => n.l1ContractAddresses),
    );
    return new CheatCodes(ethCheatCodes, rollupCheatCodes, automine);
  }

  /**
   * Warps the L1 timestamp to a target timestamp and mines an L2 block that advances the L2 timestamp to at least
   * the target timestamp. If the target timestamp falls within the current L2 slot (which already has a block),
   * the timestamp is automatically adjusted forward to the start of the next slot so that `mineBlock()` succeeds.
   * @param node - The Aztec node used to force an empty block to be mined.
   * @param targetTimestamp - The target timestamp to warp to (in seconds)
   */
  async warpL2TimeAtLeastTo(node: AztecNode & AztecNodeDebug, targetTimestamp: bigint | number) {
    const targetBigInt = BigInt(targetTimestamp);
    const currentTimestamp = BigInt(await this.eth.lastBlockTimestamp());

    if (targetBigInt <= currentTimestamp) {
      throw new Error(
        `warpL2TimeAtLeastTo: target timestamp ${targetBigInt} is not in the future (current L1 timestamp is ${currentTimestamp}).`,
      );
    }

    // AutomineSequencer owns time control through its serial queue — delegate to keep warps atomic
    // with respect to any in-flight build, and avoid the mineBlock-loop hack below.
    // `warpTo` internally builds an empty L2 checkpoint, which auto-mines exactly one L1 block at
    // the target slot boundary, so no separate `node.mineBlock()` is needed here.
    if (this.automine) {
      await this.automine.warpTo(Number(targetBigInt));
      return;
    }

    const currentSlot = await this.rollup.getSlot();
    let effectiveTargetSlot = await this.rollup.getSlotAt(targetBigInt);
    let effectiveTimestamp = await this.rollup.getTimestampForSlot(effectiveTargetSlot);

    if (effectiveTimestamp < targetBigInt || effectiveTargetSlot <= currentSlot) {
      const adjustedSlot = SlotNumber(Math.max(effectiveTargetSlot + 1, currentSlot + 1));
      const adjustedTimestamp = await this.rollup.getTimestampForSlot(adjustedSlot);
      this.logger.warn(
        `warpL2TimeAtLeastTo: target timestamp ${targetBigInt} does not align with a future L2 slot boundary. ` +
          `Auto-adjusting to start of slot ${adjustedSlot} at timestamp ${adjustedTimestamp}.`,
      );
      effectiveTimestamp = adjustedTimestamp;
      effectiveTargetSlot = adjustedSlot;
    }

    await this.eth.warp(effectiveTimestamp, { resetBlockInterval: true });

    // The sequencer's polling loop may have a `work()` cycle in flight that captured pre-warp slot/timestamp values
    // just before our warp landed. That cycle would mine an L2 block at the stale slot — the L1 sync prunes such a
    // block from the canonical chain, but it lingers in local world state and the PXE will use it as the anchor for
    // subsequent txs, leading to `expiration_timestamp` values that are already in the past relative to L1. Mine
    // until we observe an L2 block at (or past) the post-warp slot, ensuring the next tx anchors to a fresh block.
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await node.mineBlock();
      const blockData = await node.getBlockData('latest');
      const blockSlot = blockData?.header.globalVariables.slotNumber;
      if (blockSlot !== undefined && BigInt(blockSlot) >= BigInt(effectiveTargetSlot)) {
        return;
      }
      this.logger.warn(
        `warpL2TimeAtLeastTo: mined L2 block at slot ${blockSlot}, expected at least ${effectiveTargetSlot}. ` +
          `Retrying mineBlock (attempt ${attempt}/${maxAttempts}).`,
      );
    }
    throw new Error(
      `warpL2TimeAtLeastTo: failed to mine an L2 block at or past slot ${effectiveTargetSlot} after ${maxAttempts} attempts.`,
    );
  }

  /**
   * Warps the L1 timestamp forward by a specified duration and mines an L2 block that advances the L2 timestamp at
   * least by the duration. If the duration is too short to cross an L2 slot boundary, the warp is automatically
   * extended to the start of the next slot so that `mineBlock()` succeeds.
   * @param node - The Aztec node used to force an empty block to be mined.
   * @param duration - The duration to advance time by (in seconds)
   */
  async warpL2TimeAtLeastBy(node: AztecNode & AztecNodeDebug, duration: bigint | number) {
    if (BigInt(duration) <= 0n) {
      throw new Error(`warpL2TimeAtLeastBy: duration must be positive, got ${duration} seconds.`);
    }

    // Advance relative to whichever clock leads. A live sequencer mines L2 blocks at slot boundaries that can run
    // ahead of anvil's L1 timestamp, so basing the target on L1 alone would advance the L2 timestamp by less than
    // `duration`. Anchoring to the latest L2 block timestamp when it leads guarantees the post-warp L2 block is at
    // least `duration` ahead of the current one.
    const currentL1Timestamp = BigInt(await this.eth.lastBlockTimestamp());
    const latestBlockData = await node.getBlockData('latest');
    const latestL2Timestamp = latestBlockData ? BigInt(latestBlockData.header.globalVariables.timestamp) : 0n;
    const baseTimestamp = latestL2Timestamp > currentL1Timestamp ? latestL2Timestamp : currentL1Timestamp;
    const targetTimestamp = baseTimestamp + BigInt(duration);
    await this.warpL2TimeAtLeastTo(node, targetTimestamp);
  }
}
