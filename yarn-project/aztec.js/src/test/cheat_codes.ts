import { EthCheatCodes } from '@aztec/ethereum/eth-cheatcodes';
import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import type { PXE } from '@aztec/stdlib/interfaces/client';

import { AztecCheatCodes } from './aztec_cheat_codes.js';
import { RollupCheatCodes } from './rollup_cheat_codes.js';

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

  static createRollup(rpcUrls: string[], addresses: Pick<L1ContractAddresses, 'rollupAddress'>): RollupCheatCodes {
    const ethCheatCodes = new EthCheatCodes(rpcUrls);
    return new RollupCheatCodes(ethCheatCodes, addresses);
  }
}
