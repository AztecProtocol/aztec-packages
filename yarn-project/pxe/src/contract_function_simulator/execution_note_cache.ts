import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computeNoteHashNonce, computeUniqueNoteHash, siloNoteHash, siloNullifier } from '@aztec/stdlib/hash';

import type { NoteData } from './oracle/interfaces.js';

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
   * Nullifiers emitted by private calls in this transaction.
   */
  private emittedNullifiers: Set<bigint> = new Set();

  /**
   * The counter that separates non-revertible side effects (which persist even if the tx reverts) from revertible ones.
   */
  private minRevertibleSideEffectCounter = 0;

  private inRevertiblePhase = false;

  /**
   * Whether the protocol nullifier was used for nonce generation.
   * We don't need to use the protocol nullifier if a non-revertible nullifier is emitted.
   */
  private usedProtocolNullifierForNonces: boolean | undefined;

  constructor(private readonly protocolNullifier: Fr) {}

  /**
   * Enters the revertible phase of the transaction.
   * @param minRevertibleSideEffectCounter - The counter at which the transaction enters the revertible phase.
   */
  public async setMinRevertibleSideEffectCounter(minRevertibleSideEffectCounter: number) {
    if (this.inRevertiblePhase) {
      throw new Error(
        `Cannot enter the revertible phase twice. Current counter: ${minRevertibleSideEffectCounter}. Previous enter counter: ${this.minRevertibleSideEffectCounter}`,
      );
    }
    this.inRevertiblePhase = true;
    this.minRevertibleSideEffectCounter = minRevertibleSideEffectCounter;

    const nullifiers = this.getEmittedNullifiers();
    // If there are no nullifiers emitted by private calls so far, we use the protocol nullifier as the nonce generator.
    // Note: There could still be nullifiers emitted after the counter is set, but those nullifiers are revertible, so
    // we don't want to use them as the nonce generator.
    this.usedProtocolNullifierForNonces = nullifiers.length === 0;
    const nonceGenerator = this.usedProtocolNullifierForNonces ? this.protocolNullifier : new Fr(nullifiers[0]);

    // The existing pending notes are all non-revertible.
    // They cannot be squashed by nullifiers emitted after minRevertibleSideEffectCounter is set.
    // Their indexes in the tx are known at this point and won't change. So we can assign a nonce to each one of them.
    // The nonces will be used to create the "unique" note hashes.
    const updatedNotes = await Promise.all(
      this.notes.map(async ({ note, counter }, i) => {
        const noteNonce = await computeNoteHashNonce(nonceGenerator, i);
        const uniqueNoteHash = await computeUniqueNoteHash(
          noteNonce,
          await siloNoteHash(note.contractAddress, note.noteHash),
        );
        return {
          counter,
          note: { ...note, noteNonce },
          noteHashForConsumption: uniqueNoteHash,
        };
      }),
    );
    // Rebuild the data.
    this.notes = [];
    this.noteMap = new Map();
    updatedNotes.forEach(n => this.#addNote(n));
  }

  public isSideEffectCounterRevertible(sideEffectCounter: number): boolean {
    if (!this.inRevertiblePhase) {
      return false;
    }
    return sideEffectCounter >= this.minRevertibleSideEffectCounter;
  }

  public finish() {
    // If we never entered the revertible phase, and there are no nullifiers emitted, we need to use the protocol
    // nullifier as the nonce generator.
    if (!this.inRevertiblePhase) {
      this.usedProtocolNullifierForNonces = this.getEmittedNullifiers().length === 0;
    }
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
  public async nullifyNote(contractAddress: AztecAddress, innerNullifier: Fr, noteHash: Fr) {
    const siloedNullifier = (await siloNullifier(contractAddress, innerNullifier)).toBigInt();
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
        this.#recordNullifier(contractAddress, siloedNullifier);
      }
    } else {
      // If the note being nullified comes from a previous tx the nullifier will be emitted.
      this.#recordNullifier(contractAddress, siloedNullifier);
    }
    return nullifiedNoteHashCounter;
  }

  /**
   * Adds a nullifier to the cache. Note cache needs to track all nullifiers to decide which nullifier to use for note siloing.
   * @param contractAddress - Contract address that emitted the nullifier.
   * @param innerNullifier
   */
  public async nullifierCreated(contractAddress: AztecAddress, innerNullifier: Fr) {
    const siloedNullifier = (await siloNullifier(contractAddress, innerNullifier)).toBigInt();
    this.#recordNullifier(contractAddress, siloedNullifier);
  }

  /**
   * Return notes created up to current point in execution.
   * If a nullifier for a note in this list is emitted, the note will be deleted.
   * @param contractAddress - Contract address of the notes.
   * @param owner - Owner of the notes. If undefined, returns all notes regardless of owner.
   * @param storageSlot - Storage slot of the notes.
   **/
  public getNotes(contractAddress: AztecAddress, owner: AztecAddress | undefined, storageSlot: Fr) {
    const notes = this.noteMap.get(contractAddress.toBigInt()) ?? [];
    return notes
      .filter(n => owner === undefined || n.note.owner.equals(owner))
      .filter(n => n.note.storageSlot.equals(storageSlot))
      .map(n => n.note);
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

  /**
   * @returns All nullifiers emitted by private calls in this transaction.
   */
  getEmittedNullifiers(): Fr[] {
    return [...this.emittedNullifiers].map(n => new Fr(n));
  }

  /**
   * @returns All nullifiers emitted by private calls in this transaction. If the protocol nullifier was used as the
   * nonce generator, it is injected as the first nullifier.
   */
  getAllNullifiers(): Fr[] {
    if (this.usedProtocolNullifierForNonces === undefined) {
      throw new Error('usedProtocolNullifierForNonces is not set yet. Call finish() to complete the transaction.');
    }
    const allNullifiers = this.getEmittedNullifiers();
    return [...(this.usedProtocolNullifierForNonces ? [this.protocolNullifier] : []), ...allNullifiers];
  }

  getNonceGenerator(): Fr {
    return this.getAllNullifiers()[0];
  }

  #recordNullifier(contractAddress: AztecAddress, siloedNullifier: bigint) {
    const nullifiers = this.getNullifiers(contractAddress);

    if (nullifiers.has(siloedNullifier)) {
      throw new Error(`Duplicate siloed nullifier ${siloedNullifier} emitted by contract ${contractAddress}`);
    }

    nullifiers.add(siloedNullifier);
    this.nullifierMap.set(contractAddress.toBigInt(), nullifiers);
    this.emittedNullifiers.add(siloedNullifier);
  }
}
