import { DBOracle, FunctionArtifactWithDebugMetadata, MessageLoadOracleInputs } from '@aztec/acir-simulator';
import {
  AztecAddress,
  CompleteAddress,
  EthAddress,
  Fr,
  FunctionSelector,
  GrumpkinPrivateKey,
  HistoricBlockData,
  PublicKey,
} from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { KeyStore, MerkleTreeId, StateInfoProvider } from '@aztec/types';

import { ContractDataOracle } from '../contract_data_oracle/index.js';
import { Database } from '../database/index.js';

/**
 * A data oracle that provides information needed for simulating a transaction.
 */
export class SimulatorOracle implements DBOracle {
  constructor(
    private contractDataOracle: ContractDataOracle,
    private db: Database,
    private keyStore: KeyStore,
    private stateInfoProvider: StateInfoProvider,
    private log = createDebugLogger('aztec:pxe:simulator_oracle'),
  ) {}

  getSecretKey(_contractAddress: AztecAddress, pubKey: PublicKey): Promise<GrumpkinPrivateKey> {
    return this.keyStore.getAccountPrivateKey(pubKey);
  }

  async getCompleteAddress(address: AztecAddress): Promise<CompleteAddress> {
    const completeAddress = await this.db.getCompleteAddress(address);
    if (!completeAddress) {
      throw new Error(
        `No public key registered for address ${address.toString()}. Register it by calling pxe.registerRecipient(...) or pxe.registerAccount(...).\nSee docs for context: https://docs.aztec.network/dev_docs/contracts/common_errors#no-public-key-registered-error`,
      );
    }
    return completeAddress;
  }

  async getAuthWitness(messageHash: Fr): Promise<Fr[]> {
    const witness = await this.db.getAuthWitness(messageHash);
    if (!witness) {
      throw new Error(`Unknown auth witness for message hash ${messageHash.toString()}`);
    }
    return witness;
  }

  async popCapsule(): Promise<Fr[]> {
    const capsule = await this.db.popCapsule();
    if (!capsule) {
      throw new Error(`No capsules available`);
    }
    return capsule;
  }

  async getNotes(contractAddress: AztecAddress, storageSlot: Fr) {
    const noteDaos = await this.db.getNotes({ contractAddress, storageSlot });
    return noteDaos.map(({ contractAddress, storageSlot, nonce, note, innerNoteHash, siloedNullifier, index }) => ({
      contractAddress,
      storageSlot,
      nonce,
      note,
      innerNoteHash,
      siloedNullifier,
      // PXE can use this index to get full MembershipWitness
      index,
    }));
  }

  async getFunctionArtifact(
    contractAddress: AztecAddress,
    selector: FunctionSelector,
  ): Promise<FunctionArtifactWithDebugMetadata> {
    const artifact = await this.contractDataOracle.getFunctionArtifact(contractAddress, selector);
    const debug = await this.contractDataOracle.getFunctionDebugMetadata(contractAddress, selector);
    return {
      ...artifact,
      debug,
    };
  }

  async getFunctionArtifactByName(
    contractAddress: AztecAddress,
    functionName: string,
  ): Promise<FunctionArtifactWithDebugMetadata | undefined> {
    const artifact = await this.contractDataOracle.getFunctionArtifactByName(contractAddress, functionName);
    if (!artifact) {
      return;
    }

    const debug = await this.contractDataOracle.getFunctionDebugMetadata(contractAddress, artifact.selector);
    return {
      ...artifact,
      debug,
    };
  }

  async getPortalContractAddress(contractAddress: AztecAddress): Promise<EthAddress> {
    return await this.contractDataOracle.getPortalContractAddress(contractAddress);
  }

  /**
   * Retrieves the L1ToL2Message associated with a specific message key
   * Throws an error if the message key is not found
   *
   * @param msgKey - The key of the message to be retrieved
   * @returns A promise that resolves to the message data, a sibling path and the
   *          index of the message in the l1ToL2MessagesTree
   */
  async getL1ToL2Message(msgKey: Fr): Promise<MessageLoadOracleInputs> {
    const messageAndIndex = await this.stateInfoProvider.getL1ToL2MessageAndIndex(msgKey);
    const message = messageAndIndex.message.toFieldArray();
    const index = messageAndIndex.index;
    const siblingPath = await this.stateInfoProvider.getL1ToL2MessageSiblingPath(index);
    return {
      message,
      siblingPath: siblingPath.toFieldArray(),
      index,
    };
  }

  /**
   * Gets the index of a commitment in the note hash tree.
   * @param commitment - The commitment.
   * @returns - The index of the commitment. Undefined if it does not exist in the tree.
   */
  async getCommitmentIndex(commitment: Fr) {
    return await this.stateInfoProvider.findLeafIndex(MerkleTreeId.NOTE_HASH_TREE, commitment);
  }

  async getNullifierIndex(nullifier: Fr) {
    return await this.stateInfoProvider.findLeafIndex(MerkleTreeId.NULLIFIER_TREE, nullifier);
  }

  public async findLeafIndex(blockNumber: number, treeId: MerkleTreeId, leafValue: Fr): Promise<bigint | undefined> {
    this.log.warn('Block number ignored in SimulatorOracle.findLeafIndex because archival node is not yet implemented');
    return await this.stateInfoProvider.findLeafIndex(treeId, leafValue);
  }

  public async getSiblingPath(blockNumber: number, treeId: MerkleTreeId, leafIndex: bigint): Promise<Fr[]> {
    this.log.warn(
      'Block number ignored in SimulatorOracle.getSiblingPath because archival node is not yet implemented',
    );
    // @todo Doing a nasty workaround here because of https://github.com/AztecProtocol/aztec-packages/issues/3414
    switch (treeId) {
      case MerkleTreeId.NOTE_HASH_TREE:
        return (await this.stateInfoProvider.getNoteHashSiblingPath(leafIndex)).toFieldArray();
      case MerkleTreeId.BLOCKS_TREE:
        return (await this.stateInfoProvider.getHistoricBlocksTreeSiblingPath(leafIndex)).toFieldArray();
      default:
        throw new Error('Not implemented');
    }
  }

  /**
   * Retrieve the databases view of the Historic Block Data object.
   * This structure is fed into the circuits simulator and is used to prove against certain historic roots.
   *
   * @returns A Promise that resolves to a HistoricBlockData object.
   */
  getHistoricBlockData(): Promise<HistoricBlockData> {
    return Promise.resolve(this.db.getHistoricBlockData());
  }
}
