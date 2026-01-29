import { Fr } from '@aztec/foundation/curves/bn254';
import type { ZodFor } from '@aztec/foundation/schemas';

import { inspect } from 'util';

import { hexSchemaFor } from '../schemas/schemas.js';

const BLOCK_HASH_BRAND = Symbol.for('aztec.BlockHash');

/** Hash of an L2 block. */
export class BlockHash extends Fr {
  readonly [BLOCK_HASH_BRAND] = true as const;

  constructor(hash: Fr) {
    super(hash);
  }

  override [inspect.custom]() {
    return `BlockHash<${this.toString()}>`;
  }

  toFr(): Fr {
    return new Fr(this.toBigInt());
  }

  /**
   * Type guard that checks if a value is a BlockHash instance.
   * Uses Symbol.for to ensure cross-module compatibility.
   */
  static isBlockHash(value: unknown): value is BlockHash {
    return typeof value === 'object' && value !== null && BLOCK_HASH_BRAND in value;
  }

  static override random() {
    return new BlockHash(Fr.random());
  }

  static override fromString(str: string): BlockHash {
    return new BlockHash(Fr.fromString(str));
  }

  static override get schema() {
    return hexSchemaFor(BlockHash) as ZodFor<BlockHash>;
  }
}
