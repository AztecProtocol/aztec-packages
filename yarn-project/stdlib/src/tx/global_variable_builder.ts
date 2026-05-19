import type { RollupContract, SimulationOverridesPlan } from '@aztec/ethereum/contracts';
import type { SlotNumber } from '@aztec/foundation/branded-types';
import type { EthAddress } from '@aztec/foundation/eth-address';

import type { AztecAddress } from '../aztec-address/index.js';
import type { CheckpointGlobalVariables } from './global_variables.js';

/**
 * Interface for building global variables for Aztec blocks.
 */
export interface GlobalVariableBuilder {
  /** Returns the rollup contract reader used to compute gas fees. */
  getRollupContract(): RollupContract;

  /** Builds global variables that are constant throughout a checkpoint. */
  buildCheckpointGlobalVariables(
    coinbase: EthAddress,
    feeRecipient: AztecAddress,
    slotNumber: SlotNumber,
    simulationOverridesPlan?: SimulationOverridesPlan,
  ): Promise<CheckpointGlobalVariables>;
}
