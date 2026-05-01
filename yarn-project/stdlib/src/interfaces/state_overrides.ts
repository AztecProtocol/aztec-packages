import { z } from 'zod';

import { type PublicStorageOverride, PublicStorageOverrideSchema } from './public_storage_override.js';

/**
 * Pre-simulation state-tree overrides applied to the ephemeral world-state fork before running the tx.
 *
 * - `publicStorage`: write specific (contract, slot, value) entries in the public-data tree.
 *
 * Contract instance overrides live separately as the top-level `contractOverrides` simulation option.
 */
export type StateOverrides = {
  /** Public-storage writes to apply before simulation. */
  publicStorage?: PublicStorageOverride[];
};

export const StateOverridesSchema = z.object({
  publicStorage: z.array(PublicStorageOverrideSchema).optional(),
});
