import { poseidon2Hash } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { ZodFor } from '@aztec/foundation/schemas';

import { schemas } from '../schemas/schemas.js';
import type { PreTag } from './pre_tag.js';

/**
 * Represents a tag of a private log. This is not the tag that "appears" on the chain as this tag is first siloed
 * with a contract address by kernels before being included in the final log.
 */
export class Tag {
  /** Branding for nominal typing. */
  declare private readonly _branding: 'Tag';

  constructor(public readonly value: Fr) {}

  static async compute(preTag: PreTag): Promise<Tag> {
    const tag = await poseidon2Hash([preTag.extendedSecret.secret, preTag.index]);
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

  static random(): Tag {
    return new Tag(Fr.random());
  }

  static get schema(): ZodFor<Tag> {
    return schemas.Fr.transform((fr: Fr) => new Tag(fr));
  }
}
