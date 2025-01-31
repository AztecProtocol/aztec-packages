import { MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS } from '@aztec/circuits.js';

import { strict as assert } from 'assert';

/**
 * A class manage a de-duplicated set of class IDs that errors if you try to add a duplicate.
 * Useful for bytecode retrieval hints to avoid duplicates in parent trace & grandparent trace....
 */
export class UniqueClassIds {
  private readonly classIds: Set<string> = new Set();

  constructor(private readonly parent?: UniqueClassIds) {}

  /**
   * Create a fork that references this one as its parent
   */
  public fork() {
    return new UniqueClassIds(/*parent=*/ this);
  }

  /**
   * Check for a class ID here or in parent's (recursively).
   *
   * @param classId - the contract class ID (as a string) to check
   * @returns boolean: whether the class ID is here
   */
  public has(classId: string): boolean {
    // First try check this' classIds
    let here = this.classIds.has(classId);
    // Then try parent's
    if (!here && this.parent) {
      // Note: this will recurse to grandparent/etc until we reach top or find it
      here = this.parent.has(classId);
    }
    return here;
  }

  /**
   * Get the total number of classIds
   */
  public size(): number {
    return this.classIds.size + (this.parent ? this.parent.size() : 0);
  }

  /**
   * Add a class ID (if not already present) to the set.
   *
   * @param classId - the contract class ID (as a string)
   */
  public add(classId: string) {
    assert(!this.has(classId), `Bug! Tried to add duplicate classId ${classId} to set of unique classIds.`);
    if (!this.has(classId)) {
      this.classIds.add(classId);
      assert(
        this.size() <= MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS,
        `Bug! Surpassed limit (${MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS}) of unique contract class IDs used for bytecode retrievals.`,
      );
    }
  }

  /**
   * Merge in another set of unique class IDs into this one, but fail on duplicates.
   *
   * @param incoming: other unique class IDs
   */
  public acceptAndMerge(incoming: UniqueClassIds) {
    for (const classId of incoming.classIds.keys()) {
      assert(
        !this.has(classId),
        `Bug! Cannot merge classId ${classId} into set of unique classIds as it already exists.`,
      );
      this.classIds.add(classId);
    }
    // since set() has an assertion, and size() always checks parent, this should be impossible
    assert(
      this.size() <= MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS,
      `Bug! Merging unique class Ids should never exceed the limit of ${MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS}.`,
    );
  }
}
