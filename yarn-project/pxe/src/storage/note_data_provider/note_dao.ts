import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { Fr, Point } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Note } from '@aztec/stdlib/note';
import { TxHash } from '@aztec/stdlib/tx';

import type { NoteData } from '../../contract_function_simulator/oracle/typed_oracle.js';

/**
 * A Note Data Access Object, representing a note that was committed to the note hash tree, holding all of the
 * information required to use it during execution and manage its state.
 */
export class NoteDao implements NoteData {
  constructor(
    // Note information

    /** The packed content of the note, as will be returned in the getNotes oracle. */
    public note: Note,
    /** The address of the contract that created the note (i.e. the address used by the kernel during siloing). */
    public contractAddress: AztecAddress,
    /**
     * The storage location of the note. This value is not used for anything in PXE, but we do index by storage slot
     * since contracts typically make queries based on it.
     */
    public storageSlot: Fr,
    /** The nonce that was injected into the note hash preimage in order to guarantee uniqueness. */
    public noteNonce: Fr,

    // Computed values
    /**
     * The inner hash (non-unique, non-siloed) of the note. Each contract determines how the note is hashed. Can
     * be used alongside contractAddress and nonce to compute the uniqueNoteHash and the siloedNoteHash.
     */
    public noteHash: Fr,
    /**
     * The nullifier of the note, siloed by contract address.
     * Note: Might be set as 0 if the note was added to PXE as nullified.
     */
    public siloedNullifier: Fr,

    // Metadata
    /** The hash of the tx in which this note was created. Knowing the tx hash allows for efficient node queries e.g.
     *  when searching for txEffects.
     */
    public txHash: TxHash,
    /** The L2 block number in which the tx with this note was included. Used for note management while processing
     * reorgs.*/
    public l2BlockNumber: number,
    /** The L2 block hash in which the tx with this note was included. Used for note management while processing
     * reorgs.*/
    public l2BlockHash: string,
    /** The index of the leaf in the global note hash tree the note is stored at */
    public index: bigint,
    /**
     * The address whose public key was used to encrypt the note log during delivery.
     * (This is the x-coordinate of the public key.)
     */
    public recipient: AztecAddress,
  ) {}

  toBuffer(): Buffer {
    return serializeToBuffer([
      this.note,
      this.contractAddress,
      this.storageSlot,
      this.noteNonce,
      this.noteHash,
      this.siloedNullifier,
      this.txHash,
      this.l2BlockNumber,
      Fr.fromHexString(this.l2BlockHash),
      this.index,
      this.recipient,
    ]);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);

    const note = Note.fromBuffer(reader);
    const contractAddress = AztecAddress.fromBuffer(reader);
    const storageSlot = Fr.fromBuffer(reader);
    const noteNonce = Fr.fromBuffer(reader);
    const noteHash = Fr.fromBuffer(reader);
    const siloedNullifier = Fr.fromBuffer(reader);
    const txHash = reader.readObject(TxHash);
    const l2BlockNumber = reader.readNumber();
    const l2BlockHash = Fr.fromBuffer(reader).toString();
    const index = toBigIntBE(reader.readBytes(32));
    const recipient = AztecAddress.fromBuffer(reader);

    return new NoteDao(
      note,
      contractAddress,
      storageSlot,
      noteNonce,
      noteHash,
      siloedNullifier,
      txHash,
      l2BlockNumber,
      l2BlockHash,
      index,
      recipient,
    );
  }

  toString() {
    return '0x' + this.toBuffer().toString('hex');
  }

  static fromString(str: string) {
    const hex = str.replace(/^0x/, '');
    return NoteDao.fromBuffer(Buffer.from(hex, 'hex'));
  }

  /**
   * Returns the size in bytes of the Note Dao.
   * @returns - Its size in bytes.
   */
  public getSize() {
    const indexSize = Math.ceil(Math.log2(Number(this.index)));
    const noteSize = 4 + this.note.items.length * Fr.SIZE_IN_BYTES;
    return noteSize + AztecAddress.SIZE_IN_BYTES + Fr.SIZE_IN_BYTES * 4 + TxHash.SIZE + Point.SIZE_IN_BYTES + indexSize;
  }

  static async random({
    note = Note.random(),
    contractAddress = undefined,
    storageSlot = Fr.random(),
    noteNonce = Fr.random(),
    noteHash = Fr.random(),
    siloedNullifier = Fr.random(),
    txHash = TxHash.random(),
    l2BlockNumber = Math.floor(Math.random() * 1000),
    l2BlockHash = Fr.random().toString(),
    index = Fr.random().toBigInt(),
    recipient = undefined,
  }: Partial<NoteDao> = {}) {
    return new NoteDao(
      note,
      contractAddress ?? (await AztecAddress.random()),
      storageSlot,
      noteNonce,
      noteHash,
      siloedNullifier,
      txHash,
      l2BlockNumber,
      l2BlockHash,
      index,
      recipient ?? (await AztecAddress.random()),
    );
  }
}
