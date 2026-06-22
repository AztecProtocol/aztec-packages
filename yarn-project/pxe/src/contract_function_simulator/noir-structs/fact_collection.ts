import type { Fr } from '@aztec/foundation/curves/bn254';

import type { EphemeralArray } from './ephemeral_array.js';
import type { Fact } from './fact.js';

/**
 * A fact collection as returned by the fact store oracles: its id together with its visible facts.
 *
 * A TS version of the `FactCollection` struct in `facts/mod.nr`.
 */
export type FactCollection = { factCollectionId: Fr; facts: EphemeralArray<Fact> };
