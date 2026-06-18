import type { Fr } from '@aztec/foundation/curves/bn254';

import type { EphemeralArray } from './ephemeral_array.js';
import type { Fact } from './fact.js';

/**
 * Returned by EntityService `getEntity`/`getEntities`: the entity body plus its facts.
 *
 * A TS version of the `RawEntity` struct in `entities/mod.nr`.
 */
export type Entity = { body: EphemeralArray<Fr>; facts: EphemeralArray<Fact> };
