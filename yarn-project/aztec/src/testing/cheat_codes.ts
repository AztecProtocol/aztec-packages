import { EthCheatCodes, RollupCheatCodes } from '@aztec/ethereum/test';
import type { DateProvider } from '@aztec/foundation/timer';
import type { AztecNode, AztecNodeDebug } from '@aztec/stdlib/interfaces/client';

/**
 * A class that provides utility functions for interacting with the chain.
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
   * Warps the L1 timestamp to at least `targetTimestamp` and mines an L2 block advancing the L2 timestamp to at least
   * the target. Forwards to the node's debug API, which serializes the warp through the automine sequencer queue.
   * @param node - The Aztec node whose debug API performs the warp. Must run an automine sequencer.
   * @param targetTimestamp - The target timestamp to warp to (in seconds).
   * @deprecated Call `node.warpL2TimeAtLeastTo(targetTimestamp)` on the node debug API directly.
   */
  warpL2TimeAtLeastTo(node: AztecNode & AztecNodeDebug, targetTimestamp: bigint | number): Promise<void> {
    return node.warpL2TimeAtLeastTo(Number(targetTimestamp));
  }

  /**
   * Warps the L1 timestamp forward by at least `duration` seconds and mines an L2 block advancing the L2 timestamp at
   * least by the duration. Forwards to the node's debug API, which serializes the warp through the automine sequencer
   * queue.
   * @param node - The Aztec node whose debug API performs the warp. Must run an automine sequencer.
   * @param duration - The duration to advance time by (in seconds).
   * @deprecated Call `node.warpL2TimeAtLeastBy(duration)` on the node debug API directly.
   */
  warpL2TimeAtLeastBy(node: AztecNode & AztecNodeDebug, duration: bigint | number): Promise<void> {
    return node.warpL2TimeAtLeastBy(Number(duration));
  }
}
