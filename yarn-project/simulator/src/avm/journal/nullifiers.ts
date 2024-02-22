import { Fr } from '@aztec/foundation/fields';

import type { NullifiersDB } from '../../index.js';

export class Nullifiers {
  private readonly hostNullifiers: NullifiersDB;
  private readonly parentNullifiers: PendingNullifiers | undefined;
  private pendingNullifiers: PendingNullifiers;

  constructor(hostNullifiers: NullifiersDB, parent?: Nullifiers) {
    this.hostNullifiers = hostNullifiers;
    this.parentNullifiers = parent?.pendingNullifiers;
    this.pendingNullifiers = new PendingNullifiers();
  }

  public acceptAndMerge(otherNullifiers: Nullifiers) {
    this.pendingNullifiers.acceptAndMerge(otherNullifiers.pendingNullifiers);
  }

  public async getNullifierIndex(
    storageAddress: Fr,
    nullifier: Fr,
  ): Promise<[/*exists=*/ boolean, /*isPending=*/ boolean, /*leafIndex=*/ Fr]> {
    // First check this pending nullifiers
    let existsAsPending = this.pendingNullifiers.exists(storageAddress, nullifier);
    // Then check parent's pending nullifiers
    if (!existsAsPending && this.parentNullifiers) {
      existsAsPending = this.parentNullifiers?.exists(storageAddress, nullifier);
    }
    // Finally try the host's Aztec state (a trip to the database)
    // If the value is found in the database, it will be associated with a leaf index!
    let leafIndex: bigint | undefined = undefined;
    if (!existsAsPending) {
      leafIndex = await this.hostNullifiers.getNullifierIndex(nullifier);
    }
    const exists = existsAsPending || leafIndex !== undefined;
    leafIndex = leafIndex === undefined ? BigInt(0) : leafIndex;
    return Promise.resolve([exists, existsAsPending, new Fr(leafIndex)]);
  }

  public append(storageAddress: Fr, nullifier: Fr) {
    this.pendingNullifiers.append(storageAddress, nullifier);
  }
}

export class PendingNullifiers {
  private nullifiers: Map<bigint, Set<bigint>> = new Map();

  public exists(storageAddress: Fr, nullifier: Fr): boolean {
    // FIXME: unsure if "has(nullifier)" works if nullifier is Fr! Might need it to be bigint
    const exists = this.nullifiers.get(storageAddress.toBigInt())?.has(nullifier.toBigInt());
    return exists ? true : false;
  }

  public append(storageAddress: Fr, nullifier: Fr) {
    let nullifiersForContract = this.nullifiers.get(storageAddress.toBigInt());
    // If this contract's nullifier set has no pending nullifier, create a new Map to store them
    if (!nullifiersForContract) {
      nullifiersForContract = new Set();
      this.nullifiers.set(storageAddress.toBigInt(), nullifiersForContract);
    }
    if (nullifiersForContract.has(nullifier.toBigInt())) {
      throw new Error(
        `Failed to emit new nullifier. Nullifier ${nullifier} already exists for contract ${storageAddress}!`,
      );
    }
    nullifiersForContract.add(nullifier.toBigInt());
  }

  /**
   * Merges a nested/child call's pending nullifiers into the current/parent.
   *
   * @param otherNullifiers - the nested call's nullifiers to merge in
   */
  public acceptAndMerge(otherNullifiers: PendingNullifiers) {
    // Iterate over all contracts with staged writes in the child.
    for (const [storageAddress, incomingNullifiers] of otherNullifiers.nullifiers) {
      const currentNullifiers = this.nullifiers.get(storageAddress);
      if (!currentNullifiers) {
        // This contract has no storage writes staged in parent,
        // so just accept the child's storage for this contract as-is.
        this.nullifiers.set(storageAddress, incomingNullifiers);
      } else {
        // Child and parent both have staged writes for this contract.
        // Merge in the child's staged writes.
        for (const nullifier of incomingNullifiers) {
          if (currentNullifiers.has(nullifier)) {
            throw new Error(
              `Failed to accept child call's nullifiers. Nullifier ${nullifier} already exists for contract ${storageAddress}!`,
            );
          }
          currentNullifiers.add(nullifier);
        }
      }
    }
  }
}
