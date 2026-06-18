import type { Fr } from '@aztec/foundation/curves/bn254';

import type { EphemeralArray } from './ephemeral_array.js';
import type { FactOutput } from './fact_output.js';

/**
 * Returned by `getEntity`/`getEntities`: the entity body plus its facts.
 *
 * A TS version of the `RawEntity` struct in `entities/mod.nr`.
 */
export type EntityOutput = { body: EphemeralArray<Fr>; facts: EphemeralArray<FactOutput> };
