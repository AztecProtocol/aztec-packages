import { EthCheatCodes, RollupCheatCodes } from '@aztec/ethereum/test';
import { sleep } from '@aztec/foundation/sleep';
import type { SequencerClient } from '@aztec/sequencer-client';
import type { AztecNode, PXE } from '@aztec/stdlib/interfaces/client';

import { AztecCheatCodes } from './aztec_cheat_codes.js';

/**
 * A class that provides utility functions for interacting with the chain.
 */
export class CheatCodes {
  constructor(
    /** Cheat codes for L1.*/
    public eth: EthCheatCodes,
    /** Cheat codes for Aztec L2. */
    public aztec: AztecCheatCodes,
    /** Cheat codes for the Aztec Rollup contract on L1. */
    public rollup: RollupCheatCodes,
  ) {}

  static async create(rpcUrls: string[], pxe: PXE): Promise<CheatCodes> {
    const ethCheatCodes = new EthCheatCodes(rpcUrls);
    const aztecCheatCodes = new AztecCheatCodes(pxe);
    const rollupCheatCodes = new RollupCheatCodes(
      ethCheatCodes,
      await pxe.getNodeInfo().then(n => n.l1ContractAddresses),
    );
    return new CheatCodes(ethCheatCodes, aztecCheatCodes, rollupCheatCodes);
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

    // Force an empty block to be mined by "flushing" the sequencer.
    sequencerClient.getSequencer().flush();

    // Wait for a new block to be mined by polling the node
    while ((await node.getBlockNumber()) === currentL2BlockNumber) {
      await sleep(2000);
    }
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
