import { Note, TxHash } from '@aztec/circuit-types';
import { AztecAddress, Fr, Point, PublicKey } from '@aztec/circuits.js';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

/**
 * A note that is intended for us, but it's incomplete.
 * So keep the state that we need to complete it later.
 */
export class PartialNoteDao {
  constructor(
    /** The public key associated with this note */
    public publicKey: PublicKey,
    /** The note as emitted from the Noir contract. */
    public note: Note,
    /** The contract address this note is created in. */
    public contractAddress: AztecAddress,
    /** The specific storage location of the note on the contract. */
    public storageSlot: Fr,
    /** The type ID of the note on the contract. */
    public noteTypeId: Fr,
    /** The hash of the tx the note was created in. Equal to the first nullifier */
    public txHash: TxHash,
    /** The siloed note hash */
    public siloedNoteHash: Fr,
  ) {}

  toBuffer(): Buffer {
    return serializeToBuffer(
      this.publicKey.toBuffer(),
      this.note.toBuffer(),
      this.contractAddress.toBuffer(),
      this.storageSlot.toBuffer(),
      this.noteTypeId.toBuffer(),
      this.txHash.toBuffer(),
      this.siloedNoteHash,
    );
  }
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PartialNoteDao(
      reader.readObject(Point),
      reader.readObject(Note),
      reader.readObject(AztecAddress),
      reader.readObject(Fr),
      reader.readObject(Fr),
      reader.readObject(TxHash),
      reader.readObject(Fr),
    );
  }
}
