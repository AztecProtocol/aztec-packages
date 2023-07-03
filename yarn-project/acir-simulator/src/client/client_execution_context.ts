import { PrivateHistoricTreeRoots, TxContext } from '@aztec/circuits.js';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { createDebugLogger } from '@aztec/foundation/log';
import { Fr } from '@aztec/foundation/fields';
import {
  ACVMField,
  createDummyNote,
  fromACVMField,
  toACVMField,
  toAcvmCommitmentLoadOracleInputs,
  toAcvmL1ToL2MessageLoadOracleInputs,
} from '../acvm/index.js';
import { NoteLoadOracleInputs, DBOracle } from './db_oracle.js';

/**
 * Information about a note created during execution.
 */
export type PendingNoteData = {
  /** The preimage of the created note */
  preimage: ACVMField[];
  /** The contract address of the commitment. */
  contractAddress: AztecAddress;
  /** The storage slot of the commitment. */
  storageSlot: ACVMField;
};

/**
 * A type that wraps data with it's read request index
 */
type ACVMWithReadRequestIndex = {
  /** The index of the data in the tree. */
  index: bigint;
  /** The formatted data. */
  acvmData: ACVMField[];
};

/**
 * The execution context for a client tx simulation.
 */
export class ClientTxExecutionContext {
  constructor(
    /**  The database oracle. */
    public db: DBOracle,
    /** The tx context. */
    public txContext: TxContext,
    /** The old roots. */
    public historicRoots: PrivateHistoricTreeRoots,
    /** Pending commitments created (and not nullified) up to current point in execution **/
    public pendingNotes: PendingNoteData[] = [],

    private log = createDebugLogger('aztec:simulator:client_execution_context'),
  ) {}

  /**
   * Gets the notes for a contract address and storage slot.
   * Returns note preimages and their leaf indices in the private data tree.
   *
   * Details:
   * Check for pending notes with matching address/slot.
   * If limit isn't reached after pending notes are all checked,
   * fetchNotes from DB with modified limit.
   * Real notes coming from DB will have a leafIndex which
   * represents their index in the private data tree.
   * Real pending notes will have a leafIndex set to -1
   * since they don't exist (yet) in the private data tree.
   *
   * leaf indices are not passed to app circuit. They are forwarded to
   * the kernel prover which uses them to compute witnesses to pass
   * to the private kernel.
   *
   * @param contractAddress - The contract address.
   * @param storageSlot - The storage slot.
   * @param limit - The amount of notes to get.
   * @returns An array of ACVM fields for the note count and the requested note preimages
   * (padded to reach limit), and another array of indices corresponding to each _real_ note's
   * position in the private data tree.
   */
  public async getNotes(contractAddress: AztecAddress, storageSlot: ACVMField, limit: number) {
    const pendingPreimages: ACVMField[][] = [];
    for (const note of this.pendingNotes) {
      if (pendingPreimages.length == limit) {
        break;
      }
      if (note.contractAddress.equals(contractAddress) && note.storageSlot == storageSlot) {
        // TODO(dbanks12): flag as pending and separately provide "hint" of
        // which "new_commitment" in which kernel this read maps to
        pendingPreimages.push(note.preimage);
      }
    }
    const numPendingNotes = pendingPreimages.length;
    const pendingLeafIndexPlaceholders: bigint[] = Array(numPendingNotes).fill(BigInt(-1));

    // may still need to get some notes from db
    const remainingLimit = limit - numPendingNotes;
    const { realCount: numDbRealNotes, notes: dbNotes } = await this.fetchNotes(
      contractAddress,
      storageSlot,
      remainingLimit,
    );
    // only need leaf indices for "real" notes (those found in db)
    const dbRealLeafIndices = dbNotes.slice(0, numDbRealNotes).map(note => note.index);
    // need preimages for all notes (real and dummy) for consumption by Noir circuit
    const dbAllPreimages = dbNotes.map(note => note.preimage.map(f => toACVMField(f)));

    // all pending notes and notes found in db
    const numRealNotes = numPendingNotes + numDbRealNotes;
    // all preimages (including pending, dummy, and real)
    const allPreimages = [...pendingPreimages, ...dbAllPreimages];
    // leaf indices for all "real" notes
    // this includes placeholder indices (-1) for real pending notes
    const realLeafIndices = [...pendingLeafIndexPlaceholders, ...dbRealLeafIndices];

    this.log(`NRN: ${toACVMField(numRealNotes)}`);
    this.log(`allPreimages: ${allPreimages.length}`);
    this.log(`allPreimages.flat(): ${allPreimages.flat().length}`);
    const preimagesACVM = [
      toACVMField(numRealNotes), // number of real notes
      ...allPreimages.flat(), // all note preimages
    ];

    return { preimagesACVM, realLeafIndices };
  }

  /**
   * Views the notes for a contract address and storage slot.
   * Doesn't include the leaf indices.
   * @param contractAddress - The contract address.
   * @param storageSlot - The storage slot.
   * @param limit - The amount of notes to get.
   * @param offset - The offset to start from (for pagination).
   * @returns The ACVM fields for the count and the requested notes.
   */
  public async viewNotes(contractAddress: AztecAddress, storageSlot: ACVMField, limit: number, offset = 0) {
    const { realCount, notes } = await this.fetchNotes(contractAddress, storageSlot, limit, offset);

    return [toACVMField(realCount), ...notes.flatMap(noteGetData => noteGetData.preimage.map(f => toACVMField(f)))];
  }

  /**
   * Fetches the notes for a contract address and storage slot from the db.
   * @param contractAddress - The contract address.
   * @param storageSlot - The storage slot.
   * @param limit - The amount of notes to get.
   * @param offset - The offset to start from (for pagination).
   * @returns The count and the requested notes, padded with dummy notes.
   */
  private async fetchNotes(contractAddress: AztecAddress, storageSlot: ACVMField, limit: number, offset = 0) {
    const { count: realCount, notes } = await this.db.getNotes(
      contractAddress,
      fromACVMField(storageSlot),
      limit,
      offset,
    );

    const dummyNotes = Array.from(
      { length: Math.max(0, limit - notes.length) },
      (): NoteLoadOracleInputs => ({
        preimage: createDummyNote(),
        index: BigInt(-2), // some invalid index - shouldn't ever be used
      }),
    );

    return {
      realCount,
      notes: notes.concat(dummyNotes),
    };
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
  public async getCommitment(contractAddress: AztecAddress, commitment: Fr): Promise<ACVMWithReadRequestIndex> {
    const commitmentInputs = await this.db.getCommitmentOracle(contractAddress, commitment);
    return {
      acvmData: toAcvmCommitmentLoadOracleInputs(commitmentInputs, this.historicRoots.privateDataTreeRoot),
      index: commitmentInputs.index,
    };
  }
}
