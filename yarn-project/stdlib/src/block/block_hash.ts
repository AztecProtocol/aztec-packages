import { BaseFr, Fr } from '@aztec/foundation/curves/bn254';
import type { ZodFor } from '@aztec/foundation/schemas';

import { inspect } from 'util';

import { hexSchemaFor } from '../schemas/schemas.js';

/** Hash of an L2 block. */
export class BlockHash extends BaseFr {
  /** Branding for nominal typing. */
  declare private readonly _branding: 'BlockHash';

  constructor(hash: Fr) {
    super(hash);
  }

  [inspect.custom]() {
    return `BlockHash<${this.toString()}>`;
  }

  toFr(): Fr {
    return new Fr(this.toBigInt());
  }

  /** Type guard that checks if a value is a BlockHash instance. */
  static isBlockHash(value: unknown): value is BlockHash {
    return value instanceof BlockHash;
  }

  static random() {
    return new BlockHash(Fr.random());
  }

  static fromString(str: string): BlockHash {
    return new BlockHash(Fr.fromString(str));
  }

  static get schema() {
    return hexSchemaFor(BlockHash) as ZodFor<BlockHash>;
  }
}
