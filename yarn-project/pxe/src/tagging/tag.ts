import { poseidon2Hash } from '@aztec/foundation/crypto';
import type { Fr } from '@aztec/foundation/fields';
import type { PreTag } from '@aztec/stdlib/logs';

/**
 * Represents a tag of a private log. This is not the tag that "appears" on the chain as this tag is first siloed
 * with a contract address by kernels before being included in the final log.
 */
export class Tag {
  private constructor(public readonly value: Fr) {}

  static async compute(preTag: PreTag): Promise<Tag> {
    const tag = await poseidon2Hash([preTag.secret.value, preTag.index]);
    return new Tag(tag);
  }
}
