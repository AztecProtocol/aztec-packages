import { CompleteAddress, HistoricBlockData } from '@aztec/circuits.js';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
import { MerkleTreeId, PublicKey } from '@aztec/types';

import { MemoryContractDatabase } from '../contract_database/index.js';
import { Database } from './database.js';
import { NoteSpendingInfoDao, getNoteSpendingInfoDaoSize } from './note_spending_info_dao.js';

/**
 * The MemoryDB class provides an in-memory implementation of a database to manage transactions and auxiliary data.
 * It extends the MemoryContractDatabase, allowing it to store contract-related data as well.
 * The class offers methods to add, fetch, and remove transaction records and auxiliary data based on various filters such as transaction hash, address, and storage slot.
 * As an in-memory database, the stored data will not persist beyond the life of the application instance.
 */
export class MemoryDB extends MemoryContractDatabase implements Database {
  private noteSpendingInfoTable: NoteSpendingInfoDao[] = [];
  private treeRoots: Record<MerkleTreeId, Fr> | undefined;
  private globalVariablesHash: Fr | undefined;
  private addresses: CompleteAddress[] = [];
  private authWitnesses: Record<string, Fr[]> = {};

  constructor(logSuffix?: string) {
    super(createDebugLogger(logSuffix ? 'aztec:memory_db_' + logSuffix : 'aztec:memory_db'));
  }

  /**
   * Add a auth witness to the database.
   * @param messageHash - The message hash.
   * @param witness - An array of field elements representing the auth witness.
   */
  public addAuthWitness(messageHash: Fr, witness: Fr[]): Promise<void> {
    this.authWitnesses[messageHash.toString()] = witness;
    return Promise.resolve();
  }

  /**
   * Fetching the auth witness for a given message hash.
   * @param messageHash - The message hash.
   * @returns A Promise that resolves to an array of field elements representing the auth witness.
   */
  public getAuthWitness(messageHash: Fr): Promise<Fr[]> {
    return Promise.resolve(this.authWitnesses[messageHash.toString()]);
  }

  public addNoteSpendingInfo(noteSpendingInfoDao: NoteSpendingInfoDao) {
    this.noteSpendingInfoTable.push(noteSpendingInfoDao);
    return Promise.resolve();
  }

  public addNoteSpendingInfoBatch(noteSpendingInfoDaos: NoteSpendingInfoDao[]) {
    this.noteSpendingInfoTable.push(...noteSpendingInfoDaos);
    return Promise.resolve();
  }

  public getNoteSpendingInfo(contract: AztecAddress, storageSlot: Fr) {
    const res = this.noteSpendingInfoTable.filter(
      noteSpendingInfo =>
        noteSpendingInfo.contractAddress.equals(contract) &&
        noteSpendingInfo.storageSlot.toBuffer().equals(storageSlot.toBuffer()),
    );
    return Promise.resolve(res);
  }

  public removeNullifiedNoteSpendingInfo(nullifiers: Fr[], account: PublicKey) {
    const nullifierSet = new Set(nullifiers.map(nullifier => nullifier.toString()));
    const [remaining, removed] = this.noteSpendingInfoTable.reduce(
      (acc: [NoteSpendingInfoDao[], NoteSpendingInfoDao[]], noteSpendingInfo) => {
        const nullifier = noteSpendingInfo.siloedNullifier.toString();
        if (noteSpendingInfo.publicKey.equals(account) && nullifierSet.has(nullifier)) {
          acc[1].push(noteSpendingInfo);
        } else {
          acc[0].push(noteSpendingInfo);
        }
        return acc;
      },
      [[], []],
    );

    this.noteSpendingInfoTable = remaining;

    return Promise.resolve(removed);
  }

  public getTreeRoots(): Record<MerkleTreeId, Fr> {
    const roots = this.treeRoots;
    if (!roots) throw new Error(`Tree roots not set in memory database`);
    return roots;
  }

  public setTreeRoots(roots: Record<MerkleTreeId, Fr>) {
    this.treeRoots = roots;
    return Promise.resolve();
  }

  public getHistoricBlockData(): HistoricBlockData {
    const roots = this.getTreeRoots();
    if (!this.globalVariablesHash) throw new Error(`Global variables hash not set in memory database`);
    return new HistoricBlockData(
      roots[MerkleTreeId.PRIVATE_DATA_TREE],
      roots[MerkleTreeId.NULLIFIER_TREE],
      roots[MerkleTreeId.CONTRACT_TREE],
      roots[MerkleTreeId.L1_TO_L2_MESSAGES_TREE],
      roots[MerkleTreeId.BLOCKS_TREE],
      Fr.ZERO, // todo: private kernel vk tree root
      roots[MerkleTreeId.PUBLIC_DATA_TREE],
      this.globalVariablesHash,
    );
  }

  public async setHistoricBlockData(historicBlockData: HistoricBlockData): Promise<void> {
    this.globalVariablesHash = historicBlockData.globalVariablesHash;
    await this.setTreeRoots({
      [MerkleTreeId.PRIVATE_DATA_TREE]: historicBlockData.privateDataTreeRoot,
      [MerkleTreeId.NULLIFIER_TREE]: historicBlockData.nullifierTreeRoot,
      [MerkleTreeId.CONTRACT_TREE]: historicBlockData.contractTreeRoot,
      [MerkleTreeId.L1_TO_L2_MESSAGES_TREE]: historicBlockData.l1ToL2MessagesTreeRoot,
      [MerkleTreeId.BLOCKS_TREE]: historicBlockData.blocksTreeRoot,
      [MerkleTreeId.PUBLIC_DATA_TREE]: historicBlockData.publicDataTreeRoot,
    });
  }

  public addCompleteAddress(completeAddress: CompleteAddress): Promise<boolean> {
    const accountIndex = this.addresses.findIndex(r => r.address.equals(completeAddress.address));
    if (accountIndex !== -1) {
      if (this.addresses[accountIndex].equals(completeAddress)) {
        return Promise.resolve(false);
      }

      throw new Error(
        `Complete address with aztec address ${completeAddress.address.toString()} but different public key or partial key already exists in memory database`,
      );
    }
    this.addresses.push(completeAddress);
    return Promise.resolve(true);
  }

  public getCompleteAddress(address: AztecAddress): Promise<CompleteAddress | undefined> {
    const recipient = this.addresses.find(r => r.address.equals(address));
    return Promise.resolve(recipient);
  }

  public getCompleteAddresses(): Promise<CompleteAddress[]> {
    return Promise.resolve(this.addresses);
  }

  public estimateSize() {
    const notesSize = this.noteSpendingInfoTable.reduce((sum, note) => sum + getNoteSpendingInfoDaoSize(note), 0);
    const treeRootsSize = this.treeRoots ? Object.entries(this.treeRoots).length * Fr.SIZE_IN_BYTES : 0;
    const authWits = Object.entries(this.authWitnesses);
    const authWitsSize = authWits.reduce((sum, [key, value]) => sum + key.length + value.length * Fr.SIZE_IN_BYTES, 0);
    return notesSize + treeRootsSize + authWitsSize + this.addresses.length * CompleteAddress.SIZE_IN_BYTES;
  }
}
