import { FunctionSelector } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { FieldsOf } from '@aztec/foundation/types';

/**
 * Fee payment information for a transaction.
 */
export class FeeVariables {
  constructor(
    /**
     * Fee limit
     */
    public feeLimit: Fr,
    /**
     * The asset used to pay the fee.
     */
    public feeAssetAddress: AztecAddress,
    /**
     * Address which contains the fee payment function.
     */
    public feePreparationAddress: AztecAddress,
    /**
     * The fee payment function selector.
     */
    public feePreparationSelector: FunctionSelector,
    /**
     * Address which contains the fee distribution function.
     */
    public feeDistributionAddress: AztecAddress,
    /**
     * The fee distribution function selector.
     */
    public feeDistributionSelector: FunctionSelector,
  ) {}

  isEmpty() {
    return (
      this.feeLimit.isZero() &&
      this.feeAssetAddress.isZero() &&
      this.feePreparationAddress.isZero() &&
      this.feePreparationSelector.isEmpty() &&
      this.feeDistributionAddress.isZero() &&
      this.feeDistributionSelector.isEmpty()
    );
  }

  /**
   * Creates a FeeVariables instance from a set of fields
   * @param fields - The fields
   */
  static from(fields: FieldsOf<FeeVariables>): FeeVariables {
    return new FeeVariables(...FeeVariables.getFields(fields));
  }

  /**
   * Creates an empty FeeVariables instance
   */
  static empty(): FeeVariables {
    return new FeeVariables(
      Fr.ZERO,
      AztecAddress.ZERO,
      AztecAddress.ZERO,
      FunctionSelector.empty(),
      AztecAddress.ZERO,
      FunctionSelector.empty(),
    );
  }

  static isEmpty(feeVariables: FeeVariables) {
    return feeVariables.isEmpty();
  }

  /**
   * Creates a FeeVariables instance from a buffer
   * @param buffer - The buffer
   */
  static fromBuffer(buffer: Buffer | BufferReader): FeeVariables {
    const reader = BufferReader.asReader(buffer);
    return new FeeVariables(
      Fr.fromBuffer(reader),
      AztecAddress.fromBuffer(reader),
      AztecAddress.fromBuffer(reader),
      FunctionSelector.fromBuffer(reader),
      AztecAddress.fromBuffer(reader),
      FunctionSelector.fromBuffer(reader),
    );
  }

  static fromJSON(obj: any): FeeVariables {
    return new FeeVariables(
      Fr.fromString(obj.feeLimit),
      AztecAddress.fromString(obj.feeAssetAddress),
      AztecAddress.fromString(obj.feePaymentAddress),
      FunctionSelector.fromString(obj.feePaymentSelector),
      AztecAddress.fromString(obj.feeDistributionAddress),
      FunctionSelector.fromString(obj.feeDistributionSelector),
    );
  }

  static getFields(fields: FieldsOf<FeeVariables>) {
    return [
      fields.feeLimit,
      fields.feeAssetAddress,
      fields.feePreparationAddress,
      fields.feePreparationSelector,
      fields.feeDistributionAddress,
      fields.feeDistributionSelector,
    ] as const;
  }

  toBuffer() {
    return serializeToBuffer(...FeeVariables.getFields(this));
  }

  toJSON() {
    return {
      feeLimit: this.feeLimit.toString(),
      feeAssetAddress: this.feeAssetAddress.toString(),
      feePaymentAddress: this.feePreparationAddress.toString(),
      feePaymentSelector: this.feePreparationSelector.toString(),
      feeDistributionAddress: this.feeDistributionAddress.toString(),
      feeDistributionSelector: this.feeDistributionSelector.toString(),
    };
  }
}
