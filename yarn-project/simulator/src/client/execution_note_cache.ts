import { computeNoteHashNonce, computeUniqueNoteHash, siloNoteHash, siloNullifier } from '@aztec/circuits.js/hash';
import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';

import { type NoteData } from '../acvm/index.js';

interface PendingNote {
  note: NoteData;
  counter: number;
  noteHashForConsumption: Fr;
}

/**
 * Data that's accessible by all the function calls in an execution.
 */
export class ExecutionNoteCache {
  /**
   * New notes created in this transaction.
   * They are pushed to this array in the same order as they are emitted.
   */
  private notes: PendingNote[] = [];
  /**
   * This mapping maps from a contract address to the notes in the contract.
   */
  private noteMap: Map<bigint, PendingNote[]> = new Map();

  /**
   * This maps from a contract address to the nullifiers emitted from the contract.
   * The note which is nullified might be new or not (i.e., was generated in a previous transaction).
   * Note that their value (bigint representation) is used because Frs cannot be looked up in Sets.
   */
  private nullifierMap: Map<bigint, Set<bigint>> = new Map();

  /**
   * All nullifiers emitted in this transaction.
   */
  private allNullifiers: Set<bigint> = new Set();

  private minRevertibleSideEffectCounter = 0;

  private inRevertiblePhase = false;

  /**
   * We don't need to use the tx request hash for nonces if another non revertible nullifier is emitted.
   * In that case we disable injecting the tx request hash as a nullifier.
   */
  private usedTxRequestHashForNonces = true;

  constructor(private readonly txRequestHash: Fr) {}

  /**
   * Enters the revertible phase of the transaction.
   * @param minRevertibleSideEffectCounter - The counter at which the transaction enters the revertible phase.
   */
  public setMinRevertibleSideEffectCounter(minRevertibleSideEffectCounter: number) {
    if (this.inRevertiblePhase) {
      throw new Error(
        `Cannot enter the revertible phase twice. Current counter: ${minRevertibleSideEffectCounter}. Previous enter counter: ${this.minRevertibleSideEffectCounter}`,
      );
    }
    this.inRevertiblePhase = true;
    this.minRevertibleSideEffectCounter = minRevertibleSideEffectCounter;

    let nonceGenerator = this.txRequestHash;
    const nullifiers = this.getAllNullifiers();
    if (nullifiers.length > 0) {
      nonceGenerator = new Fr(nullifiers[0]);
      this.usedTxRequestHashForNonces = false;
    }

    // The existing pending notes are all non-revertible.
    // They cannot be squashed by nullifiers emitted after minRevertibleSideEffectCounter is set.
    // Their indexes in the tx are known at this point and won't change. So we can assign a nonce to each one of them.
    // The nonces will be used to create the "complete" nullifier.
    const updatedNotes = this.notes.map(({ note, counter }, i) => {
      const nonce = computeNoteHashNonce(nonceGenerator, i);
      const uniqueNoteHash = computeUniqueNoteHash(nonce, siloNoteHash(note.contractAddress, note.noteHash));
      return {
        counter,
        note: { ...note, nonce },
        noteHashForConsumption: uniqueNoteHash,
      };
    });
    // Rebuild the data.
    this.notes = [];
    this.noteMap = new Map();
    updatedNotes.forEach(n => this.#addNote(n));
  }

  public finish() {
    // If we never entered the revertible phase, we need to use the tx request hash as a nonce for the notes if no nullifiers have been emitted.
    if (!this.inRevertiblePhase) {
      this.usedTxRequestHashForNonces = this.getAllNullifiers().length === 0;
    }
    // If we entered the revertible phase, the nonce generator was decided based on wether or not a nullifier was emitted before entering.
    return {
      usedTxRequestHashForNonces: this.usedTxRequestHashForNonces,
    };
  }

  /**
   * Add a new note to cache.
   * @param note - New note created during execution.
   */
  public addNewNote(note: NoteData, counter: number) {
    const previousNote = this.notes[this.notes.length - 1];
    if (previousNote && previousNote.counter >= counter) {
      throw new Error(
        `Note hash counters must be strictly increasing. Current counter: ${counter}. Previous counter: ${previousNote.counter}.`,
      );
    }

    this.#addNote({ note, counter, noteHashForConsumption: note.noteHash });
  }

  /**
   * Add a nullifier to cache. It could be for a db note or a new note created during execution.
   * @param contractAddress - Contract address of the note.
   * @param innerNullifier - Inner nullifier of the note.
   * @param noteHash - A hash of the note. If this value equals 0, it means the note being nullified is from a previous
   * transaction (and thus not a new note).
   */
  public nullifyNote(contractAddress: AztecAddress, innerNullifier: Fr, noteHash: Fr) {
    const siloedNullifier = siloNullifier(contractAddress, innerNullifier);
    let nullifiedNoteHashCounter: number | undefined = undefined;
    // Find and remove the matching new note and log(s) if the emitted noteHash is not empty.
    if (!noteHash.isEmpty()) {
      const notesInContract = this.noteMap.get(contractAddress.toBigInt()) ?? [];
      const noteIndexToRemove = notesInContract.findIndex(n => n.noteHashForConsumption.equals(noteHash));
      if (noteIndexToRemove === -1) {
        throw new Error('Attempt to remove a pending note that does not exist.');
      }

      const note = notesInContract.splice(noteIndexToRemove, 1)[0];
      nullifiedNoteHashCounter = note.counter;
      this.noteMap.set(contractAddress.toBigInt(), notesInContract);
      this.notes = this.notes.filter(n => n.counter !== note.counter);

      // If the note is non revertible and the nullifier was emitted in the revertible phase, both the note hash and the nullifier will be emitted
      if (this.inRevertiblePhase && note.counter < this.minRevertibleSideEffectCounter) {
        this.recordNullifier(contractAddress, siloedNullifier);
      }
    } else {
      // If the note being nullified comes from a previous tx the nullifier will be emitted.
      this.recordNullifier(contractAddress, siloedNullifier);
    }
    return nullifiedNoteHashCounter;
  }

  /**
   * Adds a nullifier to the cache. Note cache needs to track all nullifiers to decide which nullifier to use for note siloing.
   * @param contractAddress - Contract address that emitted the nullifier.
   * @param innerNullifier
   */
  public nullifierCreated(contractAddress: AztecAddress, innerNullifier: Fr) {
    const siloedNullifier = siloNullifier(contractAddress, innerNullifier);
    this.recordNullifier(contractAddress, siloedNullifier);
  }

  /**
   * Return notes created up to current point in execution.
   * If a nullifier for a note in this list is emitted, the note will be deleted.
   * @param contractAddress - Contract address of the notes.
   * @param storageSlot - Storage slot of the notes.
   **/
  public getNotes(contractAddress: AztecAddress, storageSlot: Fr) {
    const notes = this.noteMap.get(contractAddress.toBigInt()) ?? [];
    return notes.filter(n => n.note.storageSlot.equals(storageSlot)).map(n => n.note);
  }

  /**
   * Check if a note exists in the newNotes array.
   * @param contractAddress - Contract address of the note.
   * @param storageSlot - Storage slot of the note.
   * @param noteHash - A hash of the note.
   **/
  public checkNoteExists(contractAddress: AztecAddress, noteHash: Fr) {
    const notes = this.noteMap.get(contractAddress.toBigInt()) ?? [];
    return notes.some(n => n.note.noteHash.equals(noteHash));
  }

  /**
   * Return all nullifiers emitted from a contract.
   * @param contractAddress - Address of the contract.
   */
  public getNullifiers(contractAddress: AztecAddress): Set<bigint> {
    return this.nullifierMap.get(contractAddress.toBigInt()) ?? new Set();
  }

  #addNote(note: PendingNote) {
    this.notes.push(note);

    const notes = this.noteMap.get(note.note.contractAddress.toBigInt()) ?? [];
    notes.push(note);
    this.noteMap.set(note.note.contractAddress.toBigInt(), notes);
  }

  getAllNotes(): PendingNote[] {
    return this.notes;
  }

  getAllNullifiers(): Fr[] {
    return [...this.allNullifiers].map(n => new Fr(n));
  }

  recordNullifier(contractAddress: AztecAddress, siloedNullifier: Fr) {
    const nullifiers = this.getNullifiers(contractAddress);
    nullifiers.add(siloedNullifier.toBigInt());
    this.nullifierMap.set(contractAddress.toBigInt(), nullifiers);
    this.allNullifiers.add(siloedNullifier.toBigInt());
  }
}
