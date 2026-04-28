import type { Fr } from '@aztec/foundation/curves/bn254';

import { z } from 'zod';

import type { AztecAddress } from '../aztec-address/index.js';
import { schemas } from '../schemas/schemas.js';

/** A single public-state override to inject into a world-state fork before simulation. */
export type PublicDataTreeOverride = {
  /** Contract that owns the storage slot. */
  contract: AztecAddress;
  /** Raw storage slot within the contract (not yet hashed into a tree key). */
  slot: Fr;
  /** Value to place at that slot for the duration of the simulation. */
  value: Fr;
};

export const PublicDataTreeOverrideSchema = z.object({
  contract: schemas.AztecAddress,
  slot: schemas.Fr,
  value: schemas.Fr,
});
