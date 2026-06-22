import type { Fr } from '@aztec/foundation/curves/bn254';

import type { EphemeralArray } from './ephemeral_array.js';

/**
 * A single fact returned within a fact collection by the fact store oracles.
 *
 * A TS version of the `Fact` struct in `facts/mod.nr`.
 */
export type Fact = { factTypeId: Fr; payload: EphemeralArray<Fr> };
