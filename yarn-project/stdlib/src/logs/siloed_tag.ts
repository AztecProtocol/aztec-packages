import { DomainSeparator } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { ZodFor } from '@aztec/foundation/schemas';

import type { AztecAddress } from '../aztec-address/index.js';
import { computeLogTag, computeSiloedPrivateLogFirstField } from '../hash/hash.js';
import { schemas } from '../schemas/schemas.js';
import { AppTaggingSecretKind } from './app_tagging_secret_kind.js';
import type { PreTag } from './pre_tag.js';
import { Tag } from './tag.js';

/**
 * Represents a tag used in private log as it "appears on the chain" - that is the tag is siloed with a contract
 * address that emitted the log.
 */
export class SiloedTag {
  /** Branding for nominal typing. */
  declare private readonly _branding: 'SiloedTag';

  constructor(public readonly value: Fr) {}

  static async compute(preTag: PreTag): Promise<SiloedTag> {
    const tag = await Tag.compute(preTag);
    const domainSeparator =
      preTag.extendedSecret.kind === AppTaggingSecretKind.CONSTRAINED
        ? DomainSeparator.CONSTRAINED_MSG_LOG_TAG
        : DomainSeparator.UNCONSTRAINED_MSG_LOG_TAG;
    const logTag = await computeLogTag(tag.value, domainSeparator);
    return SiloedTag.computeFromTagAndApp(new Tag(logTag), preTag.extendedSecret.app);
  }

  /**
   * Unlike `compute`, this expects a tag whose value is already domain-separated.
   */
  static async computeFromTagAndApp(tag: Tag, app: AztecAddress): Promise<SiloedTag> {
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

  static random(): SiloedTag {
    return new SiloedTag(Fr.random());
  }

  static get schema(): ZodFor<SiloedTag> {
    return schemas.Fr.transform((fr: Fr) => new SiloedTag(fr));
  }
}
