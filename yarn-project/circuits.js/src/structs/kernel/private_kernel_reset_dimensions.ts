import { serializeToBuffer } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

export class PrivateKernelResetDimensions {
  constructor(
    public NOTE_HASH_PENDING_AMOUNT: number,
    public NOTE_HASH_SETTLED_AMOUNT: number,
    public NULLIFIER_PENDING_AMOUNT: number,
    public NULLIFIER_SETTLED_AMOUNT: number,
    public NULLIFIER_KEYS: number,
    public TRANSIENT_DATA_AMOUNT: number,
    public NOTE_HASH_SILOING_AMOUNT: number,
    public NULLIFIER_SILOING_AMOUNT: number,
    public PRIVATE_LOG_SILOING_AMOUNT: number,
  ) {}

  toBuffer() {
    return serializeToBuffer(
      this.NOTE_HASH_PENDING_AMOUNT,
      this.NOTE_HASH_SETTLED_AMOUNT,
      this.NULLIFIER_PENDING_AMOUNT,
      this.NULLIFIER_SETTLED_AMOUNT,
      this.NULLIFIER_KEYS,
      this.TRANSIENT_DATA_AMOUNT,
      this.NOTE_HASH_SILOING_AMOUNT,
      this.NULLIFIER_SILOING_AMOUNT,
      this.PRIVATE_LOG_SILOING_AMOUNT,
    );
  }

  static empty() {
    return new PrivateKernelResetDimensions(0, 0, 0, 0, 0, 0, 0, 0, 0);
  }

  static from(fields: Partial<FieldsOf<PrivateKernelResetDimensions>>) {
    const dimensions = PrivateKernelResetDimensions.empty();
    privateKernelResetDimensionNames.forEach(name => (dimensions[name] = fields[name] ?? 0));
    return dimensions;
  }

  static fromValues(values: number[]) {
    if (values.length !== privateKernelResetDimensionNames.length) {
      throw new Error(
        `Not enough values for all dimensions. Required ${privateKernelResetDimensionNames.length}. Got ${values.length}.`,
      );
    }
    const dimensions = PrivateKernelResetDimensions.empty();
    privateKernelResetDimensionNames.forEach((name, i) => (dimensions[name] = values[i]));
    return dimensions;
  }

  toValues() {
    return privateKernelResetDimensionNames.map(name => this[name]);
  }
}

export type DimensionName = keyof FieldsOf<PrivateKernelResetDimensions>;

export const privateKernelResetDimensionNames: DimensionName[] = [
  'NOTE_HASH_PENDING_AMOUNT',
  'NOTE_HASH_SETTLED_AMOUNT',
  'NULLIFIER_PENDING_AMOUNT',
  'NULLIFIER_SETTLED_AMOUNT',
  'NULLIFIER_KEYS',
  'TRANSIENT_DATA_AMOUNT',
  'NOTE_HASH_SILOING_AMOUNT',
  'NULLIFIER_SILOING_AMOUNT',
  'PRIVATE_LOG_SILOING_AMOUNT',
];

export interface DimensionConfig {
  variants: number[];
  standalone: number[];
  cost: number;
}

// Must match the config in noir-projects/noir-protocol-circuits/private_kernel_reset_config.json
export interface PrivateKernelResetDimensionsConfig {
  dimensions: { [K in DimensionName]: DimensionConfig };
  specialCases: number[][];
}
