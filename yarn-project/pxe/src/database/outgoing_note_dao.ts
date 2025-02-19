import { Note, TxHash } from '@aztec/circuit-types';
import { AztecAddress, Fr, Point, type PublicKey } from '@aztec/circuits.js';
import { NoteSelector } from '@aztec/circuits.js/abi';
import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

/**
 * A note with contextual data which was decrypted as outgoing.
 */
export class OutgoingNoteDao {
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
     * We can use this value to compute unique note hash and then siloed note hash.
     */
    public noteHash: Fr,
    /** The location of the relevant note in the note hash tree. */
    public index: bigint,
    /** The public key with which the note was encrypted. */
    public ovpkM: PublicKey,
  ) {}

  toBuffer(): Buffer {
    return serializeToBuffer([
      this.note,
      this.contractAddress,
      this.storageSlot,
      this.noteTypeId,
      this.txHash,
      this.l2BlockNumber,
      Fr.fromHexString(this.l2BlockHash),
      this.nonce,
      this.noteHash,
      this.index,
      this.ovpkM,
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
    const index = toBigIntBE(reader.readBytes(32));
    const publicKey = Point.fromBuffer(reader);

    return new OutgoingNoteDao(
      note,
      contractAddress,
      storageSlot,
      noteTypeId,
      txHash,
      l2BlockNumber,
      l2BlockHash,
      nonce,
      noteHash,
      index,
      publicKey,
    );
  }

  toString() {
    return '0x' + this.toBuffer().toString('hex');
  }

  static fromString(str: string) {
    const hex = str.replace(/^0x/, '');
    return OutgoingNoteDao.fromBuffer(Buffer.from(hex, 'hex'));
  }

  /**
   * Returns the size in bytes of the Note Dao.
   * @returns - Its size in bytes.
   */
  public getSize() {
    const noteSize = 4 + this.note.items.length * Fr.SIZE_IN_BYTES;
    return noteSize + AztecAddress.SIZE_IN_BYTES + Fr.SIZE_IN_BYTES * 2 + TxHash.SIZE + Point.SIZE_IN_BYTES;
  }

  static async random({
    note = Note.random(),
    contractAddress = undefined,
    txHash = TxHash.random(),
    storageSlot = Fr.random(),
    noteTypeId = NoteSelector.random(),
    nonce = Fr.random(),
    l2BlockNumber = Math.floor(Math.random() * 1000),
    l2BlockHash = Fr.random().toString(),
    noteHash = Fr.random(),
    index = Fr.random().toBigInt(),
    ovpkM = undefined,
  }: Partial<OutgoingNoteDao> = {}) {
    return new OutgoingNoteDao(
      note,
      contractAddress ?? (await AztecAddress.random()),
      storageSlot,
      noteTypeId,
      txHash,
      l2BlockNumber,
      l2BlockHash,
      nonce,
      noteHash,
      index,
      ovpkM ?? (await Point.random()),
    );
  }
}
