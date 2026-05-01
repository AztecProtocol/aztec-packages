import { z } from 'zod';

import { type ContractClassPublic, ContractClassPublicSchema } from '../contract/interfaces/contract_class.js';
import { type PublicStorageOverride, PublicStorageOverrideSchema } from './public_storage_override.js';

/**
 * Pre-simulation state-tree overrides applied to the ephemeral world-state fork before running the tx.
 *
 * - `publicStorage`: write specific (contract, slot, value) entries in the public-data tree.
 * - `contractClasses`: override contract classes in the contract DB.
 *
 * Contract instance overrides live separately as the top-level `contractOverrides` simulation option.
 */
export type StateOverrides = {
  /** Public-storage writes to apply before simulation. */
  publicStorage?: PublicStorageOverride[];
  /** Contract classes to override in the contract DB for the duration of the simulation. */
  contractClasses?: ContractClassPublic[];
};

export const StateOverridesSchema = z.object({
  publicStorage: z.array(PublicStorageOverrideSchema).optional(),
  contractClasses: z.array(ContractClassPublicSchema).optional(),
});
