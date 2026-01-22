import { z } from 'zod';

export const NetworkConfigSchema = z
  .object({
    bootnodes: z.array(z.string()),
    snapshots: z.array(z.string()),
    blobFileStoreUrls: z.array(z.string()).optional(),
    registryAddress: z.string(),
    feeAssetHandlerAddress: z.string().optional(),
    l1ChainId: z.number(),
    blockDurationMs: z.number().positive().optional(),
  })
  .passthrough(); // Allow additional unknown fields to pass through

export const NetworkConfigMapSchema = z.record(z.string(), NetworkConfigSchema);

export type NetworkConfig = z.infer<typeof NetworkConfigSchema>;
export type NetworkConfigMap = z.infer<typeof NetworkConfigMapSchema>;
