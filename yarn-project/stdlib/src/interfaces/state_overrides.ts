import { z } from 'zod';

import { type PublicStorageOverride, PublicStorageOverrideSchema } from './public_storage_override.js';

/**
 * Pre-simulation state overrides. Each field is optional and additive: the simulator applies all
 * provided overrides to the ephemeral world-state fork (in order) before running the tx.
 */
export type StateOverrides = {
  /** Public-storage writes to apply before simulation. */
  publicStorage?: PublicStorageOverride[];
};

export const StateOverridesSchema = z.object({
  publicStorage: z.array(PublicStorageOverrideSchema).optional(),
});
