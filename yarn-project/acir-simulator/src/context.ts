
import { PRIVATE_DATA_TREE_HEIGHT, PrivateHistoricTreeRoots } from '@aztec/circuits.js';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import {
  ACVMField,
  ZERO_ACVM_FIELD,
  createDummyNote,
  fromACVMField,
  toACVMField,
  toAcvmMessageLoadOracleInputs,
  toAcvmNoteLoadOracleInputs,
} from './acvm/index.js';
// TODO(Maddiaa): move
import { DBOracle } from './client/db_oracle.js';


/**
 * Execution context shared between public and private execution environments
 * TODO:(Maddiaa)
 */
export class ExecutionContext {
  constructor(
    /** The database oracle. */
    public db: DBOracle,
    /** The roots for this execution. */
    // TODO:(Maddiaa): do these need to be explicitly private i dont think so????
    public historicRoots: PrivateHistoricTreeRoots
  ) {}

  /**
   * Gets the notes for a contract address and storage slot.
   * Returns note load oracle inputs, which includes the paths and the roots.
   * @param contractAddress - The contract address.
   * @param storageSlot - The storage slot.
   * @param limit - The amount of notes to get.
   * @returns The ACVM fields for the counts and the requested note load oracle inputs.
   */
  public async getNotes(contractAddress: AztecAddress, storageSlot: ACVMField, limit: number) {
    const { count, notes } = await this.fetchNotes(contractAddress, storageSlot, limit);
    return [
      toACVMField(count),
      ...notes.flatMap(noteGetData => toAcvmNoteLoadOracleInputs(noteGetData, this.historicRoots.privateDataTreeRoot)),
    ];
  }

  /**
   * Fetches the notes for a contract address and storage slot from the db.
   * @param contractAddress - The contract address.
   * @param storageSlot - The storage slot.
   * @param limit - The amount of notes to get.
   * @param offset - The offset to start from (for pagination).
   * @returns The count and the requested notes, padded with dummy notes.
   */
  protected async fetchNotes(contractAddress: AztecAddress, storageSlot: ACVMField, limit: number, offset = 0) {
    const { count, notes } = await this.db.getNotes(contractAddress, fromACVMField(storageSlot), limit, offset);

    const dummyNotes = Array.from({ length: Math.max(0, limit - notes.length) }, () => ({
      preimage: createDummyNote(),
      siblingPath: new Array(PRIVATE_DATA_TREE_HEIGHT).fill(Fr.ZERO),
      index: 0n,
    }));

    return {
      count,
      notes: notes.concat(dummyNotes),
    };
  }

  /**
   * Views the notes for a contract address and storage slot.
   * Doesn't include the sibling paths and the root.
   * @param contractAddress - The contract address.
   * @param storageSlot - The storage slot.
   * @param limit - The amount of notes to get.
   * @param offset - The offset to start from (for pagination).
   * @returns The ACVM fields for the count and the requested notes.
   */
  public async viewNotes(contractAddress: AztecAddress, storageSlot: ACVMField, limit: number, offset = 0) {
    const { count, notes } = await this.fetchNotes(contractAddress, storageSlot, limit, offset);

    return [toACVMField(count), ...notes.flatMap(noteGetData => noteGetData.preimage.map(f => toACVMField(f)))];
  }


  /**
   * Fetches the a message from the db, given its key.
   * @param msgKey - A buffer representing the message key.
   * @returns The message data
   */
  public async getL1ToL2Message(msgKey: Fr): Promise<ACVMField[]> {
    const messageInputs = await this.db.getL1ToL2Message(msgKey);
    return toAcvmMessageLoadOracleInputs(messageInputs, this.historicRoots.l1ToL2MessagesTreeRoot);
  }

  /**
   * Fetches a message from the db given its key.
   * @param msgKey - A buffer representing the key in the commitments tree.
   * @returns The message data
   */ 
  // TODO(SEAN): This note will be siloed by the contract it is being called from's address
  // we will probably need to replicate this in the noir contract for it to be valid.
  // TODO: stubbed
  public async getMessage(msgKey: Fr): Promise<ACVMField[]> {
    void msgKey;
    // const message = await this.db.getMessage(msgKey);
    return await Promise.resolve([ZERO_ACVM_FIELD]);
  }
  
}