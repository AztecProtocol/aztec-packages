import { NOTE_HASH_TREE_HEIGHT, PUBLIC_DATA_TREE_HEIGHT, VK_TREE_HEIGHT } from '@aztec/constants';
import type { Fr, GrumpkinScalar, Point } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import type { Tuple } from '@aztec/foundation/serialize';
import { MembershipWitness } from '@aztec/foundation/trees';
import type { KeyStore } from '@aztec/key-store';
import { getVKIndex, getVKSiblingPath } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2BlockNumber } from '@aztec/stdlib/block';
import { computeContractClassIdPreimage, computeSaltedInitializationHash } from '@aztec/stdlib/contract';
import { DelayedPublicMutableValues, DelayedPublicMutableValuesWithHash } from '@aztec/stdlib/delayed-public-mutable';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { UpdatedClassIdHints } from '@aztec/stdlib/kernel';
import type { NullifierMembershipWitness } from '@aztec/stdlib/trees';
import type { VerificationKeyAsFields } from '@aztec/stdlib/vks';

import type { ContractDataProvider } from '../storage/index.js';
import type { PrivateKernelOracle } from './private_kernel_oracle.js';

// TODO: Block number should not be "latest".
// It should be fixed at the time the proof is being simulated. I.e., it should be the same as the value defined in the constant data.

/**
 * A data oracle that provides information needed for simulating a transaction.
 */
export class PrivateKernelOracleImpl implements PrivateKernelOracle {
  constructor(
    private contractDataProvider: ContractDataProvider,
    private keyStore: KeyStore,
    private node: AztecNode,
    private blockNumber: L2BlockNumber = 'latest',
    private log = createLogger('pxe:kernel_oracle'),
  ) {}

  public async getContractAddressPreimage(address: AztecAddress) {
    const instance = await this.contractDataProvider.getContractInstance(address);
    if (!instance) {
      throw new Error(`Contract instance not found when getting address preimage. Contract address: ${address}.`);
    }
    return {
      saltedInitializationHash: await computeSaltedInitializationHash(instance),
      ...instance,
    };
  }

  public async getContractClassIdPreimage(contractClassId: Fr) {
    const contractClass = await this.contractDataProvider.getContractClass(contractClassId);
    if (!contractClass) {
      throw new Error(`Contract class not found when getting class id preimage. Class id: ${contractClassId}.`);
    }
    return computeContractClassIdPreimage(contractClass);
  }

  public async getFunctionMembershipWitness(contractClassId: Fr, selector: FunctionSelector) {
    const membershipWitness = await this.contractDataProvider.getFunctionMembershipWitness(contractClassId, selector);
    if (!membershipWitness) {
      throw new Error(
        `Membership witness not found for contract class id ${contractClassId} and selector ${selector}.`,
      );
    }
    return membershipWitness;
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
    return this.contractDataProvider.getDebugFunctionName(contractAddress, selector);
  }

  public async getUpdatedClassIdHints(contractAddress: AztecAddress): Promise<UpdatedClassIdHints> {
    const { delayedPublicMutableSlot, delayedPublicMutableHashSlot } =
      await DelayedPublicMutableValuesWithHash.getContractUpdateSlots(contractAddress);

    const hashLeafSlot = await computePublicDataTreeLeafSlot(
      ProtocolContractAddress.ContractInstanceRegistry,
      delayedPublicMutableHashSlot,
    );
    const updatedClassIdWitness = await this.node.getPublicDataWitness(this.blockNumber, hashLeafSlot);

    if (!updatedClassIdWitness) {
      throw new Error(`No public data tree witness found for ${hashLeafSlot}`);
    }

    const readStorage = (storageSlot: Fr) =>
      this.node.getPublicStorageAt(this.blockNumber, ProtocolContractAddress.ContractInstanceRegistry, storageSlot);
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
