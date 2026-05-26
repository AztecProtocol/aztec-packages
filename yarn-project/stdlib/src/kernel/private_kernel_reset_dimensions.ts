import { serializeToBuffer } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

export class PrivateKernelResetDimensions {
  constructor(
    public NOTE_HASH_PENDING_READ: number,
    public NOTE_HASH_SETTLED_READ: number,
    public NULLIFIER_PENDING_READ: number,
    public NULLIFIER_SETTLED_READ: number,
    public KEY_VALIDATION: number,
    public TRANSIENT_DATA_SQUASHING: number,
    public NOTE_HASH_SILOING: number,
    public NULLIFIER_SILOING: number,
    public PRIVATE_LOG_SILOING: number,
  ) {}

  toBuffer() {
    return serializeToBuffer(
      this.NOTE_HASH_PENDING_READ,
      this.NOTE_HASH_SETTLED_READ,
      this.NULLIFIER_PENDING_READ,
      this.NULLIFIER_SETTLED_READ,
      this.KEY_VALIDATION,
      this.TRANSIENT_DATA_SQUASHING,
      this.NOTE_HASH_SILOING,
      this.NULLIFIER_SILOING,
      this.PRIVATE_LOG_SILOING,
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
  'NOTE_HASH_PENDING_READ',
  'NOTE_HASH_SETTLED_READ',
  'NULLIFIER_PENDING_READ',
  'NULLIFIER_SETTLED_READ',
  'KEY_VALIDATION',
  'TRANSIENT_DATA_SQUASHING',
  'NOTE_HASH_SILOING',
  'NULLIFIER_SILOING',
  'PRIVATE_LOG_SILOING',
];

export interface ResetCatalogEntry {
  name: string;
  dimensions: number[];
  // Measured gate count (circuit_size) of the compiled variant. Used by the selector to pick the
  // cheapest variant that covers the requested dimensions, e.g. if the required dimensions are
  // `6 - 2 - 2` then a variant with capacity `8 - 2 - 2` might be cheaper than one with capacity
  // `6 - 4 - 4`.
  cost: number;
}

// Must match the config in noir-projects/noir-protocol-circuits/private_kernel_reset_config.json
export interface PrivateKernelResetDimensionsConfig {
  // Variants used for mid-tx resets that prevent overflow. Never the last kernel in the chain.
  inner: ResetCatalogEntry[];
  // Variants used as the terminal kernel for the rollup-bound private-only path. Each runs
  // final-reset siloing and tail finalisation in one proof.
  finalTail: ResetCatalogEntry[];
  // Terminal variants for the public-bound path (transactions with public function calls). Runs
  // final-reset siloing and tail-to-public partitioning by revertibility in one proof.
  finalTailToPublic: ResetCatalogEntry[];
}
