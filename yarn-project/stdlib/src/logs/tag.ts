import { poseidon2Hash } from '@aztec/foundation/crypto/poseidon';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { ZodFor } from '@aztec/foundation/schemas';

import { schemas } from '../schemas/schemas.js';
import type { PreTag } from './pre_tag.js';

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */

export interface Tag {
  /** Brand. */
  _branding: 'Tag';
}

/**
 * Represents a tag of a private log. This is not the tag that "appears" on the chain as this tag is first siloed
 * with a contract address by kernels before being included in the final log.
 */
export class Tag {
  constructor(public readonly value: Fr) {}

  static async compute(preTag: PreTag): Promise<Tag> {
    const tag = await poseidon2Hash([preTag.secret.value, preTag.index]);
    return new Tag(tag);
  }

  toString(): string {
    return this.value.toString();
  }

  toJSON(): string {
    return this.value.toString();
  }

  equals(other: Tag): boolean {
    return this.value.equals(other.value);
  }

  static get schema(): ZodFor<Tag> {
    return schemas.Fr.transform((fr: Fr) => new Tag(fr));
  }
}
