import type { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasFees } from '@aztec/stdlib/gas';
import { type GlobalVariableBuilder, GlobalVariables } from '@aztec/stdlib/tx';

export class TXEGlobalVariablesBuilder implements GlobalVariableBuilder {
  private timestamp = new Fr(1);
  private slotNumber = 1n;

  // The version and chainId should match the one on txe_oracle
  private version = new Fr(1);
  private chainId = new Fr(1);

  constructor() {}

  public getCurrentBaseFees(): Promise<GasFees> {
    return Promise.resolve(new GasFees(0, 0));
  }

  /**
   * Simple builder of global variables that use the minimum time possible.
   * @param blockNumber - The block number to build global variables for.
   * @param coinbase - The address to receive block reward.
   * @param feeRecipient - The address to receive fees.
   * @param slotNumber - The slot number to use for the global variables, if undefined it will be calculated.
   * @returns The global variables for the given block number.
   */
  public buildGlobalVariables(
    blockNumber: Fr,
    coinbase: EthAddress,
    feeRecipient: AztecAddress,
    slotNumber?: bigint,
  ): Promise<GlobalVariables> {
    const gasFees = new GasFees(0, 0);

    slotNumber ??= this.slotNumber;

    const globalVariables = new GlobalVariables(
      this.chainId,
      this.version,
      blockNumber,
      Fr.fromString(slotNumber.toString()),
      this.timestamp,
      coinbase,
      feeRecipient,
      gasFees,
    );

    this.slotNumber++;
    this.timestamp = this.timestamp.add(new Fr(1));

    return Promise.resolve(globalVariables);
  }
}
