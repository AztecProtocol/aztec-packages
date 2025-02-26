import type { FunctionCall } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasSettings } from '@aztec/stdlib/gas';

/**
 * Holds information about how the fee for a transaction is to be paid.
 */
export interface FeePaymentMethod {
  /** The asset used to pay the fee. */
  getAsset(): Promise<AztecAddress>;
  /**
   * Creates a function call to pay the fee in the given asset.
   * @param gasSettings - The gas limits and max fees.
   * @returns The function call to pay the fee.
   */
  getFunctionCalls(gasSettings: GasSettings): Promise<FunctionCall[]>;
  /**
   * The expected fee payer for this tx.
   * @param gasSettings - The gas limits and max fees.
   */
  getFeePayer(gasSettings: GasSettings): Promise<AztecAddress>;
}
