import {
  type FUNCTION_TREE_HEIGHT,
  type NOTE_HASH_TREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
  type VK_TREE_HEIGHT,
} from '@aztec/constants';
import type { Fr, GrumpkinScalar, Point } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import type { Tuple } from '@aztec/foundation/serialize';
import type { MembershipWitness } from '@aztec/foundation/trees';
import type { KeyStore } from '@aztec/key-store';
import { getVKIndex, getVKSiblingPath } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2BlockNumber } from '@aztec/stdlib/block';
import { computeContractClassIdPreimage, computeSaltedInitializationHash } from '@aztec/stdlib/contract';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { UpdatedClassIdHints } from '@aztec/stdlib/kernel';
import type { PublicKeys } from '@aztec/stdlib/keys';
import { SharedMutableValues, SharedMutableValuesWithHash } from '@aztec/stdlib/shared-mutable';
import type { NullifierMembershipWitness } from '@aztec/stdlib/trees';
import type { VerificationKeyAsFields } from '@aztec/stdlib/vks';

import type { ContractDataOracle } from '../contract_data_oracle/index.js';

/**
 * Provides functionality to fetch membership witnesses for verification keys,
 * contract addresses, and function selectors in their respective merkle trees.
 */
export interface ProvingDataOracle {
  /** Retrieves the preimage of a contract address from the registered contract instances db. */
  getContractAddressPreimage(address: AztecAddress): Promise<{
    saltedInitializationHash: Fr;
    publicKeys: PublicKeys;
    currentContractClassId: Fr;
    originalContractClassId: Fr;
  }>;

  /** Retrieves the preimage of a contract class id from the contract classes db. */
  getContractClassIdPreimage(
    contractClassId: Fr,
  ): Promise<{ artifactHash: Fr; publicBytecodeCommitment: Fr; privateFunctionsRoot: Fr }>;

  /**
   * Retrieve the function membership witness for the given contract class and function selector.
   * The function membership witness represents a proof that the function belongs to the specified contract.
   * Throws an error if the contract address or function selector is unknown.
   *
   * @param contractClassId - The id of the class.
   * @param selector - The function selector.
   * @returns A promise that resolves with the MembershipWitness instance for the specified contract's function.
   */
  getFunctionMembershipWitness(
    contractClassId: Fr,
    selector: FunctionSelector,
  ): Promise<MembershipWitness<typeof FUNCTION_TREE_HEIGHT>>;

  /**
   * Retrieve the membership witness corresponding to a verification key.
   * This function currently returns a random membership witness of the specified height,
   * which is a placeholder implementation until a concrete membership witness calculation
   * is implemented.
   *
   * @param vk - The VerificationKey for which the membership witness is needed.
   * @returns A Promise that resolves to the MembershipWitness instance.
   */
  getVkMembershipWitness(vk: VerificationKeyAsFields): Promise<MembershipWitness<typeof VK_TREE_HEIGHT>>;

  /**
   * Get the note membership witness for a note in the note hash tree at the given leaf index.
   *
   * @param leafIndex - The leaf index of the note in the note hash tree.
   * @returns the MembershipWitness for the note.
   */
  getNoteHashMembershipWitness(leafIndex: bigint): Promise<MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT>>;

  getNullifierMembershipWitness(nullifier: Fr): Promise<NullifierMembershipWitness | undefined>;

  /**
   * Get the root of the note hash tree.
   *
   * @returns the root of the note hash tree.
   */
  getNoteHashTreeRoot(): Promise<Fr>;

  /**
   * Retrieves the sk_m corresponding to the pk_m.
   * @throws If the provided public key is not associated with any of the registered accounts.
   * @param pkM - The master public key to get secret key for.
   * @returns A Promise that resolves to sk_m.
   * @dev Used when feeding the sk_m to the kernel circuit for keys verification.
   */
  getMasterSecretKey(masterPublicKey: Point): Promise<GrumpkinScalar>;

  getDebugFunctionName(contractAddress: AztecAddress, selector: FunctionSelector): Promise<string | undefined>;

  getUpdatedClassIdHints(contractAddress: AztecAddress): Promise<UpdatedClassIdHints>;
}

// TODO: Block number should not be "latest".
// It should be fixed at the time the proof is being simulated. I.e., it should be the same as the value defined in the constant data.
/**
 * A data oracle that provides information needed for simulating a transaction.
 */
export class KernelProvingDataOracle implements ProvingDataOracle {
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
      saltedInitializationHash: await computeSaltedInitializationHash(instance),
      ...instance,
    };
  }

  public async getContractClassIdPreimage(contractClassId: Fr) {
    const contractClass = await this.contractDataOracle.getContractClass(contractClassId);
    return computeContractClassIdPreimage(contractClass);
  }

  public async getFunctionMembershipWitness(contractClassId: Fr, selector: FunctionSelector) {
    return await this.contractDataOracle.getFunctionMembershipWitness(contractClassId, selector);
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

  getNullifierMembershipWitness(nullifier: Fr): Promise<NullifierMembershipWitness | undefined> {
    return this.node.getNullifierMembershipWitness(this.blockNumber, nullifier);
  }

  async getNoteHashTreeRoot(): Promise<Fr> {
    const header = await this.node.getBlockHeader(this.blockNumber);
    if (!header) {
      throw new Error(`No block header found for block number ${this.blockNumber}`);
    }
    return header.state.partial.noteHashTree.root;
  }

  public getMasterSecretKey(masterPublicKey: Point): Promise<GrumpkinScalar> {
    return this.keyStore.getMasterSecretKey(masterPublicKey);
  }

  public getDebugFunctionName(contractAddress: AztecAddress, selector: FunctionSelector): Promise<string> {
    return this.contractDataOracle.getDebugFunctionName(contractAddress, selector);
  }

  public async getUpdatedClassIdHints(contractAddress: AztecAddress): Promise<UpdatedClassIdHints> {
    const { sharedMutableSlot, sharedMutableHashSlot } = await SharedMutableValuesWithHash.getContractUpdateSlots(
      contractAddress,
    );

    const hashLeafSlot = await computePublicDataTreeLeafSlot(
      ProtocolContractAddress.ContractInstanceDeployer,
      sharedMutableHashSlot,
    );
    const updatedClassIdWitness = await this.node.getPublicDataTreeWitness(this.blockNumber, hashLeafSlot);

    if (!updatedClassIdWitness) {
      throw new Error(`No public data tree witness found for ${hashLeafSlot}`);
    }

    const readStorage = (storageSlot: Fr) =>
      this.node.getPublicStorageAt(ProtocolContractAddress.ContractInstanceDeployer, storageSlot, this.blockNumber);
    const sharedMutableValues = await SharedMutableValues.readFromTree(sharedMutableSlot, readStorage);

    return new UpdatedClassIdHints(
      new MembershipWitness(
        PUBLIC_DATA_TREE_HEIGHT,
        updatedClassIdWitness.index,
        updatedClassIdWitness.siblingPath.toTuple(),
      ),
      updatedClassIdWitness.leafPreimage,
      sharedMutableValues,
    );
  }
}
