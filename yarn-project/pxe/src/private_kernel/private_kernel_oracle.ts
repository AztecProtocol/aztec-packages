import {
  FUNCTION_TREE_HEIGHT,
  NOTE_HASH_TREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
  UPDATES_VALUE_SIZE,
  VK_TREE_HEIGHT,
} from '@aztec/constants';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import { MembershipWitness } from '@aztec/foundation/trees';
import type { KeyStore } from '@aztec/key-store';
import { getVKIndex, getVKSiblingPath } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type ContractInstanceWithAddress, computeSaltedInitializationHash } from '@aztec/stdlib/contract';
import { DelayedPublicMutableValues, DelayedPublicMutableValuesWithHash } from '@aztec/stdlib/delayed-public-mutable';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { UpdatedClassIdHints } from '@aztec/stdlib/kernel';
import type { NullifierMembershipWitness } from '@aztec/stdlib/trees';
import type { BlockHeader } from '@aztec/stdlib/tx';
import type { VerificationKeyAsFields } from '@aztec/stdlib/vks';

import type { ContractClassService } from '../contract/contract_class_service.js';
import { AnchoredContractData } from '../contract_function_simulator/anchored_contract_data.js';
import type { ContractStore } from '../storage/contract_store/contract_store.js';

/**
 * Provides functionality needed by the private kernel for interacting with our state trees.
 */
export class PrivateKernelOracle {
  private readonly anchoredContractData: AnchoredContractData;

  constructor(
    private contractStore: ContractStore,
    contractClassService: ContractClassService,
    private keyStore: KeyStore,
    private node: AztecNode,
    private blockHeader: BlockHeader,
  ) {
    // Kernels never use contract overrides (those are confined to simulations, which skip proving), so this view is
    // built without them.
    this.anchoredContractData = new AnchoredContractData(contractStore, contractClassService, blockHeader);
  }

  /** Retrieves the preimage of a contract address from the registered contract instances db. */
  public async getContractAddressPreimage(
    address: AztecAddress,
  ): Promise<ContractInstanceWithAddress & { saltedInitializationHash: Fr }> {
    const instance = await this.anchoredContractData.getContractInstance(address);
    if (!instance) {
      throw new Error(`Contract instance not found when getting address preimage. Contract address: ${address}.`);
    }
    // Local instance existence was checked above, so resolution below cannot come back empty.
    const currentContractClassId = await this.anchoredContractData.getCurrentClassId(address);
    if (!currentContractClassId) {
      throw new Error(`Could not resolve the current class id for registered contract ${address}.`);
    }
    return {
      saltedInitializationHash: await computeSaltedInitializationHash(instance),
      ...instance,
      currentContractClassId,
    };
  }

  /** Retrieves the preimage of a contract class id from the contract classes db. */
  public async getContractClassIdPreimage(contractClassId: Fr) {
    const contractClass = await this.contractStore.getContractClassWithPreimage(contractClassId);
    if (!contractClass) {
      throw new Error(`Contract class not found when getting class id preimage. Class id: ${contractClassId}.`);
    }
    return {
      artifactHash: contractClass.artifactHash,
      privateFunctionsRoot: contractClass.privateFunctionsRoot,
      publicBytecodeCommitment: contractClass.publicBytecodeCommitment,
    };
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
  async getNoteHashMembershipWitness(
    noteHash: Fr,
  ): Promise<MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT> | undefined> {
    return this.node.getNoteHashMembershipWitness(await this.blockHeader.toBlockParameter(), noteHash);
  }

  /** Returns a membership witness with the sibling path and leaf index in our nullifier indexed merkle tree. */
  async getNullifierMembershipWitness(nullifier: Fr): Promise<NullifierMembershipWitness | undefined> {
    return this.node.getNullifierMembershipWitness(await this.blockHeader.toBlockParameter(), nullifier);
  }

  /** Returns the root of our note hash merkle tree. */
  getNoteHashTreeRoot(): Fr {
    return this.blockHeader.state.partial.noteHashTree.root;
  }

  /**
   * Retrieves the sk_m corresponding to the pk_m hash.
   * @throws If the provided hash is not associated with any of the registered accounts.
   * @param masterPublicKeyHash - The master public key hash to get secret key for.
   * @returns A Promise that resolves to sk_m.
   * @dev Used when feeding the sk_m to the kernel circuit for keys verification.
   */
  public getMasterSecretKey(masterPublicKeyHash: Fr): Promise<GrumpkinScalar> {
    return this.keyStore.getMasterSecretKey(masterPublicKeyHash);
  }

  /** Use debug data to get the function name corresponding to a selector. */
  public async getDebugFunctionName(
    contractAddress: AztecAddress,
    selector: FunctionSelector,
  ): Promise<string | undefined> {
    const classId = await this.anchoredContractData.getCurrentClassId(contractAddress);
    return classId ? this.contractStore.getDebugFunctionName(classId, selector) : undefined;
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
    const anchor = await this.blockHeader.toBlockParameter();

    const updatedClassIdWitness = await this.node.getPublicDataWitness(anchor, hashLeafSlot);

    if (!updatedClassIdWitness) {
      throw new Error(`No public data tree witness found for ${hashLeafSlot}`);
    }

    // In an indexed merkle tree, getPublicDataWitness returns a leaf whose slot matches our query
    // only if the slot has been written to. Otherwise, it returns the "low leaf" predecessor, whose
    // slot will differ. Most contracts are never updated, so we can skip the readFromTree call
    // (which triggers multiple RPC calls) and return empty values directly.
    const readStorage = (storageSlot: Fr) =>
      this.node.getPublicStorageAt(anchor, ProtocolContractAddress.ContractInstanceRegistry, storageSlot);
    const slotExists = updatedClassIdWitness.leafPreimage.leaf.slot.equals(hashLeafSlot);
    const delayedPublicMutableValues = slotExists
      ? await DelayedPublicMutableValues.readFromTree(delayedPublicMutableSlot, readStorage)
      : DelayedPublicMutableValues.empty(UPDATES_VALUE_SIZE);

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
