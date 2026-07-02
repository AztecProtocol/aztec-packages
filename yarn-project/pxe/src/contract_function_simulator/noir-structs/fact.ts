import type { Fr } from '@aztec/foundation/curves/bn254';

import type { RetractableFactOrigin } from '../../storage/fact_store/index.js';
import type { EphemeralArray } from './ephemeral_array.js';
import type { Option } from './option.js';

/**
 * A single fact returned within a fact collection by the fact store oracles.
 *
 * A TS version of the `Fact` struct in `facts/mod.nr`. `originBlock` is `Some` for a retractable fact (carrying its
 * origin block's current chain state) and `None` for a non-retractable one.
 */
export type Fact = { factTypeId: Fr; payload: EphemeralArray<Fr>; originBlock: Option<RetractableFactOrigin> };
