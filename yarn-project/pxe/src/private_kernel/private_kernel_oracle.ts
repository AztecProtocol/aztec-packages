import { FUNCTION_TREE_HEIGHT, NOTE_HASH_TREE_HEIGHT, PUBLIC_DATA_TREE_HEIGHT, VK_TREE_HEIGHT } from '@aztec/constants';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { GrumpkinScalar, Point } from '@aztec/foundation/curves/grumpkin';
import { MembershipWitness } from '@aztec/foundation/trees';
import type { KeyStore } from '@aztec/key-store';
import { getVKIndex, getVKSiblingPath } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import {
  type ContractInstanceWithAddress,
  computeContractClassIdPreimage,
  computeSaltedInitializationHash,
} from '@aztec/stdlib/contract';
import { DelayedPublicMutableValues, DelayedPublicMutableValuesWithHash } from '@aztec/stdlib/delayed-public-mutable';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { UpdatedClassIdHints } from '@aztec/stdlib/kernel';
import type { NullifierMembershipWitness } from '@aztec/stdlib/trees';
import type { VerificationKeyAsFields } from '@aztec/stdlib/vks';

import type { ContractStore } from '../storage/contract_store/contract_store.js';

/**
 * Provides functionality needed by the private kernel for interacting with our state trees.
 */
export class PrivateKernelOracle {
  constructor(
    private contractStore: ContractStore,
    private keyStore: KeyStore,
    private node: AztecNode,
    private blockHash: BlockHash,
  ) {}

  /** Retrieves the preimage of a contract address from the registered contract instances db. */
  public async getContractAddressPreimage(
    address: AztecAddress,
  ): Promise<ContractInstanceWithAddress & { saltedInitializationHash: Fr }> {
    const instance = await this.contractStore.getContractInstance(address);
    if (!instance) {
      throw new Error(`Contract instance not found when getting address preimage. Contract address: ${address}.`);
    }
    return {
      saltedInitializationHash: await computeSaltedInitializationHash(instance),
      ...instance,
    };
  }

  /** Retrieves the preimage of a contract class id from the contract classes db. */
  public async getContractClassIdPreimage(contractClassId: Fr) {
    const contractClass = await this.contractStore.getContractClass(contractClassId);
    if (!contractClass) {
      throw new Error(`Contract class not found when getting class id preimage. Class id: ${contractClassId}.`);
    }
    return computeContractClassIdPreimage(contractClass);
  }

  /** Returns a membership witness with the sibling path and leaf index in our private functions tree. */
  public async getFunctionMembershipWitness(
    contractClassId: Fr,
    selector: FunctionSelector,
  ): Promise<MembershipWitness<typeof FUNCTION_TREE_HEIGHT>> {
    const membershipWitness = await this.contractStore.getFunctionMembershipWitness(contractClassId, selector);
    if (!membershipWitness) {
      throw new Error(
        `Membership witness not found for contract class id ${contractClassId} and selector ${selector}.`,
      );
    }
    return membershipWitness;
  }

  /**
   * Returns a membership witness with the sibling path and leaf index in our protocol VK indexed merkle tree.
   * Used to validate the previous kernel's verification key.
   */
  public getVkMembershipWitness(vk: VerificationKeyAsFields): Promise<MembershipWitness<typeof VK_TREE_HEIGHT>> {
    const leafIndex = getVKIndex(vk);
    return Promise.resolve(new MembershipWitness(VK_TREE_HEIGHT, BigInt(leafIndex), getVKSiblingPath(leafIndex)));
  }

  /** Returns a membership witness with the sibling path and leaf index in our note hash tree. */
  getNoteHashMembershipWitness(noteHash: Fr): Promise<MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT> | undefined> {
    return this.node.getNoteHashMembershipWitness(this.blockHash, noteHash);
  }

  /** Returns a membership witness with the sibling path and leaf index in our nullifier indexed merkle tree. */
  getNullifierMembershipWitness(nullifier: Fr): Promise<NullifierMembershipWitness | undefined> {
    return this.node.getNullifierMembershipWitness(this.blockHash, nullifier);
  }

  /** Returns the root of our note hash merkle tree. */
  async getNoteHashTreeRoot(): Promise<Fr> {
    const header = await this.node.getBlockHeader(this.blockHash);
    if (!header) {
      throw new Error(`No block header found for block hash ${this.blockHash}`);
    }
    return header.state.partial.noteHashTree.root;
  }

  /**
   * Retrieves the sk_m corresponding to the pk_m.
   * @throws If the provided public key is not associated with any of the registered accounts.
   * @param masterPublicKey - The master public key to get secret key for.
   * @returns A Promise that resolves to sk_m.
   * @dev Used when feeding the sk_m to the kernel circuit for keys verification.
   */
  public getMasterSecretKey(masterPublicKey: Point): Promise<GrumpkinScalar> {
    return this.keyStore.getMasterSecretKey(masterPublicKey);
  }

  /** Use debug data to get the function name corresponding to a selector. */
  public getDebugFunctionName(contractAddress: AztecAddress, selector: FunctionSelector): Promise<string | undefined> {
    return this.contractStore.getDebugFunctionName(contractAddress, selector);
  }

  /**
   * Returns a membership witness and leaf index to our public data indexed merkle tree,
   * along with an associated DelayedPublicMutable containing the class ID to update.
   */
  public async getUpdatedClassIdHints(contractAddress: AztecAddress): Promise<UpdatedClassIdHints> {
    const { delayedPublicMutableSlot, delayedPublicMutableHashSlot } =
      await DelayedPublicMutableValuesWithHash.getContractUpdateSlots(contractAddress);

    const hashLeafSlot = await computePublicDataTreeLeafSlot(
      ProtocolContractAddress.ContractInstanceRegistry,
      delayedPublicMutableHashSlot,
    );
    const updatedClassIdWitness = await this.node.getPublicDataWitness(this.blockHash, hashLeafSlot);

    if (!updatedClassIdWitness) {
      throw new Error(`No public data tree witness found for ${hashLeafSlot}`);
    }

    const readStorage = (storageSlot: Fr) =>
      this.node.getPublicStorageAt(this.blockHash, ProtocolContractAddress.ContractInstanceRegistry, storageSlot);
    const delayedPublicMutableValues = await DelayedPublicMutableValues.readFromTree(
      delayedPublicMutableSlot,
      readStorage,
    );

    return new UpdatedClassIdHints(
      new MembershipWitness(
        PUBLIC_DATA_TREE_HEIGHT,
        updatedClassIdWitness.index,
        updatedClassIdWitness.siblingPath.toTuple(),
      ),
      updatedClassIdWitness.leafPreimage,
      delayedPublicMutableValues,
    );
  }
}
