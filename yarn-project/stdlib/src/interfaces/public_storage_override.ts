import type { Fr } from '@aztec/foundation/curves/bn254';

import { z } from 'zod';

import type { AztecAddress } from '../aztec-address/index.js';
import { schemas } from '../schemas/schemas.js';

/**
 * A single public-storage override to inject before simulation. Identifies a slot in
 * (contract, raw slot) space, not by leafSlot — the simulator computes the leafSlot internally
 * via `computePublicDataTreeLeafSlot`.
 */
export type PublicStorageOverride = {
  /** Contract that owns the storage slot. */
  contract: AztecAddress;
  /** Raw storage slot within the contract (not yet hashed into a tree key). */
  slot: Fr;
  /** Value to place at that slot for the duration of the simulation. */
  value: Fr;
};

export const PublicStorageOverrideSchema = z.object({
  contract: schemas.AztecAddress,
  slot: schemas.Fr,
  value: schemas.Fr,
});
