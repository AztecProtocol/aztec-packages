import { EthCheatCodes, RollupCheatCodes } from '@aztec/ethereum/test';
import type { PXE } from '@aztec/stdlib/interfaces/client';

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
}
