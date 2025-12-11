import { BlockNumber, type SlotNumber } from '@aztec/foundation/branded-types';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasFees } from '@aztec/stdlib/gas';
import { makeGlobalVariables } from '@aztec/stdlib/testing';
import { type CheckpointGlobalVariables, type GlobalVariableBuilder, GlobalVariables } from '@aztec/stdlib/tx';

export class TXEGlobalVariablesBuilder implements GlobalVariableBuilder {
  public getCurrentBaseFees(): Promise<GasFees> {
    return Promise.resolve(new GasFees(0, 0));
  }

  public buildGlobalVariables(
    _blockNumber: BlockNumber,
    _coinbase: EthAddress,
    _feeRecipient: AztecAddress,
    _slotNumber?: SlotNumber,
  ): Promise<GlobalVariables> {
    return Promise.resolve(makeGlobalVariables());
  }

  public buildCheckpointGlobalVariables(
    _coinbase: EthAddress,
    _feeRecipient: AztecAddress,
    _slotNumber: SlotNumber,
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
}
