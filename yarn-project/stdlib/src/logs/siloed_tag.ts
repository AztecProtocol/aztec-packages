import type { Fr } from '@aztec/foundation/curves/bn254';
import type { ZodFor } from '@aztec/foundation/schemas';

import type { AztecAddress } from '../aztec-address/index.js';
import { computeSiloedPrivateLogFirstField } from '../hash/hash.js';
import { schemas } from '../schemas/schemas.js';
import type { Tag } from './tag.js';

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */

/** Branding to ensure fields are not interchangeable types. */
export interface SiloedTag {
  /** Brand. */
  _branding: 'SiloedTag';
}

/**
 * Represents a tag used in private log as it "appears on the chain" - that is the tag is siloed with a contract
 * address that emitted the log.
 */
export class SiloedTag {
  constructor(public readonly value: Fr) {}

  static async compute(tag: Tag, app: AztecAddress): Promise<SiloedTag> {
    const siloedTag = await computeSiloedPrivateLogFirstField(app, tag.value);
    return new SiloedTag(siloedTag);
  }

  toString(): string {
    return this.value.toString();
  }

  toJSON(): string {
    return this.value.toString();
  }

  equals(other: SiloedTag): boolean {
    return this.value.equals(other.value);
  }

  static get schema(): ZodFor<SiloedTag> {
    return schemas.Fr.transform((fr: Fr) => new SiloedTag(fr));
  }
}
