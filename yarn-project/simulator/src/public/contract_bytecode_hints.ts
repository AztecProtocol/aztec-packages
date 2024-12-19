import { AVM_MAX_UNIQUE_CONTRACT_CALLS, type AvmContractBytecodeHints } from '@aztec/circuits.js';

import { strict as assert } from 'assert';

export class ContractBytecodeHints {
  // maps classId to hints
  private readonly hints: Map<string, AvmContractBytecodeHints> = new Map();

  constructor(private readonly parent?: ContractBytecodeHints) {}

  /**
   * Create a fork that references this one as its parent
   */
  public fork() {
    return new ContractBytecodeHints(this);
  }

  /**
   * Check for a hint in this' hints or parent's (recursively).
   *
   * @param classId - the address of the contract whose storage is being read from
   * @param slot - the slot in the contract's storage being read from
   * @returns value: the latest value written according to this cache or the parent's. undefined on cache miss.
   */
  public get(classId: string): AvmContractBytecodeHints | undefined {
    // First try check this' hints
    let value = this.hints.get(classId);
    // Then try parent's
    if (!value && this.parent) {
      // Note: this will recurse to grandparent/etc until a cache-hit is encountered.
      value = this.parent.get(classId);
    }
    return value;
  }

  public has(classId: string): boolean {
    return this.hints.get(classId) !== undefined;
  }

  public size(): number {
    return this.hints.size + (this.parent ? this.parent.size() : 0);
  }

  public set(classId: string, hint: AvmContractBytecodeHints) {
    if (!this.has(classId)) {
      this.hints.set(classId, hint);
      assert(
        this.size() <= AVM_MAX_UNIQUE_CONTRACT_CALLS,
        `Tried setting a bytecode hint and surpassed limit of ${AVM_MAX_UNIQUE_CONTRACT_CALLS} unique contract classes`,
      );
    }
  }

  public acceptAndMerge(incoming: ContractBytecodeHints) {
    for (const [classId, hint] of incoming.hints.entries()) {
      assert(!this.has(classId), `Cannot merge hints for class ${classId} as it already exists`);
      this.hints.set(classId, hint);
    }
    // since set() has an assertion, and size() always checks parent, this should be impossible
    assert(
      this.size() <= AVM_MAX_UNIQUE_CONTRACT_CALLS,
      `Merging hints should never exceed the limit of ${AVM_MAX_UNIQUE_CONTRACT_CALLS}`,
    );
  }

  public getHints(): Map<string, AvmContractBytecodeHints> {
    return this.hints;
  }
}
