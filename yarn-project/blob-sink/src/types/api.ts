import { z } from 'zod';

export interface PostBlobSidecarRequest {
  // eslint-disable-next-line camelcase
  block_id: string;
  blobs: Array<{
    index: number;
    blob: {
      type: string;
      data: string;
    };
  }>;
}

export const blockRootSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{0,64}$/)
  .max(66);
export const slotSchema = z.number().int().positive();

// Define the Zod schema for an array of numbers
export const indicesSchema = z.optional(
  z
    .string()
    .refine(str => str.split(',').every(item => !isNaN(Number(item))), {
      message: 'All items in the query must be valid numbers.',
    })
    .transform(str => str.split(',').map(Number)),
); // Convert to an array of numbers

// Validation schemas
// Block identifier. Can be one of: <slot>, <hex encoded blockRoot with 0x prefix>.
// Note the spec https://ethereum.github.io/beacon-APIs/?urls.primaryName=dev#/Beacon/getBlobSidecars does allows for "head", "genesis", "finalized" as valid block ids,
// but we explicitly do not support these values.
export const blockIdSchema = blockRootSchema.or(slotSchema);

export const postBlobSidecarSchema = z.object({
  // eslint-disable-next-line camelcase
  block_id: blockIdSchema,
  blobs: z.array(
    z.object({
      index: z.number(),
      blob: z.object({
        type: z.string(),
        data: z.string(),
      }),
    }),
  ),
});
