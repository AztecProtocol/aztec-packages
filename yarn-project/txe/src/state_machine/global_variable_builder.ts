import type { SimulationOverridesPlan } from '@aztec/ethereum/contracts';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { FEE_ORACLE_LAG, GasFees } from '@aztec/stdlib/gas';
import { makeGlobalVariables } from '@aztec/stdlib/testing';
import type {
  CheckpointGlobalVariables,
  CurrentMinFeesSnapshot,
  FeeProvider,
  GlobalVariableBuilder,
} from '@aztec/stdlib/tx';

/** Simple FeeProvider for TXE that returns zero fees. */
export class TXEFeeProvider implements FeeProvider {
  public getCurrentMinFees(): Promise<GasFees> {
    return Promise.resolve(new GasFees(0, 0));
  }

  public getCurrentMinFeesSnapshot(): Promise<CurrentMinFeesSnapshot> {
    return Promise.resolve({ timestamp: 0n, slotNumber: SlotNumber.ZERO, gasFees: new GasFees(0, 0) });
  }

  public getPredictedMinFees(): Promise<GasFees[]> {
    return Promise.resolve(times(FEE_ORACLE_LAG, () => new GasFees(0, 0)));
  }
}

export class TXEGlobalVariablesBuilder implements GlobalVariableBuilder {
  public buildCheckpointGlobalVariables(
    _coinbase: EthAddress,
    _feeRecipient: AztecAddress,
    _slotNumber: SlotNumber,
    _simulationOverridesPlan?: SimulationOverridesPlan,
  ): Promise<CheckpointGlobalVariables> {
    const vars = makeGlobalVariables();
    return Promise.resolve({
      chainId: vars.chainId,
      version: vars.version,
      slotNumber: vars.slotNumber,
      timestamp: vars.timestamp,
      coinbase: vars.coinbase,
      feeRecipient: vars.feeRecipient,
      gasFees: vars.gasFees,
    });
  }

  // Only reachable via AztecNodeService.simulatePublicCalls, which TXE never invokes. Throwing
  // here keeps the surface honest if that ever changes.
  public buildCheckpointGlobalVariablesFromSnapshot(): CheckpointGlobalVariables {
    throw new Error('TXEGlobalVariablesBuilder does not implement buildCheckpointGlobalVariablesFromSnapshot');
  }
}
