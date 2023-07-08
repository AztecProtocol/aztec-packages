import { PrivateHistoricTreeRoots, ReadRequestMembershipWitness, TxContext } from '@aztec/circuits.js';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import {
  ACVMField,
  ACVMFieldsReader,
  fromACVMField,
  toACVMField,
  toAcvmCommitmentLoadOracleInputs,
  toAcvmL1ToL2MessageLoadOracleInputs,
} from '../acvm/index.js';
import { PackedArgsCache } from '../packed_args_cache.js';
import { DBOracle } from './db_oracle.js';

/**
 * Information about a note created during execution.
 */
export type PendingNoteData = {
  /** The preimage of the created note */
  preimage: ACVMField[];
  /** The contract address of the commitment. */
  contractAddress: AztecAddress;
  /** The storage slot of the commitment. */
  storageSlot: Fr;
};

/**
 * The execution context for a client tx simulation.
 */
export class ClientTxExecutionContext {
  // Note: need to make sure that readRequestPartialWitnesses does not accumulate across
  // multiple calls in a TX.
  private readRequestPartialWitnesses: ReadRequestMembershipWitness[] = [];

  constructor(
    /**  The database oracle. */
    public db: DBOracle,
    /** The tx context. */
    public txContext: TxContext,
    /** The old roots. */
    public historicRoots: PrivateHistoricTreeRoots,
    /** The cache of packed arguments */
    public packedArgsCache: PackedArgsCache,
    /** Pending commitments created (and not nullified) up to current point in execution **/
    public pendingNotes: PendingNoteData[] = [],
  ) {}

  /**
   * Create context for nested executions.
   * @returns ClientTxExecutionContext
   */
  public extend() {
    return new ClientTxExecutionContext(
      this.db,
      this.txContext,
      this.historicRoots,
      this.packedArgsCache,
      this.pendingNotes,
    );
  }

  /**
   * For getting accumulated data.
   * @returns An array of partially filled in read request membership witnesses.
   */
  public getReadRequestPartialWitnesses() {
    return this.readRequestPartialWitnesses;
  }

  /**
   * Gets the notes for a contract address and storage slot.
   * Returns flattened array containing real-note-count and note preimages.
   *
   * Details:
   * Check for pending notes with matching address/slot.
   * If limit isn't reached after pending notes are all checked,
   * fetchNotes from DB with modified limit.
   * Real notes coming from DB will have a leafIndex which
   * represents their index in the private data tree.
   * Pending notes will have no leaf index and will be flagged
   * as transient since they don't exist (yet) in the private data tree.
   *
   * This function will populate this.readRequestPartialWitnesses which
   * here is just used to flag reads as "transient" or not and to mark
   * non-transient reads with their leafIndex. The KernelProver will
   * use this to fully populate the witnesses.
   *
   * @param contractAddress - The contract address.
   * @param fields - An array of ACVM fields.
   * @returns An array of ACVM fields containing the note count and the requested note preimages.
   */
  public async getNotes(contractAddress: AztecAddress, fields: ACVMField[]) {
    const reader = new ACVMFieldsReader(fields);
    const storageSlot = reader.readField();
    const noteSize = reader.readNumber();
    const sortBy = reader.readNumberArray(noteSize);
    const sortOrder = reader.readNumberArray(noteSize);
    const limit = reader.readNumber();
    const offset = reader.readNumber();
    const returnSize = reader.readNumber();

    // TODO(dbanks12): how should sorting and offset affect pending commitments?
    let pendingCount = 0;
    const pendingPreimages: ACVMField[] = []; // flattened fields representing preimages
    console.log(`Looking for ${limit} notes matching ${contractAddress.toString()} ${storageSlot.toString()}`);
    console.log(`There are ${this.pendingNotes.length} pending notes to check`);
    for (const note of this.pendingNotes) {
      if (pendingCount == limit) {
        break;
      }
      console.log(`Checking pending note ${note.contractAddress.toString()} ${note.storageSlot.toString()}`);
      console.log(`note.contractAddress.equals(contractAddress): ${note.contractAddress.equals(contractAddress)}`);
      console.log(`note.storageSlot == storageSlot: ${note.storageSlot.equals(storageSlot)}`);
      if (note.contractAddress.equals(contractAddress) && note.storageSlot.equals(storageSlot)) {
        pendingCount++;
        console.log(`\t\tFound pending note ${note.contractAddress.toString()} ${note.storageSlot.toString()}`);
        console.log(`\t\tThat was the ${pendingCount}th pending note found this run`);
        console.log(`\t\tPreimage 0th entry: ${note.preimage[0].toString()}`);
        pendingPreimages.push(...note.preimage); // flattened
        this.readRequestPartialWitnesses.push(ReadRequestMembershipWitness.newTransient(new Fr(0), new Fr(0)));
      }
    }

    const dbLimit = limit - pendingCount;
    const { count: dbCount, notes: dbNotes } = await this.db.getNotes(
      contractAddress,
      storageSlot,
      sortBy,
      sortOrder,
      dbLimit,
      offset,
    );
    const dbPreimages = dbNotes.flatMap(({ preimage }) => preimage).map(f => toACVMField(f));

    // Combine pending and db preimages into a single flattened array.
    const preimages = [...pendingPreimages, ...dbPreimages];

    // Add a partial witness for each note from the db containing only the note index.
    // By default they will be flagged as non-transient.
    this.readRequestPartialWitnesses.push(...dbNotes.map(note => ReadRequestMembershipWitness.empty(note.index)));

    const paddedZeros = Array(returnSize - 1 - preimages.length).fill(toACVMField(Fr.ZERO));
    return [toACVMField(pendingCount + dbCount), ...preimages, ...paddedZeros];
  }

  /**
   * Fetches the a message from the db, given its key.
   * @param msgKey - A buffer representing the message key.
   * @returns The l1 to l2 message data
   */
  public async getL1ToL2Message(msgKey: Fr): Promise<ACVMField[]> {
    const messageInputs = await this.db.getL1ToL2Message(msgKey);
    return toAcvmL1ToL2MessageLoadOracleInputs(messageInputs, this.historicRoots.l1ToL2MessagesTreeRoot);
  }

  /**
   * Fetches a path to prove existence of a commitment in the db, given its contract side commitment (before silo).
   * @param contractAddress - The contract address.
   * @param commitment - The commitment.
   * @returns The commitment data.
   */
  public async getCommitment(contractAddress: AztecAddress, commitment: ACVMField) {
    const commitmentInputs = await this.db.getCommitmentOracle(contractAddress, fromACVMField(commitment));
    // TODO(dbanks12): support getting pending commitments
    // - may require notifyCreatedNote to output commitment as well, but then it may
    // need to be siloed here commitments in tree are siloed by kernel
    this.readRequestPartialWitnesses.push(ReadRequestMembershipWitness.empty(commitmentInputs.index));
    return toAcvmCommitmentLoadOracleInputs(commitmentInputs, this.historicRoots.privateDataTreeRoot);
  }
}
