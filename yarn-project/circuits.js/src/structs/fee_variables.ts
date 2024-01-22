import { FunctionSelector } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { FieldsOf } from '@aztec/foundation/types';

/**
 * Fee payment information for a transaction.
 */
export class FeeVariables {
  constructor(
    /**
     * Address which contains the fee payment function.
     */
    public feePaymentAddress: AztecAddress,
    /**
     * The fee payment function selector.
     */
    public feePaymentSelector: FunctionSelector,
    /**
     * Address which contains the fee distribution function.
     */
    public feeDistributionAddress: AztecAddress,
    /**
     * The fee distribution function selector.
     */
    public feeDistributionSelector: FunctionSelector,
  ) {}

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
    return new FeeVariables(AztecAddress.ZERO, FunctionSelector.empty(), AztecAddress.ZERO, FunctionSelector.empty());
  }

  /**
   * Creates a FeeVariables instance from a buffer
   * @param buffer - The buffer
   */
  static fromBuffer(buffer: Buffer | BufferReader): FeeVariables {
    const reader = BufferReader.asReader(buffer);
    return new FeeVariables(
      AztecAddress.fromBuffer(reader),
      FunctionSelector.fromBuffer(reader),
      AztecAddress.fromBuffer(reader),
      FunctionSelector.fromBuffer(reader),
    );
  }

  static fromJSON(obj: any): FeeVariables {
    return new FeeVariables(
      AztecAddress.fromString(obj.chainId),
      FunctionSelector.fromString(obj.version),
      AztecAddress.fromString(obj.blockNumber),
      FunctionSelector.fromString(obj.timestamp),
    );
  }

  static getFields(fields: FieldsOf<FeeVariables>) {
    // Note: The order here must match the order in the HeaderDecoder solidity library.
    return [
      fields.feePaymentAddress,
      fields.feePaymentSelector,
      fields.feeDistributionAddress,
      fields.feeDistributionSelector,
    ] as const;
  }

  toBuffer() {
    return serializeToBuffer(...FeeVariables.getFields(this));
  }

  toJSON() {
    return {
      feePaymentAddress: this.feePaymentAddress.toString(),
      feePaymentSelector: this.feePaymentSelector.toString(),
      feeDistributionAddress: this.feeDistributionAddress.toString(),
      feeDistributionSelector: this.feeDistributionSelector.toString(),
    };
  }
}
