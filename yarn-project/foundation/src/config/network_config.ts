import { z } from 'zod';

export const NetworkConfigSchema = z
  .object({
    bootnodes: z.array(z.string()),
    snapshots: z.array(z.string()),
    registryAddress: z.string(),
    feeAssetHandlerAddress: z.string().optional(),
    l1ChainId: z.number(),
  })
  .passthrough(); // Allow additional unknown fields to pass through

export const NetworkConfigMapSchema = z.record(z.string(), NetworkConfigSchema);

export type NetworkConfig = z.infer<typeof NetworkConfigSchema>;
export type NetworkConfigMap = z.infer<typeof NetworkConfigMapSchema>;
