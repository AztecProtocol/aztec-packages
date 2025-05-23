import type { Hex } from 'viem';
import { z } from 'zod';

export interface PostBlobSidecarRequest {
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
  .max(66)
  .transform(str => str as Hex);

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

/**
 * Block identifier. The spec allows for <hex encoded blockRoot with 0x prefix>, <slot>, "head", "genesis", "finalized", but we only support the block root.
 * See https://ethereum.github.io/beacon-APIs/?urls.primaryName=dev#/Beacon/getBlobSidecars.
 */
export const blockIdSchema = blockRootSchema;

export const postBlobSidecarSchema = z.object({
  // eslint-disable-next-line camelcase
  block_id: blockIdSchema,
  blobs: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      blob: z.object({
        type: z.string(),
        data: z.string(),
      }),
    }),
  ),
});
