import { z } from 'zod';

import {
  type ContractInstanceWithAddress,
  ContractInstanceWithAddressSchema,
} from '../contract/interfaces/contract_instance.js';
import { type PublicStorageOverride, PublicStorageOverrideSchema } from './public_storage_override.js';

/**
 * Pre-simulation state overrides. Each field is optional and additive: the simulator applies all
 * provided overrides to the ephemeral world-state fork (and contract DB) before running the tx.
 *
 * - `publicStorage`: write specific (contract, slot, value) entries in the public-data tree
 * - `contractInstances`: shadow contract instances in the contract DB
 */
export type StateOverrides = {
  /** Public-storage writes to apply before simulation. */
  publicStorage?: PublicStorageOverride[];
  /** Contract instances to shadow in the contract DB for the duration of the simulation. */
  contractInstances?: ContractInstanceWithAddress[];
};

export const StateOverridesSchema = z.object({
  publicStorage: z.array(PublicStorageOverrideSchema).optional(),
  contractInstances: z.array(ContractInstanceWithAddressSchema).optional(),
});
