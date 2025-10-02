import { retryUntil } from '@aztec/aztec.js';
import { EthCheatCodes, RollupCheatCodes } from '@aztec/ethereum/test';
import type { DateProvider } from '@aztec/foundation/timer';
import type { SequencerClient } from '@aztec/sequencer-client';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

/**
 * A class that provides utility functions for interacting with the chain.
 * @deprecated There used to be 3 kinds of cheat codes: eth, rollup and aztec. We have nuked the Aztec ones because
 * they became unused (we now have better testing tools). If you are introducing a new functionality to the cheat
 * codes, please consider whether it makes sense to just introduce new utils in your tests instead.
 */
export class CheatCodes {
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
   * the target timestamp. L2 timestamp is not advanced exactly to the target timestamp because it is determined
   * by the slot number, which advances in fixed intervals.
   * This is useful for testing time-dependent contract behavior.
   * @param sequencerClient - The sequencer client to use to force an empty block to be mined.
   * @param node - The Aztec node used to query if a new block has been mined.
   * @param targetTimestamp - The target timestamp to warp to (in seconds)
   */
  async warpL2TimeAtLeastTo(sequencerClient: SequencerClient, node: AztecNode, targetTimestamp: bigint | number) {
    const currentL2BlockNumber = await node.getBlockNumber();

    // We warp the L1 timestamp
    await this.eth.warp(targetTimestamp, { resetBlockInterval: true });

    // Wait until an L2 block is mined
    const sequencer = sequencerClient.getSequencer();
    const minTxsPerBlock = sequencer.getConfig().minTxsPerBlock;
    sequencer.updateConfig({ minTxsPerBlock: 0 });

    await retryUntil(
      async () => {
        const newL2BlockNumber = await node.getBlockNumber();
        return newL2BlockNumber > currentL2BlockNumber;
      },
      'new block after warping L2 time',
      36,
      1,
    );

    // Restore original minTxsPerBlock
    sequencer.updateConfig({ minTxsPerBlock });
  }

  /**
   * Warps the L1 timestamp forward by a specified duration and mines an L2 block that advances the L2 timestamp at
   * least by the duration. L2 timestamp is not advanced exactly by the duration because it is determined by the slot
   * number, which advances in fixed intervals.
   * This is useful for testing time-dependent contract behavior.
   * @param sequencerClient - The sequencer client to use to force an empty block to be mined.
   * @param node - The Aztec node used to query if a new block has been mined.
   * @param duration - The duration to advance time by (in seconds)
   */
  async warpL2TimeAtLeastBy(sequencerClient: SequencerClient, node: AztecNode, duration: bigint | number) {
    const currentTimestamp = await this.eth.timestamp();
    const targetTimestamp = BigInt(currentTimestamp) + BigInt(duration);
    await this.warpL2TimeAtLeastTo(sequencerClient, node, targetTimestamp);
  }
}
