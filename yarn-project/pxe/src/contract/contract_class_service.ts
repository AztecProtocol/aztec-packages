import type { Fr } from '@aztec/foundation/curves/bn254';
import { isProtocolContract } from '@aztec/protocol-contracts';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { BlockHeader } from '@aztec/stdlib/tx';

import type { ContractStore } from '../storage/contract_store/contract_store.js';

/**
 * Resolves the contract class id that an address runs at a given anchor block, as tracked by the chain.
 *
 * PXE does not store a contract's current class id: it is mutable, chain-derived state that changes when a contract is
 * upgraded and can be undone by a reorg. Instead this service asks the node for the current class at an anchor block,
 * falling back to a local instance if no upgrades were scheduled.
 */
export class ContractClassService {
  /**
   * Class ids are cached per `(address, anchorHash)`. This avoid unnecessary network roundtrips in scenarios where
   * multiple exeuctions are done on the same anchor block (e.g. simulation followed by witgen), or when the same
   * contract is invoked multiple times in an execution (e.g. authwit checks).
   * It also means the callers don't need to worry about caching this service's return values, simplifying callsites.
   */
  #cache: Map<string, Promise<Fr | undefined>> = new Map();

  constructor(
    private node: AztecNode,
    private contractStore: ContractStore,
  ) {}

  /**
   * Returns the class id that corresponds to `address` as of `anchorBlockHeader`, or `undefined` if no instance is
   * registered for `address`. A missing instance is an absence the caller decides how to handle, not an error; genuine
   * failures (e.g. the node being unreachable) still throw.
   */
  async getCurrentClassId(address: AztecAddress, anchorBlockHeader: BlockHeader): Promise<Fr | undefined> {
    // Protocol contracts are not in the registry and cannot be upgraded, so their original class is always current.
    // Short-circuiting avoids a node round-trip.
    if (isProtocolContract(address)) {
      const instance = await this.contractStore.getContractInstance(address);
      return instance?.originalContractClassId;
    }

    const key = `${address.toString()}:${(await anchorBlockHeader.hash()).toString()}`;
    let promise = this.#cache.get(key);
    if (!promise) {
      promise = (async () => {
        // The node resolves the current class from the same scheduled value change the AVM enforces against the public
        // data tree. If the contract was upgraded the node returns a non-undefined instance; an undefined result means
        // no upgrade happened (or the node has no record of it, e.g. it was never publicly deployed), so the original
        // class is current.

        const nodeInstance = await this.node.getContract(address, await anchorBlockHeader.hash());

        if (nodeInstance) {
          return nodeInstance.currentContractClassId;
        } else {
          return (await this.contractStore.getContractInstance(address))?.originalContractClassId;
        }
      })().catch(err => {
        this.#cache.delete(key);
        throw err;
      });
      this.#cache.set(key, promise);
    }

    const classId = await promise;
    if (classId === undefined) {
      // Don't memoize a missing instance: it may be registered later in this PXE (e.g. via contract sync
      // mid-execution), and a cached miss would then hide it. Only successful resolutions stay cached.
      this.#cache.delete(key);
    }
    return classId;
  }

  /**
   * Clears the cache.
   *
   * This is not required for correctness, only to limit how much memory the cache uses. The cache is resilient against
   * reorgs etc. as it is based on block hashes, not block numbers. */
  wipe(): void {
    this.#cache.clear();
  }
}
