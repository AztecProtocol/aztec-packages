import { Fr, NULLIFIER_TREE_HEIGHT } from '@aztec/circuits.js';

import { SiblingPath } from '../sibling_path.js';
import { LeafData } from './leaf_data.js';

/**
 * Low nullifier witness.
 * @remarks Low nullifier witness can be used to perform a nullifier non-inclusion proof by leveraging the "linked
 * list structure" of leaves and proving that a lower nullifier is pointing to a bigger next value than the nullifier
 * we are trying to prove non-inclusion for.
 */
export class LowNullifierWitness {
  constructor(
    /**
     * The index of low nullifier.
     */
    public readonly index: bigint,
    /**
     * Preimage of the low nullifier that proves non membership.
     */
    public readonly leafData: LeafData,
    /**
     * Sibling path to prove membership of low nullifier.
     */
    public readonly siblingPath: SiblingPath<typeof NULLIFIER_TREE_HEIGHT>,
  ) {}

  /**
   * Returns a field array representation of the low nullifier witness.
   * @returns A field array representation of the low nullifier witness.
   */
  public toFieldArray(): Fr[] {
    return [
      new Fr(this.index),
      new Fr(this.leafData.value),
      new Fr(this.leafData.nextIndex),
      new Fr(this.leafData.nextValue),
      ...this.siblingPath.toFieldArray(),
    ];
  }
}
