import { Fr } from '@aztec/foundation/fields';
import { FieldReader } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { TxHash } from '@aztec/stdlib/tx';

// TODO(#14617): should we compute this from constants? This value is aztec-nr specific.
const MAX_NOTE_PACKED_LEN = 12;

/**
 * Intermediate struct used to perform batch note validation by PXE. The `validateEnqueuedNotes` oracle expects for
 * values of this type to be stored in a `CapsuleArray`.
 */
export class NoteValidationRequest {
  constructor(
    public contractAddress: AztecAddress,
    public storageSlot: Fr,
    public nonce: Fr,
    public content: Fr[],
    public noteHash: Fr,
    public nullifier: Fr,
    public txHash: TxHash,
    public recipient: AztecAddress,
  ) {}

  static fromFields(fields: Fr[] | FieldReader): NoteValidationRequest {
    const reader = FieldReader.asReader(fields);

    const contractAddress = AztecAddress.fromField(reader.readField());
    const storageSlot = reader.readField();
    const nonce = reader.readField();

    const contentStorage = reader.readFieldArray(MAX_NOTE_PACKED_LEN);
    const contentLen = reader.readField().toNumber();
    const content = contentStorage.slice(0, contentLen);

    const noteHash = reader.readField();
    const nullifier = reader.readField();
    const txHash = TxHash.fromField(reader.readField());
    const recipient = AztecAddress.fromField(reader.readField());

    return new NoteValidationRequest(
      contractAddress,
      storageSlot,
      nonce,
      content,
      noteHash,
      nullifier,
      txHash,
      recipient,
    );
  }
}
