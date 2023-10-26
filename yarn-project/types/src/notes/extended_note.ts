import { AztecAddress, Fr, Point, PublicKey } from '@aztec/circuits.js';
import { toBigIntBE, toBufferBE } from '@aztec/foundation/bigint-buffer';
import { BufferReader, NotePreimage, TxHash } from '@aztec/types';

/**
 * A note with contextual data.
 */
export class ExtendedNote {
  constructor(
    /** The preimage of the note, containing essential information about the note. */
    public notePreimage: NotePreimage,
    /** The contract address this note is created in. */
    public contractAddress: AztecAddress,
    /** The hash of the tx the note was created in. */
    public txHash: TxHash,
    /** The nonce of the note. */
    public nonce: Fr,
    /** The specific storage location of the note on the contract. */
    public storageSlot: Fr,
    /**
     * Inner note hash of the note. This is customizable by the app circuit.
     * We can use this value to compute siloedNoteHash and uniqueSiloedNoteHash.
     */
    public innerNoteHash: Fr,
    /**
     * The nullifier of the note (siloed by contract address).
     */
    public siloedNullifier: Fr,
    /**
     * The location of the relevant note in the note hash tree.
     */
    public index: bigint,
    /**
     * The public key that was used to encrypt the data.
     */
    public publicKey: PublicKey,
  ) {}

  toBuffer(): Buffer {
    return Buffer.concat([
      this.notePreimage.toBuffer(),
      this.contractAddress.toBuffer(),
      this.txHash.buffer,
      this.nonce.toBuffer(),
      this.storageSlot.toBuffer(),
      this.innerNoteHash.toBuffer(),
      this.siloedNullifier.toBuffer(),
      toBufferBE(this.index, 32),
      this.publicKey.toBuffer(),
    ]);
  }
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);

    const notePreimage = NotePreimage.fromBuffer(reader);
    const contractAddress = AztecAddress.fromBuffer(reader);
    const txHash = new TxHash(reader.readBytes(TxHash.SIZE));
    const nonce = Fr.fromBuffer(reader);
    const storageSlot = Fr.fromBuffer(reader);
    const innerNoteHash = Fr.fromBuffer(reader);
    const siloedNullifier = Fr.fromBuffer(reader);
    const index = toBigIntBE(reader.readBytes(32));
    const publicKey = Point.fromBuffer(reader);

    return new this(
      notePreimage,
      contractAddress,
      txHash,
      nonce,
      storageSlot,
      innerNoteHash,
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
    return ExtendedNote.fromBuffer(Buffer.from(hex, 'hex'));
  }

  /**
   * Returns the size in bytes of a note spending info dao.
   * @param note - The note.
   * @returns - Its size in bytes.
   */
  public getSize(note: ExtendedNote) {
    // 7 fields + 1 bigint + 1 buffer size (4 bytes) + 1 buffer
    const indexSize = Math.ceil(Math.log2(Number(note.index)));
    return (
      note.notePreimage.items.length * Fr.SIZE_IN_BYTES + 7 * Fr.SIZE_IN_BYTES + 4 + indexSize + Point.SIZE_IN_BYTES
    );
  }
}
