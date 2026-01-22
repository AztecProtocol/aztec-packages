import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Note } from '@aztec/stdlib/note';
import { TxHash } from '@aztec/stdlib/tx';

/**
 * A Note Data Access Object, representing a note that was committed to the note hash tree, holding all of the
 * information required to use it during execution and manage its state.
 */
export class NoteDao {
  constructor(
    // Note information

    /** The packed content of the note, as will be returned in the getNotes oracle. */
    public note: Note,
    /** The address of the contract that created the note (i.e. the address used by the kernel during siloing). */
    public contractAddress: AztecAddress,
    /** The owner of the note - generally the account that can spend the note. */
    public owner: AztecAddress,
    /**
     * The storage location of the note. This value is not used for anything in PXE, but we do index by storage slot
     * since contracts typically make queries based on it.
     */
    public storageSlot: Fr,
    /**
     * The randomness injected to the note hash preimage.
     */
    public randomness: Fr,
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
    public l2BlockNumber: BlockNumber,
    /** The L2 block hash in which the tx with this note was included. Used for note management while processing
     * reorgs.*/
    public l2BlockHash: string,
    /** The index of the tx within the block, used for ordering notes. */
    public txIndexInBlock: number,
    /** The index of the note within the tx (based on note hash position), used for ordering notes. */
    public noteIndexInTx: number,
  ) {}

  toBuffer(): Buffer {
    return serializeToBuffer([
      this.note,
      this.contractAddress,
      this.owner,
      this.storageSlot,
      this.randomness,
      this.noteNonce,
      this.noteHash,
      this.siloedNullifier,
      this.txHash,
      this.l2BlockNumber,
      Fr.fromHexString(this.l2BlockHash),
      this.txIndexInBlock,
      this.noteIndexInTx,
    ]);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);

    const note = Note.fromBuffer(reader);
    const contractAddress = AztecAddress.fromBuffer(reader);
    const owner = AztecAddress.fromBuffer(reader);
    const storageSlot = Fr.fromBuffer(reader);
    const randomness = Fr.fromBuffer(reader);
    const noteNonce = Fr.fromBuffer(reader);
    const noteHash = Fr.fromBuffer(reader);
    const siloedNullifier = Fr.fromBuffer(reader);
    const txHash = reader.readObject(TxHash);
    const l2BlockNumber = BlockNumber(reader.readNumber());
    const l2BlockHash = Fr.fromBuffer(reader).toString();
    const txIndexInBlock = reader.readNumber();
    const noteIndexInTx = reader.readNumber();

    return new NoteDao(
      note,
      contractAddress,
      owner,
      storageSlot,
      randomness,
      noteNonce,
      noteHash,
      siloedNullifier,
      txHash,
      l2BlockNumber,
      l2BlockHash,
      txIndexInBlock,
      noteIndexInTx,
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
   * Returns true if this note is equal to the `other` one.
   */
  equals(other: NoteDao): boolean {
    return (
      this.note.equals(other.note) &&
      this.contractAddress.equals(other.contractAddress) &&
      this.owner.equals(other.owner) &&
      this.storageSlot.equals(other.storageSlot) &&
      this.randomness.equals(other.randomness) &&
      this.noteNonce.equals(other.noteNonce) &&
      this.noteHash.equals(other.noteHash) &&
      this.siloedNullifier.equals(other.siloedNullifier) &&
      this.txHash.equals(other.txHash) &&
      this.l2BlockNumber === other.l2BlockNumber &&
      this.l2BlockHash === other.l2BlockHash &&
      this.txIndexInBlock === other.txIndexInBlock &&
      this.noteIndexInTx === other.noteIndexInTx
    );
  }

  /**
   * Returns the size in bytes of the Note Dao.
   * @returns - Its size in bytes.
   */
  public getSize() {
    const noteSize = 4 + this.note.items.length * Fr.SIZE_IN_BYTES;
    // 2 numbers for txIndexInBlock and noteIndexInTx (4 bytes each)
    return noteSize + AztecAddress.SIZE_IN_BYTES * 2 + Fr.SIZE_IN_BYTES * 4 + TxHash.SIZE + Point.SIZE_IN_BYTES + 8;
  }

  static async random({
    note = Note.random(),
    contractAddress = undefined,
    owner = undefined,
    storageSlot = Fr.random(),
    randomness = Fr.random(),
    noteNonce = Fr.random(),
    noteHash = Fr.random(),
    siloedNullifier = Fr.random(),
    txHash = TxHash.random(),
    l2BlockNumber = BlockNumber(Math.floor(Math.random() * 1000)),
    l2BlockHash = Fr.random().toString(),
    txIndexInBlock = Math.floor(Math.random() * 100),
    noteIndexInTx = Math.floor(Math.random() * 100),
  }: Partial<NoteDao> = {}) {
    return new NoteDao(
      note,
      contractAddress ?? (await AztecAddress.random()),
      owner ?? (await AztecAddress.random()),
      storageSlot,
      randomness,
      noteNonce,
      noteHash,
      siloedNullifier,
      txHash,
      l2BlockNumber,
      l2BlockHash,
      txIndexInBlock,
      noteIndexInTx,
    );
  }
}
