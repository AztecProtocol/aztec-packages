import { z } from 'zod';

export const PrivateKernelProverProfileResultSchema = z.object({
  gateCounts: z.array(z.object({ circuitName: z.string(), gateCount: z.number() })),
});

export type PrivateKernelProverProfileResult = z.infer<typeof PrivateKernelProverProfileResultSchema>;
