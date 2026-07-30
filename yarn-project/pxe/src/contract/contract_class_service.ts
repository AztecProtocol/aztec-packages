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

    // The node resolves the current class from the same scheduled value change the AVM enforces against the public
    // data tree. If the contract was upgraded the node returns a non-undefined instance; an undefined result means no
    // upgrade happened (or the node has no record of it, e.g. it was never publicly deployed), so the original class
    // is current.
    const nodeInstance = await this.node.getContract(address, await anchorBlockHeader.hash());
    if (nodeInstance) {
      return nodeInstance.currentContractClassId;
    }
    return (await this.contractStore.getContractInstance(address))?.originalContractClassId;
  }
}
