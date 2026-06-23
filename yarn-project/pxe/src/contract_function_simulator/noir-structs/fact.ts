import type { Fr } from '@aztec/foundation/curves/bn254';

import type { EphemeralArray } from './ephemeral_array.js';
import type { Option } from './option.js';
import type { OriginBlock } from './origin_block.js';

/**
 * A single fact returned within a fact collection by the fact store oracles.
 *
 * A TS version of the `Fact` struct in `facts/mod.nr`. `originBlock` is `Some` for a retractable fact (pruned on
 * reorg of that block) and `None` for a non-retractable one.
 */
export type Fact = { factTypeId: Fr; payload: EphemeralArray<Fr>; originBlock: Option<OriginBlock> };
