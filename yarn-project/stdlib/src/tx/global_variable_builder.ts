import type { SimulationOverridesPlan } from '@aztec/ethereum/contracts';
import type { SlotNumber } from '@aztec/foundation/branded-types';
import type { EthAddress } from '@aztec/foundation/eth-address';

import type { AztecAddress } from '../aztec-address/index.js';
import type { GasFees } from '../gas/gas_fees.js';
import type { CheckpointGlobalVariables } from './global_variables.js';

/**
 * Interface for building global variables for Aztec blocks.
 */
export interface GlobalVariableBuilder {
  /** Builds global variables that are constant throughout a checkpoint. */
  buildCheckpointGlobalVariables(
    coinbase: EthAddress,
    feeRecipient: AztecAddress,
    slotNumber: SlotNumber,
    simulationOverridesPlan?: SimulationOverridesPlan,
  ): Promise<CheckpointGlobalVariables>;

  /**
   * Builds checkpoint global variables from a precomputed `{timestamp, slotNumber, gasFees}`
   * snapshot. Synchronous — no L1 reads — because the caller has already resolved gas fees and
   * timestamp via {@link FeeProvider.getCurrentMinFeesSnapshot}.
   */
  buildCheckpointGlobalVariablesFromSnapshot(
    coinbase: EthAddress,
    feeRecipient: AztecAddress,
    snapshot: { timestamp: bigint; slotNumber: SlotNumber; gasFees: GasFees },
  ): CheckpointGlobalVariables;
}
