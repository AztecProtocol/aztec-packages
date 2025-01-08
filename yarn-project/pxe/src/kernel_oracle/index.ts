import { type AztecNode, type L2BlockNumber } from '@aztec/circuit-types';
import {
  type AztecAddress,
  type Fr,
  type FunctionSelector,
  type GrumpkinScalar,
  MembershipWitness,
  type NOTE_HASH_TREE_HEIGHT,
  type Point,
  VK_TREE_HEIGHT,
  type VerificationKeyAsFields,
  computeContractClassIdPreimage,
  computeSaltedInitializationHash,
} from '@aztec/circuits.js';
import { createLogger } from '@aztec/foundation/log';
import { type Tuple } from '@aztec/foundation/serialize';
import { type KeyStore } from '@aztec/key-store';
import { getVKIndex, getVKSiblingPath } from '@aztec/noir-protocol-circuits-types/client_async';

import { type ContractDataOracle } from '../contract_data_oracle/index.js';
import { type ProvingDataOracle } from './../kernel_prover/proving_data_oracle.js';

// TODO: Block number should not be "latest".
// It should be fixed at the time the proof is being simulated. I.e., it should be the same as the value defined in the constant data.
/**
 * A data oracle that provides information needed for simulating a transaction.
 */
export class KernelOracle implements ProvingDataOracle {
  constructor(
    private contractDataOracle: ContractDataOracle,
    private keyStore: KeyStore,
    private node: AztecNode,
    private blockNumber: L2BlockNumber = 'latest',
    private log = createLogger('pxe:kernel_oracle'),
  ) {}

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

  public getVkMembershipWitness(vk: VerificationKeyAsFields) {
    const leafIndex = getVKIndex(vk);
    return Promise.resolve(new MembershipWitness(VK_TREE_HEIGHT, BigInt(leafIndex), getVKSiblingPath(leafIndex)));
  }

  async getNoteHashMembershipWitness(leafIndex: bigint): Promise<MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT>> {
    const path = await this.node.getNoteHashSiblingPath(this.blockNumber, leafIndex);
    return new MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT>(
      path.pathSize,
      leafIndex,
      path.toFields() as Tuple<Fr, typeof NOTE_HASH_TREE_HEIGHT>,
    );
  }

  getNullifierMembershipWitness(nullifier: Fr) {
    return this.node.getNullifierMembershipWitness(this.blockNumber, nullifier);
  }

  async getNoteHashTreeRoot(): Promise<Fr> {
    const header = await this.node.getBlockHeader(this.blockNumber);
    return header.state.partial.noteHashTree.root;
  }

  public getMasterSecretKey(masterPublicKey: Point): Promise<GrumpkinScalar> {
    return this.keyStore.getMasterSecretKey(masterPublicKey);
  }

  public getDebugFunctionName(contractAddress: AztecAddress, selector: FunctionSelector): Promise<string> {
    return this.contractDataOracle.getDebugFunctionName(contractAddress, selector);
  }
}
