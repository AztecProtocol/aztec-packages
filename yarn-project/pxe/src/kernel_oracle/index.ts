import { type AztecNode, type L2BlockNumber } from '@aztec/circuit-types';
import {
  type AztecAddress,
  Fr,
  type FunctionSelector,
  type GrumpkinScalar,
  type Point,
  type VerificationKeyAsFields,
  computeContractClassIdPreimage,
  computeSaltedInitializationHash,
} from '@aztec/circuits.js';
import { computePublicDataTreeLeafSlot, deriveStorageSlotInMap } from '@aztec/circuits.js/hash';
import { UpdatedClassIdHints } from '@aztec/circuits.js/kernel';
import {
  ScheduledDelayChange,
  ScheduledValueChange,
  computeSharedMutableHashSlot,
} from '@aztec/circuits.js/shared-mutable';
import {
  type NOTE_HASH_TREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
  UPDATED_CLASS_IDS_SLOT,
  UPDATES_SCHEDULED_VALUE_CHANGE_LEN,
  UPDATES_VALUE_SIZE,
  VK_TREE_HEIGHT,
} from '@aztec/constants';
import { createLogger } from '@aztec/foundation/log';
import { type Tuple } from '@aztec/foundation/serialize';
import { MembershipWitness } from '@aztec/foundation/trees';
import { type KeyStore } from '@aztec/key-store';
import { getVKIndex, getVKSiblingPath } from '@aztec/noir-protocol-circuits-types/vks';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';

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

  public async getUpdatedClassIdHints(contractAddress: AztecAddress): Promise<UpdatedClassIdHints> {
    const sharedMutableSlot = await deriveStorageSlotInMap(new Fr(UPDATED_CLASS_IDS_SLOT), contractAddress);

    const hashSlot = computeSharedMutableHashSlot(sharedMutableSlot, UPDATES_SCHEDULED_VALUE_CHANGE_LEN);

    const hashLeafSlot = await computePublicDataTreeLeafSlot(
      ProtocolContractAddress.ContractInstanceDeployer,
      hashSlot,
    );
    const updatedClassIdWitness = await this.node.getPublicDataTreeWitness(this.blockNumber, hashLeafSlot);

    if (!updatedClassIdWitness) {
      throw new Error(`No public data tree witness found for ${hashLeafSlot}`);
    }

    const readStorage = (storageSlot: Fr) =>
      this.node.getPublicStorageAt(ProtocolContractAddress.ContractInstanceDeployer, storageSlot, this.blockNumber);

    const valueChange = await ScheduledValueChange.readFromTree(sharedMutableSlot, UPDATES_VALUE_SIZE, readStorage);
    const delayChange = await ScheduledDelayChange.readFromTree(sharedMutableSlot, readStorage);

    return new UpdatedClassIdHints(
      new MembershipWitness(
        PUBLIC_DATA_TREE_HEIGHT,
        updatedClassIdWitness.index,
        updatedClassIdWitness.siblingPath.toTuple(),
      ),
      updatedClassIdWitness.leafPreimage,
      valueChange,
      delayChange,
    );
  }
}
