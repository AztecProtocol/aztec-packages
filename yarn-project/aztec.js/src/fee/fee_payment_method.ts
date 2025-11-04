import type { ExecutionPayload } from '@aztec/entrypoints/payload';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasSettings } from '@aztec/stdlib/gas';

/**
 * Holds information about how the fee for a transaction is to be paid.
 */
export interface FeePaymentMethod {
  /** The asset used to pay the fee. */
  getAsset(): Promise<AztecAddress>;
  /**
   * Returns the data to be added to the final execution request
   * to pay the fee in the given asset
   * @returns The function calls to pay the fee.
   */
  getExecutionPayload(): Promise<ExecutionPayload>;
  /**
   * The expected fee payer for this tx.
   */
  getFeePayer(): Promise<AztecAddress>;
  /**
   * The gas settings (if any) used to compute the
   * execution payload of the payment method
   */
  getGasSettings(): GasSettings | undefined;
}
