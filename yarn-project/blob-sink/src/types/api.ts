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

// Validation schemas
export const blockIdSchema = z.coerce
  .string()
  .regex(/^0x[0-9a-fA-F]{0,64}$/)
  .max(66);

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
