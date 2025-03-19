import { Fr } from '@aztec/foundation/fields';
import type { SiblingPath } from '@aztec/foundation/trees';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import {
  AvmBytecodeCommitmentHint,
  AvmContractClassHint,
  AvmContractInstanceHint,
  type AvmExecutionHints,
  AvmGetSiblingPathHint,
} from '@aztec/stdlib/avm';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractClassPublic, ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { AppendOnlyTreeSnapshot, type MerkleTreeId } from '@aztec/stdlib/trees';

import { type PublicContractsDBInterface, PublicTreesDB } from '../server.js';

/**
 * A public contracts database that forwards requests and collects AVM hints.
 */
export class HintingPublicContractsDB implements PublicContractsDBInterface {
  constructor(private readonly db: PublicContractsDBInterface, private hints: AvmExecutionHints) {}

  public async getContractInstance(
    address: AztecAddress,
    blockNumber: number,
  ): Promise<ContractInstanceWithAddress | undefined> {
    const instance = await this.db.getContractInstance(address, blockNumber);
    if (instance) {
      // We don't need to hint the block number because it doesn't change.
      this.hints.contractInstances.push(
        new AvmContractInstanceHint(
          instance.address,
          instance.salt,
          instance.deployer,
          instance.currentContractClassId,
          instance.originalContractClassId,
          instance.initializationHash,
          instance.publicKeys,
        ),
      );
    }
    return instance;
  }

  public async getContractClass(contractClassId: Fr): Promise<ContractClassPublic | undefined> {
    const contractClass = await this.db.getContractClass(contractClassId);
    if (contractClass) {
      this.hints.contractClasses.push(
        new AvmContractClassHint(
          contractClass.id,
          contractClass.artifactHash,
          contractClass.privateFunctionsRoot,
          contractClass.packedBytecode,
        ),
      );
    }
    return contractClass;
  }

  public async getBytecodeCommitment(contractClassId: Fr): Promise<Fr | undefined> {
    const commitment = await this.db.getBytecodeCommitment(contractClassId);
    if (commitment) {
      this.hints.bytecodeCommitments.push(new AvmBytecodeCommitmentHint(contractClassId, commitment));
    }
    return commitment;
  }

  public async getDebugFunctionName(
    contractAddress: AztecAddress,
    selector: FunctionSelector,
  ): Promise<string | undefined> {
    return await this.db.getDebugFunctionName(contractAddress, selector);
  }
}

/**
 * A public trees database that forwards requests and collects AVM hints.
 */
export class HintingPublicTreesDB extends PublicTreesDB {
  constructor(db: PublicTreesDB, private hints: AvmExecutionHints) {
    super(db);
  }

  public override async getSiblingPath<N extends number>(treeId: MerkleTreeId, index: bigint): Promise<SiblingPath<N>> {
    const path = await super.getSiblingPath<N>(treeId, index);
    const key = await this.#getHintKey(treeId);
    this.hints.getSiblingPathHints.push(new AvmGetSiblingPathHint(key, treeId, index, path.toFields()));
    return Promise.resolve(path);
  }

  async #getHintKey(treeId: MerkleTreeId): Promise<AppendOnlyTreeSnapshot> {
    const treeInfo = await super.getTreeInfo(treeId);
    return new AppendOnlyTreeSnapshot(Fr.fromBuffer(treeInfo.root), Number(treeInfo.size));
  }
}
