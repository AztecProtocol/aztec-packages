import type { SimulationOverridesPlan } from '@aztec/ethereum/contracts';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { SlotNumber } from '@aztec/foundation/schemas';

import type { AztecAddress } from '../aztec-address/index.js';
import type { CheckpointGlobalVariables } from './global_variables.js';

/**
 * Interface for building global variables for Aztec blocks.
 */
export interface GlobalVariableBuilder {
  /**
   * Builds global variables that are constant throughout a checkpoint.
   * @param options - Optional L1 block number to pin the fee read to, so the fee describes the same L1 state
   * the caller planned the block from.
   */
  buildCheckpointGlobalVariables(
    coinbase: EthAddress,
    feeRecipient: AztecAddress,
    slotNumber: SlotNumber,
    simulationOverridesPlan?: SimulationOverridesPlan,
    options?: { blockNumber?: bigint },
  ): Promise<CheckpointGlobalVariables>;
}
