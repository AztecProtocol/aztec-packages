import type { EthAddress } from '@aztec/foundation/eth-address';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasFees } from '@aztec/stdlib/gas';
import { makeGlobalVariables } from '@aztec/stdlib/testing';
import { type GlobalVariableBuilder, GlobalVariables } from '@aztec/stdlib/tx';

export class TXEGlobalVariablesBuilder implements GlobalVariableBuilder {
  public getCurrentBaseFees(): Promise<GasFees> {
    return Promise.resolve(new GasFees(0, 0));
  }

  public buildGlobalVariables(
    _blockNumber: number,
    _coinbase: EthAddress,
    _feeRecipient: AztecAddress,
    _slotNumber?: bigint,
  ): Promise<GlobalVariables> {
    return Promise.resolve(makeGlobalVariables());
  }
}
