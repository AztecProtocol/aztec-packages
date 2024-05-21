import { type FunctionCall } from '@aztec/circuit-types';
import { type GasSettings } from '@aztec/circuits.js';
import { type AztecAddress } from '@aztec/foundation/aztec-address';

/**
 * Holds information about how the fee for a transaction is to be paid.
 */
export interface FeePaymentMethod {
  /** The asset used to pay the fee. */
  getAsset(): AztecAddress;
  /**
   * Creates a function call to pay the fee in the given asset.
   * @param gasSettings - The gas limits and max fees.
   * @returns The function call to pay the fee.
   */
  getFunctionCalls(gasSettings: GasSettings): Promise<FunctionCall[]>;
  /**
   * Whether the sender should be appointed as fee payer.
   * @param gasSettings - The gas limits and max fees.
   */
  isFeePayer(gasSettings: GasSettings): Promise<boolean>;
}
