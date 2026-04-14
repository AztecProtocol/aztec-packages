import { schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import {
  type ExtendedDirectionalAppTaggingSecret,
  ExtendedDirectionalAppTaggingSecretSchema,
} from './extended_directional_app_tagging_secret.js';

/**
 * Represents a preimage of a private log tag (see `Tag` in `pxe/src/tagging`).
 *
 * Note: It's a bit unfortunate that this type resides in `stdlib` as the rest of the tagging functionality resides
 * in `pxe/src/tagging`. But this type is used by other types in stdlib hence there doesn't seem to be a good way
 * around this.
 */
export type PreTag = {
  extendedSecret: ExtendedDirectionalAppTaggingSecret;
  index: number;
};

export const PreTagSchema = z.object({
  extendedSecret: ExtendedDirectionalAppTaggingSecretSchema,
  index: schemas.Integer,
});
