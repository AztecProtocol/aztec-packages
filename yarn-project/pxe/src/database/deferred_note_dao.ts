import { L1NotePayload, TxHash, UnencryptedTxL2Logs } from '@aztec/circuit-types';
import { Fr, Point, type PublicKey, Vector } from '@aztec/circuits.js';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

/**
 * A note that is intended for us, but we cannot decode it yet because the contract is not yet in our database.
 *
 * So keep the state that we need to decode it later.
 */
export class DeferredNoteDao {
  constructor(
    /** Address Point or OvpkM (depending on if incoming or outgoing) the note was encrypted with. */
    public publicKey: PublicKey,
    /** The note payload delivered via L1. */
    public payload: L1NotePayload,
    /** The hash of the tx the note was created in. Equal to the first nullifier */
    public txHash: TxHash,
    /** New note hashes in this transaction, one of which belongs to this note */
    public noteHashes: Fr[],
    /** The next available leaf index for the note hash tree for this transaction */
    public dataStartIndexForTx: number,
    /** Unencrypted logs for the transaction (used to complete partial notes) */
    public unencryptedLogs: UnencryptedTxL2Logs,
  ) {}

  toBuffer(): Buffer {
    return serializeToBuffer(
      this.publicKey,
      this.payload,
      this.txHash,
      new Vector(this.noteHashes),
      this.dataStartIndexForTx,
      this.unencryptedLogs,
    );
  }
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new DeferredNoteDao(
      reader.readObject(Point),
      reader.readObject(L1NotePayload),
      reader.readObject(TxHash),
      reader.readVector(Fr),
      reader.readNumber(),
      reader.readObject(UnencryptedTxL2Logs),
    );
  }
}
