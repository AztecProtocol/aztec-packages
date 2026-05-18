import { schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import type { AppTaggingSecret } from './app_tagging_secret.js';
import { ConstrainedAppTaggingSecretSchema } from './constrained_app_tagging_secret.js';
import { ExtendedDirectionalAppTaggingSecretSchema } from './extended_directional_app_tagging_secret.js';

/**
 * Represents a range of tagging indexes for a given sender-side app tagging secret. Used to track the lowest
 * and highest indexes used in a transaction for a given tagging key. The secret may be:
 * - an `ExtendedDirectionalAppTaggingSecret` derived from a `(sender, recipient, app)` tuple (unconstrained delivery), or
 * - a `ConstrainedAppTaggingSecret` wrapping the app-siloed shared secret (constrained delivery) from an onchain registry
 *
 * The field is named `extendedSecret` for legacy reasons (it predates constrained delivery).
 */
export type TaggingIndexRange = {
  extendedSecret: AppTaggingSecret;
  lowestIndex: number;
  highestIndex: number;
};

export const TaggingIndexRangeSchema = z.object({
  extendedSecret: z.union([ExtendedDirectionalAppTaggingSecretSchema, ConstrainedAppTaggingSecretSchema]),
  lowestIndex: schemas.Integer,
  highestIndex: schemas.Integer,
});
