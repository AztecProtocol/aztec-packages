import { Fr } from '@aztec/foundation/curves/bn254';
import { FieldReader } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { TxHash } from '@aztec/stdlib/tx';

// Note content is serialized as a BoundedVec: `storage[capacity] ++ len`. The storage capacity may differ across
// aztec-nr versions (e.g. old contracts used 9, current ones use 8), so we infer it dynamically from the total field
// count. This constant is only used to validate the *content length* (the BoundedVec `.len()`), not the storage size.
const MAX_NOTE_CONTENT_LEN = 8;

/**
 * Intermediate struct used to perform batch note validation by PXE. The `utilityValidateAndStoreEnqueuedNotesAndEvents` oracle
 * expects for values of this type to be stored in a `CapsuleArray`.
 */
export class NoteValidationRequest {
  constructor(
    public contractAddress: AztecAddress,
    public owner: AztecAddress,
    public storageSlot: Fr,
    public randomness: Fr,
    public noteNonce: Fr,
    public content: Fr[],
    public noteHash: Fr,
    public nullifier: Fr,
    public txHash: TxHash,
    public recipient: AztecAddress,
  ) {}

  static fromFields(fields: Fr[] | FieldReader): NoteValidationRequest {
    const reader = FieldReader.asReader(fields);

    const contractAddress = AztecAddress.fromField(reader.readField());
    const owner = AztecAddress.fromField(reader.readField());
    const storageSlot = reader.readField();
    const randomness = reader.readField();
    const noteNonce = reader.readField();

    // Infer BoundedVec storage size from total field count for backward compat with older aztec-nr versions.
    const FOOTER_FIELDS = 5; // 1 BoundedVec len + noteHash + nullifier + txHash + recipient
    const arraySize = reader.remainingFields() - FOOTER_FIELDS;

    const contentStorage = reader.readFieldArray(arraySize);
    const contentLen = reader.readField().toNumber();
    if (contentLen > MAX_NOTE_CONTENT_LEN) {
      throw new Error(`Note content length ${contentLen} exceeds MAX_NOTE_CONTENT_LEN ${MAX_NOTE_CONTENT_LEN}.`);
    }
    const content = contentStorage.slice(0, contentLen);

    const noteHash = reader.readField();
    const nullifier = reader.readField();
    const txHash = TxHash.fromField(reader.readField());
    const recipient = AztecAddress.fromField(reader.readField());

    return new NoteValidationRequest(
      contractAddress,
      owner,
      storageSlot,
      randomness,
      noteNonce,
      content,
      noteHash,
      nullifier,
      txHash,
      recipient,
    );
  }
}
