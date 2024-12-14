import { type L1NotePayload, Note, TxHash, randomTxHash } from '@aztec/circuit-types';
import { AztecAddress, Fr, Point, type PublicKey } from '@aztec/circuits.js';
import { NoteSelector } from '@aztec/foundation/abi';
import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { type NoteData } from '@aztec/simulator/acvm';

import { type NoteInfo } from '../note_decryption_utils/index.js';

/**
 * A Note Data Access Object, representing a note that was comitted to the note hash tree, holding all of the
 * information required to use it during execution and manage its state.
 */
export class NoteDao implements NoteData {
  constructor(
    // Note information

    /** The serialized content of the note, as will be returned in the getNotes oracle. */
    public note: Note,
    /** The address of the contract that created the note (i.e. the address used by the kernel during siloing). */
    public contractAddress: AztecAddress,
    /**
     * The storage location of the note. This value is not used for anything in PXE, but we do index by storage slot
     * since contracts typically make queries based on it.
     * */
    public storageSlot: Fr,
    /** The kernel-provided nonce of the note, required to compute the uniqueNoteHash. */
    public nonce: Fr,

    // Computed values
    /**
     * The inner hash (non-unique, non-siloed) of the note. Each contract determines how the note content is hashed. Can
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
    /** The public key with which the note content was encrypted during delivery. */
    public addressPoint: PublicKey,

    /** The note type identifier for the contract.
     * TODO: remove
    */
    public noteTypeId: NoteSelector,
  ) {}

  static fromPayloadAndNoteInfo(
    note: Note,
    payload: L1NotePayload,
    noteInfo: NoteInfo,
    l2BlockNumber: number,
    l2BlockHash: string,
    dataStartIndexForTx: number,
    addressPoint: PublicKey,
  ) {
    const noteHashIndexInTheWholeTree = BigInt(dataStartIndexForTx + noteInfo.noteHashIndex);
    return new NoteDao(
      note,
      payload.contractAddress,
      payload.storageSlot,
      noteInfo.nonce,
      noteInfo.noteHash,
      noteInfo.siloedNullifier,
      noteInfo.txHash,
      l2BlockNumber,
      l2BlockHash,
      noteHashIndexInTheWholeTree,
      addressPoint,
      payload.noteTypeId,
    );
  }

  toBuffer(): Buffer {
    return serializeToBuffer([
      this.note,
      this.contractAddress,
      this.storageSlot,
      this.nonce,
      this.noteHash,
      this.siloedNullifier,
      this.txHash.buffer,
      this.l2BlockNumber,
      Fr.fromHexString(this.l2BlockHash),
      this.index,
      this.addressPoint,
      this.noteTypeId,
    ]);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);

    const note = Note.fromBuffer(reader);
    const contractAddress = AztecAddress.fromBuffer(reader);
    const storageSlot = Fr.fromBuffer(reader);
    const nonce = Fr.fromBuffer(reader);
    const noteHash = Fr.fromBuffer(reader);
    const siloedNullifier = Fr.fromBuffer(reader);
    const txHash = reader.readObject(TxHash);
    const l2BlockNumber = reader.readNumber();
    const l2BlockHash = Fr.fromBuffer(reader).toString();
    const index = toBigIntBE(reader.readBytes(32));
    const publicKey = Point.fromBuffer(reader);
    const noteTypeId = reader.readObject(NoteSelector);

    return new NoteDao(
      note,
      contractAddress,
      storageSlot,
      nonce,
      noteHash,
      siloedNullifier,
      txHash,
      l2BlockNumber,
      l2BlockHash,
      index,
      publicKey,
      noteTypeId,
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

  static random({
    note = Note.random(),
    contractAddress = AztecAddress.random(),
    storageSlot = Fr.random(),
    nonce = Fr.random(),
    noteHash = Fr.random(),
    siloedNullifier = Fr.random(),
    txHash = randomTxHash(),
    l2BlockNumber = Math.floor(Math.random() * 1000),
    l2BlockHash = Fr.random().toString(),
    index = Fr.random().toBigInt(),
    addressPoint = Point.random(),
    noteTypeId = NoteSelector.random(),
  }: Partial<NoteDao> = {}) {
    return new NoteDao(
      note,
      contractAddress,
      storageSlot,
      nonce,
      noteHash,
      siloedNullifier,
      txHash,
      l2BlockNumber,
      l2BlockHash,
      index,
      addressPoint,
      noteTypeId,
    );
  }
}
