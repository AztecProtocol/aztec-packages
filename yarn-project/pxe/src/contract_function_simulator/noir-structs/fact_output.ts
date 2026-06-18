import type { Fr } from '@aztec/foundation/curves/bn254';

import type { EphemeralArray } from './ephemeral_array.js';

/**
 * A single fact returned within an entity by `getEntity`.
 *
 * A TS version of the `Fact` struct in `entities/mod.nr`.
 */
export type FactOutput = { factTypeId: Fr; payload: EphemeralArray<Fr> };
