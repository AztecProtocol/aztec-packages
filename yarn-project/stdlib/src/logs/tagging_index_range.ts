import { schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { type AppTaggingSecret, AppTaggingSecretSchema } from './app_tagging_secret.js';

/** Represents a range of tagging indexes for a given app tagging secret. */
export type TaggingIndexRange = {
  extendedSecret: AppTaggingSecret;
  lowestIndex: number;
  highestIndex: number;
};

export const TaggingIndexRangeSchema = z.object({
  extendedSecret: AppTaggingSecretSchema,
  lowestIndex: schemas.Integer,
  highestIndex: schemas.Integer,
});
