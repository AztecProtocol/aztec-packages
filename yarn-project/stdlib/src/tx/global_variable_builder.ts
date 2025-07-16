import type { EthAddress } from '@aztec/foundation/eth-address';

import type { AztecAddress } from '../aztec-address/index.js';
import type { GasFees } from '../gas/gas_fees.js';
import type { UInt32 } from '../types/index.js';
import type { GlobalVariables } from './global_variables.js';

/**
 * Interface for building global variables for Aztec blocks.
 */
export interface GlobalVariableBuilder {
  getCurrentBaseFees(): Promise<GasFees>;

  /**
   * Builds global variables for a given block.
   * @param blockNumber - The block number to build global variables for.
   * @param coinbase - The address to receive block reward.
   * @param feeRecipient - The address to receive fees.
   * @param slotNumber - Optional. The slot number to use for the global variables. If undefined, it will be calculated.
   * @returns A promise that resolves to the GlobalVariables for the given block number.
   */
  buildGlobalVariables(
    blockNumber: UInt32,
    coinbase: EthAddress,
    feeRecipient: AztecAddress,
    slotNumber?: bigint,
  ): Promise<GlobalVariables>;
}
