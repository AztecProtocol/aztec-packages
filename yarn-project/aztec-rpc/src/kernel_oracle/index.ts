import {
  AztecAddress,
  CircuitsWasm,
  ConstantHistoricBlockData,
  Fr,
  GlobalVariables,
  MembershipWitness,
  PRIVATE_DATA_TREE_HEIGHT,
} from '@aztec/circuits.js';
import { computeGlobalsHash } from '@aztec/circuits.js/abis';
import { Tuple } from '@aztec/foundation/serialize';
import { AztecNode, MerkleTreeId } from '@aztec/types';

import { ContractDataOracle } from '../contract_data_oracle/index.js';
import { ProvingDataOracle } from './../kernel_prover/proving_data_oracle.js';

/**
 * A data oracle that provides information needed for simulating a transaction.
 */
export class KernelOracle implements ProvingDataOracle {
  constructor(private contractDataOracle: ContractDataOracle, private node: AztecNode) {}

  public async getContractMembershipWitness(contractAddress: AztecAddress) {
    return await this.contractDataOracle.getContractMembershipWitness(contractAddress);
  }

  public async getFunctionMembershipWitness(contractAddress: AztecAddress, functionSelector: Buffer) {
    return await this.contractDataOracle.getFunctionMembershipWitness(contractAddress, functionSelector);
  }

  public async getVkMembershipWitness() {
    return await this.contractDataOracle.getVkMembershipWitness();
  }

  async getNoteMembershipWitness(leafIndex: bigint): Promise<MembershipWitness<typeof PRIVATE_DATA_TREE_HEIGHT>> {
    const path = await this.node.getDataTreePath(leafIndex);
    return new MembershipWitness<typeof PRIVATE_DATA_TREE_HEIGHT>(
      path.pathSize,
      leafIndex,
      path.toFieldArray() as Tuple<Fr, typeof PRIVATE_DATA_TREE_HEIGHT>,
    );
  }

  async getPrivateDataRoot(): Promise<Fr> {
    const roots = await this.node.getTreeRoots();
    return roots[MerkleTreeId.PRIVATE_DATA_TREE];
  }

  async getconstantHistoricBlockData(): Promise<ConstantHistoricBlockData> {
    // NOT SURE HOW TO HANDLE THIS - 
    // DO NOT GET THESE FROM DIFFERENT SOURCES - 
    // GET THIS ALL FROM THE LOCAL NODE
    // NOW THE NODE NEEDS TO INDEX

    // - the local node needs to index the public data tree
    // - the local node needs to index the block globals
    // - there cannot be a mis match of data here / a race
    

    // This should get the roots all from the local db or all from the node, unsure how there is a data race here
    const treeRoots = await this.node.getHistoricBlockData();
    const { roots, globalVariablesHash} = treeRoots;

    return new ConstantHistoricBlockData(
          roots[MerkleTreeId.PRIVATE_DATA_TREE],
          roots[MerkleTreeId.NULLIFIER_TREE],
          roots[MerkleTreeId.CONTRACT_TREE],
          roots[MerkleTreeId.L1_TO_L2_MESSAGES_TREE],
          roots[MerkleTreeId.BLOCKS_TREE],
          Fr.ZERO,
          roots[MerkleTreeId.PUBLIC_DATA_TREE],
          globalVariablesHash,
    );
  }
}
