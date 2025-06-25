import { NULLIFIER_TREE_HEIGHT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { MembershipWitness, SiblingPath } from '@aztec/foundation/trees';

import { z } from 'zod';

import { schemas } from '../schemas/index.js';
import { NullifierLeafPreimage } from './nullifier_leaf.js';

/**
 * Nullifier membership witness.
 * @remarks When this represents membership witness of a low nullifier it can be used to perform a nullifier
 * non-inclusion proof by leveraging the "linked list structure" of leaves and proving that a lower nullifier
 * is pointing to a bigger next value than the nullifier we are trying to prove non-inclusion for.
 */
export class NullifierMembershipWitness {
  constructor(
    /**
     * The index of the nullifier in a tree.
     */
    public readonly index: bigint,
    /**
     * Preimage of the nullifier.
     */
    public readonly leafPreimage: NullifierLeafPreimage,
    /**
     * Sibling path to prove membership of the nullifier.
     */
    public readonly siblingPath: SiblingPath<typeof NULLIFIER_TREE_HEIGHT>,
  ) {}

  static get schema() {
    return z
      .object({
        index: schemas.BigInt,
        leafPreimage: NullifierLeafPreimage.schema,
        siblingPath: SiblingPath.schemaFor(NULLIFIER_TREE_HEIGHT),
      })
      .transform(
        ({ index, leafPreimage, siblingPath }) => new NullifierMembershipWitness(index, leafPreimage, siblingPath),
      );
  }

  static random() {
    return new NullifierMembershipWitness(
      BigInt(Math.floor(Math.random() * 1000)),
      NullifierLeafPreimage.random(),
      SiblingPath.random(NULLIFIER_TREE_HEIGHT),
    );
  }

  public withoutPreimage(): MembershipWitness<typeof NULLIFIER_TREE_HEIGHT> {
    return new MembershipWitness(NULLIFIER_TREE_HEIGHT, this.index, this.siblingPath.toTuple());
  }

  /**
   * Returns a field array representation of a nullifier witness.
   * @returns A field array representation of a nullifier witness.
   */
  public toFields(): Fr[] {
    return [new Fr(this.index), ...this.leafPreimage.toFields(), ...this.siblingPath.toFields()];
  }

  /**
   * Returns a representation of the nullifier membership witness as expected by intrinsic Noir deserialization.
   */
  public toNoirRepresentation(): (string | string[])[] {
    // TODO(#12874): remove the stupid as string conversion by modifying ForeignCallOutput type in acvm.js
    return [
      new Fr(this.index).toString() as string,
      ...(this.leafPreimage.toFields().map(fr => fr.toString()) as string[]),
      this.siblingPath.toFields().map(fr => fr.toString()) as string[],
    ];
  }
}
