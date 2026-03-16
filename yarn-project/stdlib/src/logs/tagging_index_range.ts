import { schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import {
  type ExtendedDirectionalAppTaggingSecret,
  ExtendedDirectionalAppTaggingSecretSchema,
} from './extended_directional_app_tagging_secret.js';

/**
 * Represents a range of tagging indexes for a given extended directional app tagging secret. Used to track the lowest
 * and highest indexes used in a transaction for a given (sender, recipient, app/contract) tuple.
 */
export type TaggingIndexRange = {
  extendedSecret: ExtendedDirectionalAppTaggingSecret;
  lowestIndex: number;
  highestIndex: number;
};

export const TaggingIndexRangeSchema = z.object({
  extendedSecret: ExtendedDirectionalAppTaggingSecretSchema,
  lowestIndex: schemas.Integer,
  highestIndex: schemas.Integer,
});
