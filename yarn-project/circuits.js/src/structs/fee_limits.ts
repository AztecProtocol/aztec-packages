import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { FieldsOf } from '@aztec/foundation/types';

/**
 * Fee payment information for a transaction.
 */
export class FeeLimits {
  constructor(
    /**
     * Fee limit
     */
    public feePerDAGas: Fr,
    /**
     * The asset used to pay the fee.
     */
    public dATxGasLimit: Fr,
  ) {}

  isEmpty() {
    return this.feePerDAGas.isZero() && this.dATxGasLimit.isZero();
  }

  /**
   * Creates a FeeLimits instance from a set of fields
   * @param fields - The fields
   */
  static from(fields: FieldsOf<FeeLimits>): FeeLimits {
    return new FeeLimits(...FeeLimits.getFields(fields));
  }

  /**
   * Creates an empty FeeLimits instance
   */
  static empty(): FeeLimits {
    return new FeeLimits(Fr.ZERO, Fr.ZERO);
  }

  static isEmpty(feeLimits: FeeLimits) {
    return feeLimits.isEmpty();
  }

  /**
   * Creates a FeeLimits instance from a buffer
   * @param buffer - The buffer
   */
  static fromBuffer(buffer: Buffer | BufferReader): FeeLimits {
    const reader = BufferReader.asReader(buffer);
    return new FeeLimits(Fr.fromBuffer(reader), Fr.fromBuffer(reader));
  }

  static fromJSON(obj: any): FeeLimits {
    return new FeeLimits(Fr.fromString(obj.feePerDAGas), Fr.fromString(obj.dATxGasLimit));
  }

  static getFields(fields: FieldsOf<FeeLimits>) {
    return [fields.feePerDAGas, fields.dATxGasLimit] as const;
  }

  toBuffer() {
    return serializeToBuffer(...FeeLimits.getFields(this));
  }

  toJSON() {
    return {
      feePerDAGas: this.feePerDAGas.toString(),
      dATxGasLimit: this.dATxGasLimit.toString(),
    };
  }
}
