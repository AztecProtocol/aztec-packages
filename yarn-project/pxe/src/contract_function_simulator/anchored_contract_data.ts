import type { Fr } from '@aztec/foundation/curves/bn254';
import type { FunctionArtifactWithContractName, FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstancePreimageWithAddress } from '@aztec/stdlib/contract';
import type { BlockHeader, ContractOverrides } from '@aztec/stdlib/tx';

import type { ContractClassService } from '../contract/contract_class_service.js';
import type { ContractStore } from '../storage/contract_store/contract_store.js';

/**
 * Per-run view of contract data for a single simulation, bound to its anchor block.
 *
 * The {@link ContractStore} is pure class-id-keyed storage and has no notion of which class an address runs. This
 * class bridges that gap: it resolves an address to its current class id (via the {@link ContractClassService}
 * at the run's anchor block) and then serves artifacts from the store. It is also the single place contract
 * overrides are applied — when an address is overridden, both its instance and its class id come from the override
 * rather than the chain, so a simulation can execute different bytecode at that address. Overrides are only set for
 * `simulateTx` (which skips the kernels), so the override path never reaches proving.
 */
export class AnchoredContractData {
  constructor(
    private store: ContractStore,
    private contractClassService: ContractClassService,
    private anchorBlockHeader: BlockHeader,
    private overrides?: ContractOverrides,
  ) {}

  /** Returns the address preimage of the instance at `address`, from the override if any, else from storage. */
  getContractInstance(address: AztecAddress): Promise<ContractInstancePreimageWithAddress | undefined> {
    const override = this.overrides?.[address.toString()];
    if (override) {
      return Promise.resolve(override.instance);
    }
    return this.store.getContractInstance(address);
  }

  /**
   * Resolves the class id `address` runs in this simulation: the override's class if overridden, else resolved against
   * the chain at the anchor block.
   */
  getCurrentClassId(address: AztecAddress): Promise<Fr | undefined> {
    const override = this.overrides?.[address.toString()];
    if (override) {
      return Promise.resolve(override.instance.currentContractClassId);
    }
    return this.contractClassService.getCurrentClassId(address, this.anchorBlockHeader);
  }

  async getFunctionArtifact(
    address: AztecAddress,
    selector: FunctionSelector,
  ): Promise<FunctionArtifactWithContractName | undefined> {
    const classId = await this.getCurrentClassId(address);
    return classId ? this.store.getFunctionArtifact(classId, selector) : undefined;
  }

  async getFunctionArtifactWithDebugMetadata(
    address: AztecAddress,
    selector: FunctionSelector,
  ): Promise<FunctionArtifactWithContractName | undefined> {
    const classId = await this.getCurrentClassId(address);
    return classId ? this.store.getFunctionArtifactWithDebugMetadata(classId, selector) : undefined;
  }

  async getDebugContractName(address: AztecAddress): Promise<string | undefined> {
    const classId = await this.getCurrentClassId(address);
    return classId ? this.store.getDebugContractName(classId) : undefined;
  }

  async getDebugFunctionName(address: AztecAddress, selector: FunctionSelector): Promise<string> {
    const classId = await this.getCurrentClassId(address);
    return classId ? this.store.getDebugFunctionName(classId, selector) : `${address}:${selector}`;
  }
}
