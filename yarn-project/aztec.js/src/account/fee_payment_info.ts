import { FunctionSelector } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { FieldsOf } from '@aztec/foundation/types';

/**
 * Fee payment information for a transaction.
 * Specified by the user and sent as an option when creating a contract function interaction.
 *
 * The specified values are translated in TS into a FeePayload which is
 * used by the wallet entrypoint to prepare and distribute the fee.
 */
export class FeePaymentInfo {
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
     * Address which will hold the fee payment.
     */
    public feePreparationAddress: AztecAddress,
    /**
     * The fee payment function selector on the asset contract.
     */
    public feePreparationSelector: FunctionSelector,
    /**
     * Address which contains the fee distribution function.
     */
    public feeDistributionAddress: AztecAddress,
    /**
     * Selector of the fee distribution function on the fee distribution contract.
     */
    public feeDistributionSelector: FunctionSelector,
    /**
     * The coinbase address to pay the fee to.
     * NOTE: this is temporarily here. Will be removed once we can add it to GlobalVariables
     */
    public tempCoinbase: AztecAddress,
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
   * Creates a FeePaymentInfo instance from a set of fields
   * @param fields - The fields
   */
  static from(fields: FieldsOf<FeePaymentInfo>): FeePaymentInfo {
    return new FeePaymentInfo(...FeePaymentInfo.getFields(fields));
  }

  /**
   * Creates an empty FeePaymentInfo instance
   */
  static empty(): FeePaymentInfo {
    return new FeePaymentInfo(
      Fr.ZERO,
      AztecAddress.ZERO,
      AztecAddress.ZERO,
      FunctionSelector.empty(),
      AztecAddress.ZERO,
      FunctionSelector.empty(),
      AztecAddress.ZERO,
    );
  }

  static isEmpty(feePaymentInfo: FeePaymentInfo) {
    return feePaymentInfo.isEmpty();
  }

  /**
   * Creates a FeePaymentInfo instance from a buffer
   * @param buffer - The buffer
   */
  static fromBuffer(buffer: Buffer | BufferReader): FeePaymentInfo {
    const reader = BufferReader.asReader(buffer);
    return new FeePaymentInfo(
      Fr.fromBuffer(reader),
      AztecAddress.fromBuffer(reader),
      AztecAddress.fromBuffer(reader),
      FunctionSelector.fromBuffer(reader),
      AztecAddress.fromBuffer(reader),
      FunctionSelector.fromBuffer(reader),
      AztecAddress.fromBuffer(reader),
    );
  }

  static fromJSON(obj: any): FeePaymentInfo {
    return new FeePaymentInfo(
      Fr.fromString(obj.feeLimit),
      AztecAddress.fromString(obj.feeAssetAddress),
      AztecAddress.fromString(obj.feePaymentAddress),
      FunctionSelector.fromString(obj.feePaymentSelector),
      AztecAddress.fromString(obj.feeDistributionAddress),
      FunctionSelector.fromString(obj.feeDistributionSelector),
      AztecAddress.fromString(obj.tempCoinbase),
    );
  }

  static getFields(fields: FieldsOf<FeePaymentInfo>) {
    return [
      fields.feeLimit,
      fields.feeAssetAddress,
      fields.feePreparationAddress,
      fields.feePreparationSelector,
      fields.feeDistributionAddress,
      fields.feeDistributionSelector,
      fields.tempCoinbase,
    ] as const;
  }

  toBuffer() {
    return serializeToBuffer(...FeePaymentInfo.getFields(this));
  }

  toJSON() {
    return {
      feeLimit: this.feeLimit.toString(),
      feeAssetAddress: this.feeAssetAddress.toString(),
      feePaymentAddress: this.feePreparationAddress.toString(),
      feePaymentSelector: this.feePreparationSelector.toString(),
      feeDistributionAddress: this.feeDistributionAddress.toString(),
      feeDistributionSelector: this.feeDistributionSelector.toString(),
      tempCoinbase: this.tempCoinbase.toString(),
    };
  }
}
