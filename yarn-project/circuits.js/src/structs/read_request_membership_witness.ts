import { Fr } from '@aztec/foundation/fields';
import { assertMemberLength, range } from '../utils/jsUtils.js';
import { serializeToBuffer } from '../utils/serialize.js';
import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import { Tuple } from '@aztec/foundation/serialize';
import { NEW_COMMITMENTS_LENGTH, PRIVATE_DATA_TREE_HEIGHT } from './constants.js';
import { MembershipWitness } from './membership_witness.js';

/**
 * Contains information which can be used to prove that a leaf is a member of a Merkle tree.
 */
export class ReadRequestMembershipWitness {
  constructor(
    /**
     * Index of a leaf in the Merkle tree.
     */
    public leafIndex: bigint,
    /**
     * Sibling path of the leaf in the Merkle tree.
     */
    public siblingPath: Tuple<Fr, number>,
    /**
     * Does this read request correspond to a pending commitment?
     */
    public isTransient = false,
    /**
     * When transient, the commitment being read was created by some app circuit in the current TX.
     * What index will the commitment be found in the app circuit's newCommitments?
     * When not transient, this is 0.
     */
    public commitmentIndex: Fr,
    /**
     * When transient, what kernel iteration (which callStackItem) was the commitment created in?
     * When not transient, this is 0.
     */
    public commitmentKernelIter: Fr,
  ) {
    assertMemberLength(this, 'siblingPath', PRIVATE_DATA_TREE_HEIGHT);
    if (commitmentIndex.value > NEW_COMMITMENTS_LENGTH) {
      throw new Error(
        `Expected ReadRequestMembershipWitness' commitmentIndex(${commitmentIndex}) to be <= NEW_COMMITMENTS_LENGTH(${NEW_COMMITMENTS_LENGTH})`,
      );
    }
  }

  toBuffer() {
    return serializeToBuffer(
      toBufferBE(this.leafIndex, 32),
      ...this.siblingPath,
      this.isTransient,
      this.commitmentIndex,
      this.commitmentKernelIter,
    );
  }

  static mock(size: number, start: number) {
    return new ReadRequestMembershipWitness(
      BigInt(start),
      range(size, start).map(x => new Fr(BigInt(x))),
      false,
      new Fr(0),
      new Fr(0),
    );
  }

  /**
   * Creates a random membership witness. Used for testing purposes.
   * @returns Random membership witness.
   */
  public static random() {
    return new ReadRequestMembershipWitness(
      0n,
      Array(PRIVATE_DATA_TREE_HEIGHT)
        .fill(0)
        .map(() => Fr.random()),
      false,
      new Fr(0),
      new Fr(0),
    );
  }

  /**
   * Creates a read request membership witness whose sibling path is full of zero fields.
   * @param leafIndex - Index of the leaf in the Merkle tree.
   * @returns Membership witness with zero sibling path.
   */
  public static empty(leafIndex: bigint): ReadRequestMembershipWitness {
    const arr = Array(PRIVATE_DATA_TREE_HEIGHT)
      .fill(0)
      .map(() => Fr.ZERO);
    return new ReadRequestMembershipWitness(leafIndex, arr, false, new Fr(0), new Fr(0));
  }

  /**
   * Creates a transient read request membership witness.
   * @param commitmentIndex - index of commitment in the app circuit's newCommitments that
   * created it
   * @param commitmentKernelIter - kernel iteration during which the app circuit's newCommitments
   * contained this commitment
   * @returns Transient read request membership witness.
   */
  public static newTransient(commitmentIndex: Fr, commitmentKernelIter: Fr): ReadRequestMembershipWitness {
    const arr = Array(PRIVATE_DATA_TREE_HEIGHT)
      .fill(0)
      .map(() => Fr.ZERO);
    return new ReadRequestMembershipWitness(BigInt(0), arr, true, commitmentIndex, commitmentKernelIter);
  }

  static fromBufferArray<N extends number>(
    leafIndex: bigint,
    siblingPath: Tuple<Buffer, N>,
    isTransient: boolean,
    commitmentIndex: Fr,
    commitmentKernelIter: Fr,
  ): ReadRequestMembershipWitness {
    return new ReadRequestMembershipWitness(
      leafIndex,
      siblingPath.map(x => Fr.fromBuffer(x)) as Tuple<Fr, typeof PRIVATE_DATA_TREE_HEIGHT>,
      isTransient,
      commitmentIndex,
      commitmentKernelIter,
    );
  }

  static fromMembershipWitness<N extends number>(
    membershipWitness: MembershipWitness<N>,
    isTransient: boolean,
    commitmentIndex: Fr,
    commitmentKernelIter: Fr,
  ): ReadRequestMembershipWitness {
    return new ReadRequestMembershipWitness(
      membershipWitness.leafIndex,
      membershipWitness.siblingPath as Tuple<Fr, typeof PRIVATE_DATA_TREE_HEIGHT>,
      isTransient,
      commitmentIndex,
      commitmentKernelIter,
    );
  }
}
