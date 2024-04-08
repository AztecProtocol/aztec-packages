import { type AztecNode, type KeyStore } from '@aztec/circuit-types';
import {
  type AztecAddress,
  type Fr,
  type FunctionSelector,
  MembershipWitness,
  type NOTE_HASH_TREE_HEIGHT,
  type Point,
  computeContractClassIdPreimage,
  computeSaltedInitializationHash,
} from '@aztec/circuits.js';
import { type Tuple } from '@aztec/foundation/serialize';

import { type ContractDataOracle } from '../contract_data_oracle/index.js';
import { type ProvingDataOracle } from './../kernel_prover/proving_data_oracle.js';

// TODO: Block number should not be "latest".
// It should be fixed at the time the proof is being simulated. I.e., it should be the same as the value defined in the constant data.
/**
 * A data oracle that provides information needed for simulating a transaction.
 */
export class KernelOracle implements ProvingDataOracle {
  constructor(private contractDataOracle: ContractDataOracle, private keyStore: KeyStore, private node: AztecNode) {}

  public async getContractAddressPreimage(address: AztecAddress) {
    const instance = await this.contractDataOracle.getContractInstance(address);
    return {
      saltedInitializationHash: computeSaltedInitializationHash(instance),
      ...instance,
    };
  }

  public async getContractClassIdPreimage(contractClassId: Fr) {
    const contractClass = await this.contractDataOracle.getContractClass(contractClassId);
    return computeContractClassIdPreimage(contractClass);
  }

  public async getFunctionMembershipWitness(contractAddress: AztecAddress, selector: FunctionSelector) {
    return await this.contractDataOracle.getFunctionMembershipWitness(contractAddress, selector);
  }

  public async getVkMembershipWitness() {
    return await this.contractDataOracle.getVkMembershipWitness();
  }

  async getNoteMembershipWitness(leafIndex: bigint): Promise<MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT>> {
    const path = await this.node.getNoteHashSiblingPath('latest', leafIndex);
    return new MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT>(
      path.pathSize,
      leafIndex,
      path.toFields() as Tuple<Fr, typeof NOTE_HASH_TREE_HEIGHT>,
    );
  }

  getNullifierMembershipWitness(nullifier: Fr) {
    return this.node.getNullifierMembershipWitness('latest', nullifier);
  }

  async getNoteHashTreeRoot(): Promise<Fr> {
    const header = await this.node.getHeader();
    return header.state.partial.noteHashTree.root;
  }

  public getMasterNullifierSecretKey(nullifierPublicKey: Point) {
    return this.keyStore.getNullifierSecretKeyFromPublicKey(nullifierPublicKey);
  }
}
