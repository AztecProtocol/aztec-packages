import { Fr, Point, PublicKey } from '@aztec/circuits.js';
import { toBigIntBE, toBufferBE } from '@aztec/foundation/bigint-buffer';
import { BufferReader, ExtendedNote } from '@aztec/types';

/**
 * A note with contextual data.
 */
export class NoteDao {
  constructor(
    /** The extended note. */
    public extendedNote: ExtendedNote,
    /** The nonce of the note. */
    public nonce: Fr,
    /**
     * Inner note hash of the note. This is customizable by the app circuit.
     * We can use this value to compute siloedNoteHash and uniqueSiloedNoteHash.
     */
    public innerNoteHash: Fr,
    /** The nullifier of the note (siloed by contract address). */
    public siloedNullifier: Fr,
    /** The location of the relevant note in the note hash tree. */
    public index: bigint,
    /** The public key that was used to encrypt the data. */
    public publicKey: PublicKey,
  ) {}

  toBuffer(): Buffer {
    return Buffer.concat([
      this.extendedNote.toBuffer(),
      this.nonce.toBuffer(),
      this.innerNoteHash.toBuffer(),
      this.siloedNullifier.toBuffer(),
      toBufferBE(this.index, 32),
      this.publicKey.toBuffer(),
    ]);
  }
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);

    const extendedNote = ExtendedNote.fromBuffer(reader);
    const nonce = Fr.fromBuffer(reader);
    const innerNoteHash = Fr.fromBuffer(reader);
    const siloedNullifier = Fr.fromBuffer(reader);
    const index = toBigIntBE(reader.readBytes(32));
    const publicKey = Point.fromBuffer(reader);

    return new this(
      extendedNote,
      nonce,
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
    return NoteDao.fromBuffer(Buffer.from(hex, 'hex'));
  }

  /**
   * Returns the size in bytes of the extended note.
   * @returns - Its size in bytes.
   */
  public getSize() {
    // 7 fields + 1 bigint + 1 buffer size (4 bytes) + 1 buffer
    const indexSize = Math.ceil(Math.log2(Number(this.index)));
    return (
      this.extendedNote.note.items.length * Fr.SIZE_IN_BYTES + 7 * Fr.SIZE_IN_BYTES + 4 + indexSize + Point.SIZE_IN_BYTES
    );
  }
}
