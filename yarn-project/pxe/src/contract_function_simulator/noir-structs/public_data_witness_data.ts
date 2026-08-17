import type { PUBLIC_DATA_TREE_HEIGHT } from '@aztec/constants';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { Tuple } from '@aztec/foundation/serialize';
import type { PublicDataTreeLeafPreimage } from '@aztec/stdlib/trees';

/**
 * A public data leaf preimage and the witness proving its membership in the public data tree.
 */
export type PublicDataWitnessData = {
  index: bigint;
  leafPreimage: PublicDataTreeLeafPreimage;
  siblingPath: Tuple<Fr, typeof PUBLIC_DATA_TREE_HEIGHT>;
};
