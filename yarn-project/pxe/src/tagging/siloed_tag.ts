import { poseidon2Hash } from '@aztec/foundation/crypto';
import type { Fr } from '@aztec/foundation/fields';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { Tag } from './tag.js';

/**
 * Represents a tag used in private log as it "appears on the chain" - that is the tag is siloed with a contract
 * address that emitted the log.
 */
export class SiloedTag {
  private constructor(public readonly value: Fr) {}

  static async compute(tag: Tag, app: AztecAddress): Promise<SiloedTag> {
    const siloedTag = await poseidon2Hash([app, tag.value]);
    return new SiloedTag(siloedTag);
  }

  toString(): string {
    return this.value.toString();
  }
}
