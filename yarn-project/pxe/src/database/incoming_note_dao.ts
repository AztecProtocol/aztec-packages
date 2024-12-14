import { Note, TxHash, randomTxHash } from '@aztec/circuit-types';
import { AztecAddress, Fr, Point, type PublicKey } from '@aztec/circuits.js';
import { NoteSelector } from '@aztec/foundation/abi';
import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { type NoteData } from '@aztec/simulator/acvm';

/**
 * A note with contextual data which was decrypted as incoming.
 */
export class IncomingNoteDao implements NoteData {
  constructor(
    /** The note as emitted from the Noir contract. */
    public note: Note,
    /** The contract address this note is created in. */
    public contractAddress: AztecAddress,
    /** The specific storage location of the note on the contract. */
    public storageSlot: Fr,
    /** The note type identifier for the contract. */
    public noteTypeId: NoteSelector,
    /** The hash of the tx the note was created in. */
    public txHash: TxHash,
    /** The L2 block number in which the tx with this note was included. */
    public l2BlockNumber: number,
    /** The L2 block hash in which the tx with this note was included. */
    public l2BlockHash: string,
    /** The nonce of the note. */
    public nonce: Fr,
    /**
     * A hash of the note. This is customizable by the app circuit.
     * We can use this value to compute siloedNoteHash and uniqueSiloedNoteHash.
     */
    public noteHash: Fr,
    /**
     * The nullifier of the note (siloed by contract address).
     * Note: Might be set as 0 if the note was added to PXE as nullified.
     */
    public siloedNullifier: Fr,
    /** The location of the relevant note in the note hash tree. */
    public index: bigint,
    /** The public key with which the note was encrypted. */
    public addressPoint: PublicKey,
  ) {}

  toBuffer(): Buffer {
    return serializeToBuffer([
      this.note,
      this.contractAddress,
      this.storageSlot,
      this.noteTypeId,
      this.txHash.buffer,
      this.l2BlockNumber,
      Fr.fromString(this.l2BlockHash),
      this.nonce,
      this.noteHash,
      this.siloedNullifier,
      this.index,
      this.addressPoint,
    ]);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);

    const note = Note.fromBuffer(reader);
    const contractAddress = AztecAddress.fromBuffer(reader);
    const storageSlot = Fr.fromBuffer(reader);
    const noteTypeId = reader.readObject(NoteSelector);
    const txHash = reader.readObject(TxHash);
    const l2BlockNumber = reader.readNumber();
    const l2BlockHash = Fr.fromBuffer(reader).toString();
    const nonce = Fr.fromBuffer(reader);
    const noteHash = Fr.fromBuffer(reader);
    const siloedNullifier = Fr.fromBuffer(reader);
    const index = toBigIntBE(reader.readBytes(32));
    const publicKey = Point.fromBuffer(reader);

    return new IncomingNoteDao(
      note,
      contractAddress,
      storageSlot,
      noteTypeId,
      txHash,
      l2BlockNumber,
      l2BlockHash,
      nonce,
      noteHash,
      siloedNullifier,
      index,
      publicKey,
    );
  }

  toString() {
    return '0x' + this.toBuffer().toString('hex');
  }

  static fromString(str: string) {
    const hex = str.replace(/^0x/, '');
    return IncomingNoteDao.fromBuffer(Buffer.from(hex, 'hex'));
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
    txHash = randomTxHash(),
    storageSlot = Fr.random(),
    noteTypeId = NoteSelector.random(),
    nonce = Fr.random(),
    l2BlockNumber = Math.floor(Math.random() * 1000),
    l2BlockHash = Fr.random().toString(),
    noteHash = Fr.random(),
    siloedNullifier = Fr.random(),
    index = Fr.random().toBigInt(),
    addressPoint = Point.random(),
  }: Partial<IncomingNoteDao> = {}) {
    return new IncomingNoteDao(
      note,
      contractAddress,
      storageSlot,
      noteTypeId,
      txHash,
      l2BlockNumber,
      l2BlockHash,
      nonce,
      noteHash,
      siloedNullifier,
      index,
      addressPoint,
    );
  }
}
